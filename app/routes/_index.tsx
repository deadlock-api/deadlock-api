import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import HeroStatsTable from "~/components/heroes-page/HeroStatsTable";
import ItemStatsTable from "~/components/items-page/ItemStatsTable";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import type { APIInfo } from "~/types/api_info";

export const meta: MetaFunction = () => {
  return [{ title: "Deadlock API" }, { name: "description", content: "Match Data, Player Data, and more" }];
};

export default function Index() {
  const { data } = useQuery<APIInfo>({
    queryKey: ["api-info"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/info").then((res) => res.json()),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const totalFetchedMatches = useMemo(() => data?.table_sizes?.match_info?.rows, [data]);

  return (
    <div className="container mx-auto space-y-12">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight lg:text-5xl mb-2">Deadlock API</h1>
        {data && (
          <p className="text-lg text-muted-foreground mb-6">
            Fetched Matches: {totalFetchedMatches?.toLocaleString()} (Last 24h:{" "}
            {data?.fetched_matches_per_day?.toLocaleString()})
          </p>
        )}
        <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
          The Deadlock API provides a comprehensive set of endpoints to access game data, including match history,
          player statistics, and more. Whether you are a developer looking to integrate game data into your application
          or a player wanting to analyze your performance, the Deadlock API has you covered.
        </p>
      </section>

      <section>
        <h2 className="text-3xl font-semibold tracking-tight text-center mb-4">Our Services</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assets API</CardTitle>
            </CardHeader>
            <CardContent className="min-h-16">
              <p className="text-sm text-muted-foreground">
                Provides static game assets such as static heroes/item data, images, icons, sounds.
              </p>
            </CardContent>
            <CardFooter>
              <a href="https://assets.deadlock-api.com/" target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="outline" className="w-full">
                  Visit Assets API
                </Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Game Data API</CardTitle>
            </CardHeader>
            <CardContent className="min-h-16">
              <p className="text-sm text-muted-foreground">
                Offers game data including matches, players, and statistics.
              </p>
            </CardContent>
            <CardFooter>
              <a href="https://api.deadlock-api.com/" target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="outline" className="w-full">
                  Visit Game Data API
                </Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Database Dumps</CardTitle>
            </CardHeader>
            <CardContent className="min-h-16">
              <p className="text-sm text-muted-foreground">
                Download up-to-date database snapshots for offline analysis or research.
              </p>
            </CardContent>
            <CardFooter>
              <a
                href="https://minio.deadlock-api.com/browser/db-snapshot/public%2F"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button variant="outline" className="w-full">
                  Access Database Dumps
                </Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Stream Kit</CardTitle>
            </CardHeader>
            <CardContent className="min-h-16">
              <p className="text-sm text-muted-foreground">
                Enhance your livestreams with real-time game data overlays and widgets.
              </p>
            </CardContent>
            <CardFooter>
              <a
                href="https://streamkit.deadlock-api.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button variant="outline" className="w-full">
                  Explore Stream Kit
                </Button>
              </a>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-center mb-4">Game Statistics Snapshot</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Best Heroes</CardTitle>
              <CardDescription>(Last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
            </CardContent>
            <CardFooter>
              <Link to="/heroes" className="w-full">
                <Button variant="default" className="w-full">
                  View All Heroes
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Heroes</CardTitle>
              <CardDescription>(Last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <HeroStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["pickRate"]} sortBy="matches" />
            </CardContent>
            <CardFooter>
              <Link to="/heroes" className="w-full">
                <Button variant="default" className="w-full">
                  View All Heroes
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Best Items</CardTitle>
              <CardDescription>(Last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["winRate"]} sortBy="winrate" />
            </CardContent>
            <CardFooter>
              <Link to="/items" className="w-full">
                <Button variant="default" className="w-full">
                  View All Items
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Items</CardTitle>
              <CardDescription>(Last 7 days)</CardDescription>
            </CardHeader>
            <CardContent>
              <ItemStatsTable hideIndex={true} hideHeader={true} limit={5} columns={["usage"]} sortBy="matches" />
            </CardContent>
            <CardFooter>
              <Link to="/items" className="w-full">
                <Button variant="default" className="w-full">
                  View All Items
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">Our Sponsors</h2>
        <p className="mb-6 text-muted-foreground">
          We are grateful to our sponsors for their support. <br />
          Please check out our{" "}
          <a
            href="https://www.patreon.com/user?u=68961896"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
            title="Support on Patreon"
          >
            Patreon
          </a>
          .
        </p>
        <div className="flex justify-center items-center gap-8 mt-4">
          <a
            href="https://deadlock.blast.tv/"
            title="Blast.TV"
            target="_blank"
            rel="noreferrer"
            className="max-w-[200px]"
          >
            <img src="/logo/blast.svg" alt="Blast.TV Logo" />
          </a>
        </div>
      </section>

      <section className="text-center border-t pt-8 mt-8">
        <p className="text-sm text-muted-foreground text-balance">
          <a
            href="https://deadlock-api.com/"
            title="Deadlock API"
            className="font-medium text-primary underline underline-offset-4"
          >
            deadlock-api.com
          </a>{" "}
          is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in
          producing or managing Valve properties.
        </p>
      </section>
    </div>
  );
}
