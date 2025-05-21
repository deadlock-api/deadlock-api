import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { type MetaFunction, useLocation } from "react-router";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import MMRChart from "~/components/players-page/MMRChart";
import HeroSelector from "~/components/selectors/HeroSelector";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PATCHES } from "~/lib/constants";
import { useDelayedState } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Players - Deadlock API" },
    { name: "description", content: "Detailed analytics about a Player in Deadlock" },
  ];
};

export default function Player({ initialTab }: { initialTab?: string } = { initialTab: "mmr" }) {
  const [steamId, setSteamIdAfter] = useDelayedState<number | null>(null);
  const [hero, setHero] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Dayjs | null>(PATCHES[0].startDate);
  const [endDate, setEndDate] = useState<Dayjs | null>(PATCHES[0].endDate);

  const location = useLocation();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(new URLSearchParams(location.search));

  // biome-ignore lint/correctness/useExhaustiveDependencies: setSteamIdAfter is a function
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchParams(params);

    const searchTab = params?.get("tab") || initialTab || "mmr";
    if (searchTab) {
      setTab(searchTab);
    }

    const searchHeroIdString = params?.get("heroId");
    const searchHeroId = searchHeroIdString ? Number.parseInt(searchHeroIdString) : null;
    if (searchHeroId) setHero(searchHeroId);

    const searchSteamIdString = params?.get("steamId");
    const searchSteamId = searchSteamIdString ? Number.parseInt(searchSteamIdString) : null;
    if (searchSteamId) setSteamIdAfter(searchSteamId, 400);
  }, [location.search, initialTab]);

  const searchTab = searchParams?.get("tab");
  const [tab, setTab] = useState(searchTab || initialTab || "mmr");

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      window.history.pushState({}, "", url);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-bold text-center mb-4">Player Stats</h2>
      <Card className="mb-4 w-fit mx-auto">
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start">
            <div className="flex flex-col min-w-48 max-w-sm gap-1.5">
              <Label htmlFor="steamId" className="flex flex-nowrap justify-between h-8">
                <span>Steam ID3</span>
                {!steamId && <span className="text-red-500">(required)</span>}
              </Label>
              <Input
                type="number"
                id="steamId"
                min={1}
                max={4294967295}
                value={steamId || undefined}
                onChange={(e) => {
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("steamId", e.target.value);
                    window.history.pushState({}, "", url);
                  }
                  setSteamIdAfter(Number(e.target.value), 400);
                }}
                placeholder="Steam ID3 (required)"
              />
            </div>
            <HeroSelector onHeroSelected={setHero} selectedHero={hero} allowSelectNull={true} />
            <div className="flex justify-center md:justify-start">
              <PatchOrDatePicker
                patchDates={PATCHES}
                value={{ startDate, endDate }}
                onValueChange={({ startDate, endDate }) => {
                  setStartDate(startDate);
                  setEndDate(endDate);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
          <TabsTrigger value="mmr">MMR</TabsTrigger>
        </TabsList>
        <TabsContent value="mmr" className="space-y-4">
          {steamId && steamId > 0 && (
            <>
              <MMRChart steamId={steamId} minDate={startDate} maxDate={endDate} hero={hero} />
              <Card className="w-fit mx-auto">
                <CardContent className="space-y-4">
                  <h3 className="text-2xl font-bold text-center mb-4">
                    How we calculate the MMR?
                    <span className="font-normal text-sm">
                      <a
                        href="https://github.com/deadlock-api/deadlock-api-tools/blob/master/mmr-calc/mmr_calc.py"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline underline-offset-4 ml-1 hover:text-primary/80"
                      >
                        Implementation
                        <svg
                          className="w-4 h-4 inline ml-1"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    </span>
                  </h3>
                  <div className="grid gap-6 text-balance mx-auto w-fit">
                    <div>
                      <h4 className="font-bold text-lg">Context</h4>
                      <p className="ml-4 w-fit max-w-72">
                        Since December 2024, we've been using average rank (per-team) data directly from Valve of teams
                        in each match. Our system uses this to estimate the rank for every player.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">Initialization</h4>
                      <p className="ml-4 w-fit max-w-72">
                        Each player gets their first rank based on the average rank of their team in their first match
                        where Valve provided an average rank.
                      </p>
                    </div>
                    <div className="col-span-2">
                      <h4 className="font-bold text-lg">
                        Update Ranks <span className="font-normal text-sm">(for every match)</span>
                      </h4>
                      <ol className="list-decimal list-outside ml-8">
                        <li>
                          Compare the average rank from Valve to our average rank for each team in the match.
                          <pre className="bg-background p-2 rounded-md text-xs w-fit text-wrap">
                            Error = Valve's Team Average - Our Team Average
                          </pre>
                        </li>
                        <li>
                          Then we adjust each player's rank based on this difference.
                          <pre className="bg-background p-2 rounded-md text-xs w-fit text-wrap">
                            New Rank = Current Rank + Error
                          </pre>
                        </li>
                        <li>Go to the next match and repeat.</li>
                      </ol>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
