import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Layers, Loader2, Terminal } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect } from "react";
import type { MetaFunction } from "react-router";
import { useNavigate } from "react-router";

import { CommandBuilder } from "~/components/streamkit/command/CommandBuilder";
import { WidgetBuilder } from "~/components/streamkit/widget-builder";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useSteamAuthCallback } from "~/hooks/useSteamAuthCallback";
import { API_ORIGIN } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { steamId64ToSteamId3 } from "~/lib/patron-api";
import { generateSteamAuthUrl } from "~/lib/steam-auth";
import { queryKeys } from "~/queries/query-keys";

const regions = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Stream Toolkit & OBS Widgets | Deadlock API",
    description:
      "Build chat commands and OBS widgets for your Deadlock stream. Show live stats, match history, and more.",
    path: "/streamkit",
  });
};

export default function StreamKit() {
  const [steamId, setSteamId] = useQueryState("steamid", parseAsString.withDefault(""));
  const [region, setRegion] = useQueryState("region", parseAsString.withDefault(""));
  const { steamId64 } = useSteamAuthCallback();
  const navigate = useNavigate();
  const posthog = usePostHog();

  useEffect(() => {
    if (!steamId64) return;

    const id3 = steamId64ToSteamId3(steamId64);
    setSteamId(id3.toString());
    posthog?.capture("streamkit_steam_connected", { steam_id3: id3 });

    // Clean openid params from URL, keep steamid and region
    const newParams = new URLSearchParams();
    newParams.set("steamid", id3.toString());
    if (region) newParams.set("region", region);
    navigate(`/streamkit?${newParams.toString()}`, { replace: true });
  }, [steamId64, setSteamId, region, navigate, posthog]);

  const parseSteamId = (input: string) => {
    try {
      let extractedSteamId = BigInt(
        input
          .replace(/\[U:\d+:/g, "")
          .replace(/U:\d+:/g, "")
          .replace(/\[STEAM_0:\d+:/g, "")
          .replace(/STEAM_0:\d+:/g, "")
          .replace(/]/g, ""),
      );
      if (extractedSteamId > 76561197960265728n) extractedSteamId -= 76561197960265728n;
      return extractedSteamId.toString();
    } catch (err) {
      console.error("Failed to parse Steam ID:", err);
      return input;
    }
  };

  const fetchSteamName = async (r: string, id: string) => {
    if (!id) return null;
    if (!r) return null;
    const url = new URL(`${API_ORIGIN}/v1/commands/variables/resolve`);
    url.searchParams.append("region", r);
    url.searchParams.append("account_id", id);
    url.searchParams.append("variables", "steam_account_name");
    const res = await fetch(url);
    return (await res.json()).steam_account_name;
  };

  const {
    data: steamAccountName,
    isLoading: steamAccountLoading,
    error: steamAccountError,
  } = useQuery<string>({
    queryKey: queryKeys.steam.name(region, steamId),
    queryFn: () => fetchSteamName(region, steamId),
  });

  const isAccountConnected = steamAccountName && !steamAccountLoading && !steamAccountError;

  return (
    <div className="space-y-6">
      {/* Hero Section — matches patron/index hero pattern */}
      <section className="relative space-y-4 py-6 text-center">
        <div className="pointer-events-none absolute inset-0 -top-12 flex items-center justify-center" aria-hidden>
          <div className="h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="relative space-y-3">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">Stream Kit</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Build chat commands and OBS widgets for your Deadlock stream
          </p>
        </div>
      </section>

      {/* Account Setup */}
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr]">
          {/* Manual input */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Connect Your Account</h3>
              <p className="text-sm text-muted-foreground">Enter your Steam ID manually</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="steamid-input">Steam ID3</Label>
              <Input
                id="steamid-input"
                type="number"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="e.g. 123456789"
              />
              <p className="text-xs text-muted-foreground">
                Find it in your Steam profile URL or with a Steam ID finder tool.
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden items-center md:flex">
            <div className="relative flex h-full flex-col items-center justify-center">
              <div className="h-full w-px bg-border" />
              <span className="absolute bg-card px-2 text-xs font-medium text-muted-foreground uppercase">or</span>
            </div>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground uppercase">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Quick connect */}
          <div className="flex flex-col items-center justify-center gap-3 md:items-start">
            <div className="space-y-1 text-center md:text-left">
              <h3 className="font-semibold text-foreground">Quick Connect</h3>
              <p className="text-sm text-muted-foreground">Sign in directly with Steam</p>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-[#2a2f3a] bg-[#171a21] font-semibold hover:bg-[#1f232b] sm:w-auto"
              onClick={() => {
                const returnPath = region ? `/streamkit?region=${encodeURIComponent(region)}` : "/streamkit";
                window.location.href = generateSteamAuthUrl({ returnPath });
              }}
            >
              <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146V8.91a4.528 4.528 0 0 1 4.524-4.524 4.528 4.528 0 0 1 4.524 4.524 4.528 4.528 0 0 1-4.524 4.524h-.105l-4.08 2.911c0 .052.004.105.004.158a3.39 3.39 0 0 1-3.39 3.393 3.396 3.396 0 0 1-3.349-2.878L.533 15.34A11.98 11.98 0 0 0 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
              </svg>
              Sign in with Steam
            </Button>
          </div>
        </div>

        {/* Region selector — inside account card */}
        <div className="mt-5 space-y-2 border-t border-border pt-5">
          <Label>Region</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={region}
            onValueChange={(v) => v && setRegion(v)}
            className="w-full flex-wrap"
          >
            {regions.map((r) => (
              <ToggleGroupItem key={r} value={r} className="flex-1">
                {r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Account status */}
        {steamId && region && (
          <div className="mt-5 border-t border-border pt-5">
            {steamAccountLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Fetching Steam account...
              </div>
            ) : steamAccountError || !steamAccountName ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to fetch Steam account name. Please make sure you entered a valid Steam ID3 and region.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="size-4 text-green-500" />
                <span className="text-muted-foreground">
                  Found Steam account:{" "}
                  <span className="font-semibold text-foreground">
                    {steamAccountName} ({steamId})
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Builder Grid */}
      {isAccountConnected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Command Builder */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <Terminal className="size-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Command Builder</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Create dynamic chatbot commands</p>
              </div>
            </div>
            <CommandBuilder region={region} accountId={parseSteamId(steamId)} />
          </section>

          {/* Widget Builder */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <Layers className="size-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Widget Builder</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Build OBS overlays for your stream</p>
              </div>
            </div>
            <WidgetBuilder region={region} accountId={parseSteamId(steamId)} />
          </section>
        </div>
      )}
    </div>
  );
}
