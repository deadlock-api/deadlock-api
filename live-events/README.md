# Deadlock Live Events API

A real-time API server that streams live game events from [Deadlock](https://store.steampowered.com/app/1422450/Deadlock/) matches using Server-Sent Events (SSE). It parses live demo files from ongoing matches and exposes structured entity updates — player stats, NPC health, positions, chat messages, and more — through HTTP endpoints.

## Setup (Docker)

You don't need to clone this repository. You only need two files: a `.env` file and `docker-compose.yaml`.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed

### 1. Create a project directory

```bash
mkdir deadlock-live-events && cd deadlock-live-events
```

### 2. Create the `.env` file

```bash
echo "DEADLOCK_API_KEY=..." > .env
```

Replace `...` with your [Deadlock API](https://deadlock-api.com) key. The key is **optional** — the server works without one, but having a key gives you higher rate limits on the upstream Deadlock API.

### 3. Create `docker-compose.yaml`

```yaml
services:
  api:
    image: ghcr.io/deadlock-api/deadlock-live-events:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
```

Change the left side of the port mapping (e.g. `"8080:3000"`) if port 3000 is already in use.

### 4. Start the server

```bash
docker compose up -d
```

The API is now running at `http://localhost:3000`.

### Verify it's running

```bash
docker compose logs -f
```

To stop the server:

```bash
docker compose down
```

To update to the latest version:

```bash
docker compose pull && docker compose up -d
```

## API Endpoints

### Stream Live Events (SSE)

```
GET /v1/matches/{match_id}/live/demo/events
```

Streams real-time game events as [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). The server connects to the live match, waits for the demo to become available (up to ~30 seconds), and then begins streaming parsed events.

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `subscribed_entities` | comma-separated string | all entities | Filter to specific entity types (see list below) |
| `subscribed_chat_messages` | boolean | `false` | Include in-game chat messages |

#### Example Requests

Stream all events from a match:

```bash
curl -N http://localhost:3000/v1/matches/28850808/live/demo/events
```

Stream only player and team data:

```bash
curl -N http://localhost:3000/v1/matches/28850808/live/demo/events?subscribed_entities=player_controller,player_pawn,team
```

Stream events with chat messages:

```bash
curl -N http://localhost:3000/v1/matches/28850808/live/demo/events?subscribed_chat_messages=true&subscribed_entities=player_controller
```

#### Connection Event

On connection, the stream sends an initial `message` event with metadata:

```json
{
  "status": "connected",
  "message": "Connected to demo event stream.",
  "all_event_names": ["game_rules_proxy_entity_created", "..."]
}
```

#### SSE Event Names

Each entity type produces three event names:

- `{entity_type}_entity_created` — entity appeared in the game
- `{entity_type}_entity_updated` — entity properties changed
- `{entity_type}_entity_deleted` — entity was removed

Additional event names:

- `chat_message` — in-game chat (requires `subscribed_chat_messages=true`)
- `tick_end` — marks the end of a game tick
- `end` — the demo stream has ended

> **Note:** Standard `EventSource` only listens to the default `message` event. Since this API uses named events, you need to add listeners for each event name, or use a library like [sse.js](https://github.com/nicois/sse.js) that supports named events.

#### Entity Types

| Entity Type | Description | Key Fields |
|---|---|---|
| `game_rules_proxy` | Game state and timing | `game_start_time`, `game_paused`, `total_paused_ticks` |
| `player_controller` | Player stats and info | `steam_id`, `steam_name`, `hero_id`, `kills`, `deaths`, `assists`, `net_worth`, `hero_damage` |
| `player_pawn` | Player character state | `position`, `health`, `max_health`, `level`, `hero_build_id` |
| `team` | Team info | `team`, `score`, `teamname` |
| `mid_boss` | Mid boss NPC | `health`, `max_health`, `position`, `team` |
| `trooper` | Lane trooper | `health`, `max_health`, `position`, `lane`, `team` |
| `trooper_neutral` | Neutral camp trooper | `health`, `max_health`, `position` |
| `trooper_boss` | Boss trooper | `health`, `max_health`, `position`, `lane`, `team` |
| `trooper_barrack_boss` | Barrack boss | `health`, `max_health`, `position`, `lane`, `team` |
| `shielded_sentry` | Shielded sentry | `health`, `max_health`, `position`, `shield_active` |
| `base_defense_sentry` | Base defense sentry | `health`, `max_health`, `position`, `team` |
| `boss_tier2` | Tier 2 boss | `health`, `max_health`, `position`, `team` |
| `boss_tier3` | Tier 3 boss | `health`, `max_health`, `position`, `team` |
| `breakable_prop` | Breakable object | `position` |
| `breakable_prop_modifier_pickup` | Modifier orb pickup | `position`, `active` |
| `breakable_prop_gold_pickup` | Gold orb pickup | `position`, `active` |
| `punchable_powerup` | Punchable urn/powerup | `position` |
| `destroyable_building` | Guardian / Walker / etc. | `health`, `max_health`, `position`, `team` |
| `sinners_sacrifice` | Sinners sacrifice objective | `health`, `max_health`, `position` |
| `ability_melee_parry` | Melee parry event | `owner_entity`, `attack_parried`, `start_time`, `success_time` |

#### Example Event Payloads

**Player Controller Update:**

```json
{
  "tick": 5432,
  "game_time": 245.6,
  "event_type": "entity_update",
  "delta": "update",
  "entity_index": 3,
  "entity_type": "player_controller",
  "steam_id": 123456789,
  "steam_name": "PlayerOne",
  "team": 2,
  "hero_id": 15,
  "kills": 4,
  "deaths": 1,
  "assists": 7,
  "net_worth": 12350,
  "hero_damage": 8420
}
```

**NPC Update:**

```json
{
  "tick": 5433,
  "game_time": 245.7,
  "event_type": "entity_update",
  "delta": "create",
  "entity_index": 87,
  "entity_type": "trooper",
  "health": 275,
  "max_health": 275,
  "position": [1234.5, -678.9, 128.0],
  "lane": 1,
  "team": 2
}
```

**Chat Message:**

```json
{
  "tick": 5500,
  "game_time": 250.0,
  "event_type": "chat_message",
  "steam_name": "PlayerOne",
  "steam_id": 123456789,
  "text": "gg",
  "all_chat": true,
  "lane_color": 3
}
```

### Stream Raw Demo

```
GET /v1/matches/{match_id}/live/demo
```

Streams the raw demo file bytes as a binary stream. Use this if you want to process the demo file yourself with external tools.

```bash
curl -N http://localhost:3000/v1/matches/28850808/live/demo --output match.dem
```

## JavaScript/TypeScript Example

```js
const eventSource = new EventSource(
  "http://localhost:3000/v1/matches/28850808/live/demo/events?subscribed_entities=player_controller,team"
);

// Listen for the initial connection message
eventSource.addEventListener("message", (e) => {
  console.log("Connected:", JSON.parse(e.data));
});

// Listen for player updates
eventSource.addEventListener("player_controller_entity_updated", (e) => {
  const player = JSON.parse(e.data);
  console.log(`${player.steam_name}: ${player.kills}/${player.deaths}/${player.assists}`);
});

// Listen for team score changes
eventSource.addEventListener("team_entity_updated", (e) => {
  const team = JSON.parse(e.data);
  console.log(`Team ${team.teamname}: ${team.score}`);
});

// Listen for stream end
eventSource.addEventListener("end", () => {
  console.log("Match stream ended");
  eventSource.close();
});

eventSource.onerror = (e) => console.error("SSE error:", e);
```

## Building from Source

Requires Rust 1.93+, protobuf-compiler, and libprotobuf-dev.

```bash
git clone https://github.com/deadlock-api/deadlock-live-events.git
cd deadlock-live-events
cp .env.example .env
cargo run --release
```

Or build with Docker locally:

```bash
docker compose up -d --build
```

## License

[MIT](LICENSE)
