import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useSearchParams } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import CommandBuilder from "~/components/streamkit/command/CommandBuilder";
import WidgetBuilder from "~/components/streamkit/widget-builder";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { API_ORIGIN } from "~/lib/constants";
import { steamId64ToSteamId3 } from "~/lib/patron-api";
import { extractSteamId, generateSteamAuthUrl, validateSteamResponse } from "~/lib/steam-auth";

const regions = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;

export const meta: MetaFunction = () => {
  return [
    { title: "Deadlock Stream Kit" },
    { name: "description", content: "Build chat commands and OBS widgets for your Deadlock stream" },
  ];
};

export default function StreamKit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [steamId, setSteamId] = useState(searchParams.get("steamid") ?? "");
  const [region, setRegion] = useState(searchParams.get("region") ?? "");

  useEffect(() => {
    if (!validateSteamResponse(searchParams)) return;

    const claimedId = searchParams.get("openid.claimed_id");
    if (!claimedId) return;

    const steamId64 = extractSteamId(claimedId);
    if (!steamId64) return;

    const id3 = steamId64ToSteamId3(steamId64);
    setSteamId(id3.toString());

    // Clean openid params from URL, keep region
    const regionParam = searchParams.get("region");
    const newParams = new URLSearchParams();
    if (regionParam) newParams.set("region", regionParam);
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const parseSteamId = (steamId: string) => {
    try {
      let extractedSteamId = BigInt(
        steamId
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
      return steamId;
    }
  };

  const fetchSteamName = async (region: string, steamId: string) => {
    if (!steamId) return null;
    if (!region) return null;
    const url = new URL(`${API_ORIGIN}/v1/commands/variables/resolve`);
    url.searchParams.append("region", region);
    url.searchParams.append("account_id", steamId);
    url.searchParams.append("variables", "steam_account_name");
    const res = await fetch(url);
    return (await res.json()).steam_account_name;
  };

  const {
    data: steamAccountName,
    isLoading: steamAccountLoading,
    error: steamAccountError,
  } = useQuery<string>({
    queryKey: ["steamName", region, steamId],
    queryFn: () => fetchSteamName(region, steamId),
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Deadlock Stream Kit</h1>
        <p className="text-sm text-muted-foreground">
          Connect your Steam account to build chat commands and OBS widgets for your stream.
        </p>
      </div>

      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account Identification</h2>

        <div className="flex flex-col sm:flex-row items-stretch gap-4">
          {/* Manual input */}
          <div className="flex-1 space-y-2">
            <Label>Steam ID3</Label>
            <Input
              type="number"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="e.g. 123456789"
            />
            <p className="text-xs text-muted-foreground">
              Find it in your Steam profile URL or with a Steam ID finder tool.
            </p>
          </div>

          {/* "or" divider — vertical on desktop, horizontal on mobile */}
          <div className="flex sm:flex-col items-center gap-2 sm:py-2">
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-border sm:h-full" />
            <span className="text-xs uppercase text-muted-foreground shrink-0">or</span>
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-border sm:h-full" />
          </div>

          {/* Quick connect */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Quick Connect</span>
            <Button
              variant="outline"
              className="w-full max-w-56"
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

        {/* Region selector */}
        <div className="border-t border-border pt-4 space-y-2">
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

        {steamId && region && (
          <div className="border-t border-border pt-4">
            {steamAccountLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoadingLogo />
                Fetching Steam account...
              </div>
            ) : steamAccountError || !steamAccountName ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Failed to fetch Steam account name. Please make sure you entered a valid Steam ID3 and region.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">
                Found Steam account:{" "}
                <span className="font-bold text-foreground">
                  {steamAccountName} ({steamId})
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {steamAccountName && !steamAccountLoading && !steamAccountError && (
        <div className="flex flex-wrap gap-x-6 gap-y-6">
          <div className="mt-6 min-w-0 flex-1">
            <h2 className="text-xl font-bold text-foreground">Command Builder</h2>
            <CommandBuilder region={region} accountId={parseSteamId(steamId)} />
          </div>
          <div className="mt-6 min-w-0 flex-1">
            <h2 className="text-xl font-bold text-foreground">Widget Builder</h2>
            <WidgetBuilder region={region} accountId={parseSteamId(steamId)} />
          </div>
        </div>
      )}
    </div>
  );
}
