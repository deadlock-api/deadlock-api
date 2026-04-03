"""
Canary deployer service for deadlock-api.

Listens for Watchtower webhooks, then orchestrates a canary deployment
by gradually shifting traffic from api-stable to api-canary via Caddy's
admin API. Rolls back automatically if the canary error rate exceeds
the configured threshold.

Uses the Docker SDK directly — no compose file or volume mounts needed.
The canary container is cloned from the running stable container's config.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import docker
import docker.errors
import httpx
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request, Response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("deployer")

HEALTH_PATH = "/v1/info/health"
CANARY_NAME = "api-canary"
STABLE_NAME = "api-stable"


@dataclass(frozen=True)
class Config:
    caddy_api: str = os.getenv("CADDY_API", "http://caddy:2019")
    stable_upstream: str = os.getenv("STABLE_UPSTREAM", "api-stable:3000")
    canary_upstream: str = os.getenv("CANARY_UPSTREAM", "api-canary:3000")
    domain: str = os.getenv("DOMAIN", "api.deadlock-api.com")
    error_threshold: int = int(os.getenv("ERROR_THRESHOLD", "5"))
    canary_steps: list[int] = field(
        default_factory=lambda: [
            int(s) for s in os.getenv("CANARY_STEPS", "10,25,50,100").split(",")
        ]
    )
    step_observe_seconds: int = int(os.getenv("STEP_OBSERVE_SECONDS", "60"))
    health_timeout: int = int(os.getenv("HEALTH_TIMEOUT", "60"))
    image_name: str = os.getenv(
        "IMAGE_NAME", "ghcr.io/deadlock-api/deadlock-api"
    )
    image_tag: str = os.getenv("IMAGE_TAG", "latest")
    tls: bool = os.getenv("TLS", "true").lower() == "true"


cfg = Config()
_docker_client: docker.DockerClient | None = None


def _get_docker() -> docker.DockerClient:
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


class DeployState:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self.deploying = False

    async def try_start(self) -> bool:
        async with self._lock:
            if self.deploying:
                return False
            self.deploying = True
            return True

    async def finish(self) -> None:
        async with self._lock:
            self.deploying = False


state = DeployState()


def _pull_image() -> docker.models.images.Image:
    log.info("Pulling %s:%s...", cfg.image_name, cfg.image_tag)
    image = _get_docker().images.pull(cfg.image_name, tag=cfg.image_tag)
    log.info("Pulled %s", image.id[:19])
    return image


def _remove_container(name: str) -> None:
    try:
        c = _get_docker().containers.get(name)
        c.stop(timeout=10)
        c.remove()
        log.info("Removed container %s", name)
    except docker.errors.NotFound:
        pass


def _clone_container_as_canary(image: docker.models.images.Image) -> docker.models.containers.Container:
    """Create a canary container by cloning the stable container's config."""
    client = _get_docker()

    try:
        stable = client.containers.get(STABLE_NAME)
    except docker.errors.NotFound:
        raise RuntimeError(f"Stable container '{STABLE_NAME}' not found")

    attrs = stable.attrs
    config = attrs["Config"]
    host_config = attrs["HostConfig"]
    network_settings = attrs["NetworkSettings"]["Networks"]

    # Clean up any leftover canary
    _remove_container(CANARY_NAME)

    # Extract volume binds and mounts
    binds = host_config.get("Binds") or []
    mounts = host_config.get("Mounts")

    # Extract healthcheck
    healthcheck = config.get("Healthcheck")

    # Extract resource limits
    mem_limit = host_config.get("Memory", 0)
    nano_cpus = host_config.get("NanoCpus", 0)

    # Extract log config
    log_config = host_config.get("LogConfig")

    # Build environment, preserving all env vars from stable
    environment = config.get("Env") or []

    # Extract restart policy
    restart_policy = host_config.get("RestartPolicy") or {"Name": "always"}

    # Figure out which networks stable is connected to
    networks = list(network_settings.keys())

    # Create canary — connect to first network during creation
    first_network = networks[0] if networks else None
    networking_config = None
    if first_network:
        networking_config = client.api.create_networking_config({
            first_network: client.api.create_endpoint_config()
        })

    # Build host config
    host_config_kwargs = {
        "binds": binds,
        "restart_policy": restart_policy,
    }
    if mem_limit:
        host_config_kwargs["mem_limit"] = mem_limit
    if nano_cpus:
        host_config_kwargs["nano_cpus"] = nano_cpus
    if log_config:
        host_config_kwargs["log_config"] = docker.types.LogConfig(
            type=log_config.get("Type", "json-file"),
            config=log_config.get("Config", {}),
        )

    # Use the labels from stable but update container name reference
    labels = dict(config.get("Labels") or {})

    container_id = client.api.create_container(
        image=image.id,
        name=CANARY_NAME,
        environment=environment,
        healthcheck=healthcheck,
        labels=labels,
        host_config=client.api.create_host_config(**host_config_kwargs),
        networking_config=networking_config,
    )

    # Connect to remaining networks
    for net in networks[1:]:
        client.api.connect_container_to_network(container_id["Id"], net)

    client.api.start(container_id["Id"])
    log.info("Started canary container from image %s", image.id[:19])
    return client.containers.get(CANARY_NAME)


def _recreate_stable(image: docker.models.images.Image) -> None:
    """Recreate the stable container with the new image, preserving its config."""
    client = _get_docker()

    try:
        stable = client.containers.get(STABLE_NAME)
    except docker.errors.NotFound:
        raise RuntimeError(f"Stable container '{STABLE_NAME}' not found")

    attrs = stable.attrs
    config = attrs["Config"]
    host_config = attrs["HostConfig"]
    network_settings = attrs["NetworkSettings"]["Networks"]

    binds = host_config.get("Binds") or []
    healthcheck = config.get("Healthcheck")
    mem_limit = host_config.get("Memory", 0)
    nano_cpus = host_config.get("NanoCpus", 0)
    log_config = host_config.get("LogConfig")
    environment = config.get("Env") or []
    restart_policy = host_config.get("RestartPolicy") or {"Name": "always"}
    labels = dict(config.get("Labels") or {})
    networks = list(network_settings.keys())

    # Stop and remove old stable
    stable.stop(timeout=10)
    stable.remove()
    log.info("Removed old stable container")

    first_network = networks[0] if networks else None
    networking_config = None
    if first_network:
        networking_config = client.api.create_networking_config({
            first_network: client.api.create_endpoint_config()
        })

    host_config_kwargs = {
        "binds": binds,
        "restart_policy": restart_policy,
    }
    if mem_limit:
        host_config_kwargs["mem_limit"] = mem_limit
    if nano_cpus:
        host_config_kwargs["nano_cpus"] = nano_cpus
    if log_config:
        host_config_kwargs["log_config"] = docker.types.LogConfig(
            type=log_config.get("Type", "json-file"),
            config=log_config.get("Config", {}),
        )

    container_id = client.api.create_container(
        image=image.id,
        name=STABLE_NAME,
        environment=environment,
        healthcheck=healthcheck,
        labels=labels,
        host_config=client.api.create_host_config(**host_config_kwargs),
        networking_config=networking_config,
    )

    for net in networks[1:]:
        client.api.connect_container_to_network(container_id["Id"], net)

    client.api.start(container_id["Id"])
    log.info("Started new stable container from image %s", image.id[:19])


async def _container_healthy(name: str, timeout: int | None = None) -> bool:
    timeout = timeout if timeout is not None else cfg.health_timeout
    for _ in range(timeout // 2):
        try:
            container = await asyncio.to_thread(_get_docker().containers.get, name)
            attrs = await asyncio.to_thread(getattr, container, "attrs")
            health = attrs.get("State", {}).get("Health", {})
            if health.get("Status") == "healthy":
                return True
        except docker.errors.NotFound:
            pass
        await asyncio.sleep(2)
    return False


async def _stop_canary() -> None:
    await asyncio.to_thread(_remove_container, CANARY_NAME)


async def _apply_canary_weight(
    client: httpx.AsyncClient, canary_pct: int
) -> None:
    """Push a Caddy config routing canary_pct% of traffic to the canary."""
    stable_pct = 100 - canary_pct

    if canary_pct == 0:
        upstreams = [{"dial": cfg.stable_upstream}]
        lb_policy = {"policy": "first"}
    elif canary_pct == 100:
        upstreams = [{"dial": cfg.canary_upstream}]
        lb_policy = {"policy": "first"}
    else:
        upstreams = [
            {"dial": cfg.stable_upstream},
            {"dial": cfg.canary_upstream},
        ]
        lb_policy = {
            "policy": "weighted_round_robin",
            "weights": [stable_pct, canary_pct],
        }

    listen = [":443", ":80"] if cfg.tls else [":80"]

    config = {
        "apps": {
            "http": {
                "servers": {
                    "main": {
                        "listen": listen,
                        "routes": [
                            {
                                "match": [{"host": [cfg.domain]}],
                                "handle": [
                                    {
                                        "handler": "reverse_proxy",
                                        "upstreams": upstreams,
                                        "load_balancing": lb_policy,
                                        "health_checks": {
                                            "active": {
                                                "uri": HEALTH_PATH,
                                                "interval": "5s",
                                                "timeout": "3s",
                                            },
                                            "passive": {
                                                "fail_duration": "30s",
                                                "max_fails": 3,
                                                "unhealthy_status": [
                                                    500,
                                                    502,
                                                    503,
                                                ],
                                            },
                                        },
                                    }
                                ],
                            }
                        ],
                    }
                }
            }
        }
    }

    resp = await client.post(f"{cfg.caddy_api}/load", json=config)
    resp.raise_for_status()
    log.info("Applied weights: stable=%d%% canary=%d%%", stable_pct, canary_pct)


async def _get_upstream_snapshot(
    client: httpx.AsyncClient,
) -> tuple[int, int]:
    """Return (num_requests, fails) for the canary upstream."""
    try:
        resp = await client.get(f"{cfg.caddy_api}/reverse_proxy/upstreams")
        resp.raise_for_status()
        stats = resp.json()
    except (httpx.HTTPError, json.JSONDecodeError):
        log.warning("Failed to fetch upstream stats from Caddy")
        return (0, 0)

    for upstream in stats:
        if upstream.get("address") == cfg.canary_upstream:
            return (
                upstream.get("num_requests", 0),
                upstream.get("fails", 0),
            )
    return (0, 0)


def _windowed_error_rate(
    before: tuple[int, int], after: tuple[int, int]
) -> float:
    """Compute error rate for the observation window between two snapshots."""
    requests_delta = after[0] - before[0]
    fails_delta = after[1] - before[1]
    if requests_delta <= 0:
        return 0.0
    return (fails_delta / requests_delta) * 100.0


async def _promote(client: httpx.AsyncClient, image: docker.models.images.Image) -> None:
    log.info("Canary passed all steps. Promoting to stable...")
    await _apply_canary_weight(client, 100)

    await asyncio.to_thread(_recreate_stable, image)

    log.info("Waiting for new stable to become healthy...")
    if not await _container_healthy(STABLE_NAME):
        log.error("New stable never became healthy! Keeping canary as primary.")
        return

    await _apply_canary_weight(client, 0)
    await _stop_canary()
    log.info("Deployment complete. New version is stable.")


async def deploy() -> None:
    if not await state.try_start():
        log.warning("Deploy already in progress, skipping.")
        return

    canary_started = False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            log.info("Starting canary deployment...")

            image = await asyncio.to_thread(_pull_image)
            await asyncio.to_thread(_clone_container_as_canary, image)
            canary_started = True

            log.info("Waiting for canary to become healthy...")
            if not await _container_healthy(CANARY_NAME):
                log.error("Canary never became healthy. Aborting.")
                await _stop_canary()
                return

            log.info("Canary is healthy. Starting traffic shift...")

            for pct in cfg.canary_steps:
                await _apply_canary_weight(client, pct)

                log.info(
                    "Observing at %d%% canary for %ds...",
                    pct,
                    cfg.step_observe_seconds,
                )
                before = await _get_upstream_snapshot(client)
                await asyncio.sleep(cfg.step_observe_seconds)
                after = await _get_upstream_snapshot(client)

                error_rate = _windowed_error_rate(before, after)
                log.info("Canary error rate this window: %.1f%%", error_rate)

                if error_rate > cfg.error_threshold:
                    log.warning("ROLLING BACK - error rate exceeded threshold")
                    await _apply_canary_weight(client, 0)
                    await _stop_canary()
                    log.info("Rollback complete. All traffic on stable.")
                    return

                log.info("Step %d%% passed.", pct)

            await _promote(client, image)
    except Exception:
        log.exception("Unexpected error during deployment")
        if canary_started:
            try:
                await _stop_canary()
            except Exception:
                log.exception("Failed to stop canary during cleanup")
    finally:
        await state.finish()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info(
        "Deployer started — domain=%s steps=%s observe=%ds threshold=%d%%",
        cfg.domain,
        cfg.canary_steps,
        cfg.step_observe_seconds,
        cfg.error_threshold,
    )
    yield


app = FastAPI(title="deadlock-api deployer", lifespan=lifespan)


async def _trigger_deploy(background_tasks: BackgroundTasks) -> Response:
    if not await state.try_start():
        await state.finish()
        return Response(status_code=409, content="deploy in progress")
    await state.finish()
    background_tasks.add_task(deploy)
    return Response(status_code=202, content="deploy started")


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks) -> Response:
    body = await request.body()
    body_text = body.decode(errors="replace").lower()

    image_trigger = cfg.image_name.rsplit("/", 1)[-1].lower()
    if image_trigger not in body_text:
        log.info("Webhook received but not for our image, ignoring.")
        return Response(status_code=200, content="ignored")

    log.info("Webhook triggered canary deploy.")
    return await _trigger_deploy(background_tasks)


@app.post("/deploy")
async def manual_deploy(background_tasks: BackgroundTasks) -> Response:
    log.info("Manual deploy triggered.")
    return await _trigger_deploy(background_tasks)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "deploying": state.deploying}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
