import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { useSearchParams } from "react-router";
import CommandBuilder from "~/components/streamkit/command/CommandBuilder";
import WidgetBuilder from "~/components/streamkit/widget-builder";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

const regions = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;

export const meta: MetaFunction = () => {
  return [
    { title: "Deadlock Stream Kit" },
    { name: "description", content: "Build chat commands and OBS widgets for your Deadlock stream" },
  ];
};

export default function StreamKit() {
  const [searchParams] = useSearchParams();
  const [steamId, setSteamId] = useState(searchParams.get("steamid") ?? "");
  const [region, setRegion] = useState(searchParams.get("region") ?? "");

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
    const url = new URL("https://api.deadlock-api.com/v1/commands/variables/resolve");
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
      <h1 className="text-2xl font-bold text-foreground text-center">Deadlock Stream Kit</h1>

      <div className="max-w-[700px] mx-auto space-y-4">
        <div>
          <Label>Steam ID3</Label>
          <Input
            type="number"
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="Enter your Steam ID3"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            You can find your Steam ID3 from your Steam profile URL or by using a Steam ID finder tool.
          </p>
        </div>

        <div>
          <Label>Region</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select a region" />
            </SelectTrigger>
            <SelectContent>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {steamId && region && (
        <div className="max-w-[700px] mx-auto">
          {steamAccountLoading ? (
            <Alert>
              <AlertDescription className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
                Fetching Steam account...
              </AlertDescription>
            </Alert>
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

      {steamAccountName && !steamAccountLoading && !steamAccountError && (
        <div className="flex flex-wrap gap-x-6">
          <div className="flex-1 max-w-[700px] mx-auto mt-6">
            <h2 className="text-xl font-bold text-foreground">Command Builder</h2>
            <CommandBuilder region={region} accountId={parseSteamId(steamId)} />
          </div>
          <div className="flex-1 max-w-[700px] mx-auto mt-6">
            <h2 className="text-xl font-bold text-foreground">Widget Builder</h2>
            <WidgetBuilder region={region} accountId={parseSteamId(steamId)} />
          </div>
        </div>
      )}
    </div>
  );
}
