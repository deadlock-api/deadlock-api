import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle, Layers, Terminal } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useEffect } from "react";

import { SteamIcon } from "~/components/domain/brand/BrandIcons";
import { CommandBuilder } from "~/components/features/streamkit/command/CommandBuilder";
import { WidgetBuilder } from "~/components/features/streamkit/widget-builder";
import { Hero } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Heading } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { Input } from "~/components/ui/input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useSteamAuthCallback } from "~/hooks/useSteamAuthCallback";
import { API_ORIGIN } from "~/lib/constants";
import { REGION_LABELS } from "~/lib/region";
import { seo } from "~/lib/seo";
import { parseSteamIdToId3, steamId64ToSteamId3 } from "~/lib/steam";
import { generateSteamAuthUrl } from "~/lib/steam-auth";
import { queryKeys } from "~/queries/query-keys";

const regions = ["Europe", "Asia", "NAmerica", "SAmerica", "Oceania"] as const;

export const Route = createFileRoute("/streamkit/")({
  head: () =>
    seo({
      title: "Stream Toolkit & OBS Widgets | Deadlock API",
      description:
        "Build chat commands and OBS widgets for your Deadlock stream. Show live stats, match history, and more.",
      path: "/streamkit",
    }),
  component: StreamKit,
});

function StreamKit() {
  const [steamId, setSteamId] = useQueryState("steamid", parseAsString.withDefault(""));
  const [region, setRegion] = useQueryState("region", parseAsString.withDefault(""));
  const { steamId64 } = useSteamAuthCallback();
  const navigate = useNavigate();

  useEffect(() => {
    if (!steamId64) return;

    const id3 = steamId64ToSteamId3(steamId64);
    setSteamId(id3.toString());

    const newParams = new URLSearchParams();
    newParams.set("steamid", id3.toString());
    if (region) newParams.set("region", region);
    navigate({ to: "/streamkit", search: Object.fromEntries(newParams), replace: true });
  }, [steamId64, setSteamId, region, navigate]);

  const fetchSteamName = async (r: string, id: string) => {
    if (!id) return null;
    if (!r) return null;
    const url = new URL(`${API_ORIGIN}/v1/commands/variables/resolve`);
    url.searchParams.append("region", r);
    url.searchParams.append("account_id", id);
    url.searchParams.append("variables", "steam_account_name");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch steam name: ${res.status}`);
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
    <PageShell density="content">
      <Hero size="sm">
        <PageHeader
          size="lg"
          title="Stream Kit"
          description="Build chat commands and OBS widgets for your Deadlock stream"
        />
      </Hero>

      <Card>
        <CardContent>
          <Stack gap={5}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto_1fr]">
              <Stack gap={3}>
                <Stack gap={1}>
                  <Heading as="h2" size="default">
                    Connect Your Account
                  </Heading>
                  <Text as="p" tone="muted">
                    Enter your Steam ID manually
                  </Text>
                </Stack>
                <Field
                  label="Steam ID3"
                  htmlFor="steamid-input"
                  description="Find it in your Steam profile URL or with a Steam ID finder tool."
                >
                  <Input
                    id="steamid-input"
                    type="number"
                    value={steamId}
                    onChange={(e) => setSteamId(e.target.value)}
                    spinners="hidden"
                    placeholder="e.g. 123456789"
                  />
                </Field>
              </Stack>

              <Stack gap={2} align="center" className="hidden md:flex">
                <div className="flex flex-1">
                  <Separator orientation="vertical" />
                </div>
                <Text variant="eyebrow">or</Text>
                <div className="flex flex-1">
                  <Separator orientation="vertical" />
                </div>
              </Stack>
              <Inline wrap="nowrap" className="md:hidden">
                <div className="flex-1">
                  <Separator />
                </div>
                <Text variant="eyebrow">or</Text>
                <div className="flex-1">
                  <Separator />
                </div>
              </Inline>

              <Stack gap={3} justify="center" className="items-center md:items-start">
                <Stack gap={1} className="text-center md:text-start">
                  <Heading as="h2" size="default">
                    Quick Connect
                  </Heading>
                  <Text as="p" tone="muted">
                    Sign in directly with Steam
                  </Text>
                </Stack>
                <Button
                  variant="steam"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const returnPath = region ? `/streamkit?region=${encodeURIComponent(region)}` : "/streamkit";
                    window.location.href = generateSteamAuthUrl({ returnPath });
                  }}
                >
                  <SteamIcon />
                  Sign in with Steam
                </Button>
              </Stack>
            </div>

            <Separator />

            <Field label="Region">
              <Segmented aria-label="Region" size="lg" value={region} onValueChange={setRegion}>
                {regions.map((r) => (
                  <SegmentedItem key={r} value={r}>
                    {REGION_LABELS[r]}
                  </SegmentedItem>
                ))}
              </Segmented>
            </Field>

            {steamId && region && (
              <>
                <Separator />
                {steamAccountLoading ? (
                  <Inline>
                    <Spinner />
                    <Text tone="muted">Fetching Steam account...</Text>
                  </Inline>
                ) : steamAccountError || !steamAccountName ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Failed to fetch Steam account name. Please make sure you entered a valid Steam ID3 and region.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Inline wrap="nowrap">
                    <CheckCircle className="size-4 shrink-0 text-positive" />
                    <Text tone="muted">
                      Found Steam account:{" "}
                      <Text as="strong" variant="label" tone="default">
                        {steamAccountName} ({steamId})
                      </Text>
                    </Text>
                  </Inline>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {isAccountConnected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card asChild>
            <section>
              <CardContent>
                <Stack gap={5}>
                  <BuilderHeader
                    icon={<Terminal />}
                    title="Command Builder"
                    description="Create dynamic chatbot commands"
                  />
                  <CommandBuilder region={region} accountId={parseSteamIdToId3(steamId)} />
                </Stack>
              </CardContent>
            </section>
          </Card>

          <Card asChild>
            <section>
              <CardContent>
                <Stack gap={5}>
                  <BuilderHeader
                    icon={<Layers />}
                    title="Widget Builder"
                    description="Build OBS overlays for your stream"
                  />
                  <WidgetBuilder region={region} accountId={parseSteamIdToId3(steamId)} />
                </Stack>
              </CardContent>
            </section>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function BuilderHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Inline gap={4} align="start" wrap="nowrap">
      <IconTile>{icon}</IconTile>
      <Stack gap={0.5}>
        <Heading as="h2" size="default">
          {title}
        </Heading>
        <Text as="p" tone="muted">
          {description}
        </Text>
      </Stack>
    </Inline>
  );
}
