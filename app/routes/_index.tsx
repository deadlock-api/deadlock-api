import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";

export const meta: MetaFunction = () => {
  return [{ title: "Deadlock API" }, { name: "description", content: "Match Data, Player Data, and more" }];
};

export default function Index() {
  return (
    <div className="container mx-auto space-y-12">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight lg:text-5xl mb-2">Deadlock API</h1>
        <h2 className="flex flex-nowrap justify-between gap-4 max-w-sm mx-auto mb-2">
          <a
            href="https://github.com/deadlock-api/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-medium hover:underline flex items-center gap-1 text-primary transition-colors duration-100"
            title="Open Source | Visit our GitHub Organization"
          >
            Open Source
          </a>
          <a
            href="https://files.deadlock-api.com/Default/buckets/db-snapshot/public/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-medium hover:underline flex items-center gap-1 text-primary transition-colors duration-100"
            title="Open Data | Daily Data Dumps provided"
          >
            Open Data
          </a>
          <a
            href="https://www.patreon.com/c/manuelhexe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-medium hover:underline flex items-center gap-1 text-primary transition-colors duration-100"
            title="Free to use | Based on Sponsoring"
          >
            Free to use
          </a>
        </h2>
        <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
          The Deadlock API provides a comprehensive set of endpoints to access game data, including match history,
          player statistics, and more. Whether you are a developer looking to integrate game data into your application
          or a player wanting to analyze your performance, the Deadlock API has you covered.
        </p>
      </section>

      <section className="text-center">
        <Card className="border-primary/40 bg-linear-to-br from-primary/10 to-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl text-primary">Prioritized Fetching</CardTitle>
            <CardDescription className="text-base">
              Your matches tracked faster — starting at just $3/month
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We fetch match data for millions of players. With prioritized fetching, your Steam accounts jump to the
              front of the queue — your matches and stats are updated more frequently so you always have the latest data
              for analysis.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-primary font-semibold">&#10003;</span>
                <span className="text-muted-foreground">Priority queue updates</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary font-semibold">&#10003;</span>
                <span className="text-muted-foreground">Up to 10 Steam accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary font-semibold">&#10003;</span>
                <span className="text-muted-foreground">Full match history from first to last game</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary font-semibold">&#10003;</span>
                <span className="text-muted-foreground">100% funds infrastructure</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary font-semibold">&#10003;</span>
                <span className="text-muted-foreground">Accurate rank data from Steam</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <Link to="/patron" prefetch="intent">
              <Button className="bg-primary hover:bg-amber-600 text-white font-semibold px-8">
                Enable Prioritized Fetching
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </section>

      <section>
        <h2 className="text-3xl font-semibold tracking-tight text-center mb-4">Our Services</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Assets API</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Provides static game assets such as static heroes/item data, images, icons, sounds.
              </p>
            </CardContent>
            <CardFooter>
              <a href={ASSETS_ORIGIN} target="_blank" rel="noopener noreferrer" className="w-full">
                <Button className="w-full">Visit Assets API</Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Game Data API</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Offers game data including matches, players, and statistics.
              </p>
            </CardContent>
            <CardFooter>
              <a href={API_ORIGIN} target="_blank" rel="noopener noreferrer" className="w-full">
                <Button className="w-full">Visit Game Data API</Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Live Events API</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Real-time game events via Server-Sent Events for live match tracking.
              </p>
            </CardContent>
            <CardFooter>
              <a
                href="https://github.com/deadlock-api/deadlock-live-events"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button className="w-full">View Live Events API</Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Database Dumps</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Download up-to-date database snapshots for offline analysis or research.
              </p>
            </CardContent>
            <CardFooter>
              <a
                  href="https://files.deadlock-api.com/Default/buckets/db-snapshot/public/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
              >
                <Button className="w-full">Access Database Dumps</Button>
              </a>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Stream Kit</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Enhance your livestreams with real-time game data overlays and widgets.
              </p>
            </CardContent>
            <CardFooter>
              <Link to="/streamkit" prefetch="intent" className="w-full">
                <Button className="w-full">Explore Stream Kit</Button>
              </Link>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">AI Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Ask questions about Deadlock heroes, items, abilities, and strategies powered by AI.
              </p>
            </CardContent>
            <CardFooter>
              <Link to="/chat" prefetch="intent" className="w-full">
                <Button className="w-full">Try AI Chat</Button>
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
            href="https://www.patreon.com/c/manuelhexe"
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
            href="https://statlocker.gg/"
            title="Statlocker.GG"
            target="_blank"
            rel="noreferrer"
            className="max-w-[200px]"
          >
            <img src="/logo/statlocker.png" alt="Statlocker.GG Logo" />
          </a>
          <a href="https://blast.tv/" title="Blast.TV" target="_blank" rel="noreferrer" className="max-w-[200px]">
            <img src="/logo/blast.svg" alt="Blast.TV Logo" />
          </a>
        </div>
      </section>

      <section className="text-center border-t pt-8 mt-8">
        <p className="text-sm text-muted-foreground text-pretty">
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
