import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import cloudflareData from "./cloudflare-stats.json";
import matchesData from "./matches-per-month.json";

function MatchesPerMonthChart() {
  return (
    <div className="not-prose my-8">
      <ResponsiveContainer width="100%" height={350} className="rounded-xl bg-muted py-4">
        <BarChart data={matchesData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis dataKey="month" stroke="#525252" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
          <YAxis
            stroke="#525252"
            tick={{ fontSize: 12 }}
            width={40}
            tickFormatter={(v: number) => {
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
              if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
              return String(v);
            }}
          />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Matches"]}
            contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
            itemStyle={{ color: "#e5e5e5" }}
          />
          <Bar dataKey="matches" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-center text-xs text-muted-foreground">Matches tracked per month since October 2024</p>
    </div>
  );
}

function CloudflareStatsChart() {
  return (
    <div className="not-prose my-8 flex flex-col gap-6">
      <div>
        <ResponsiveContainer width="100%" height={300} className="rounded-xl bg-muted py-4">
          <LineChart data={cloudflareData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="date" stroke="#525252" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
            <YAxis
              stroke="#525252"
              tick={{ fontSize: 12 }}
              width={40}
              tickFormatter={(v: number) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(v);
              }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "Requests"]}
              contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
              itemStyle={{ color: "#e5e5e5" }}
            />
            <Line type="monotone" dataKey="requests" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-xs text-muted-foreground">Total requests per day (last 30 days)</p>
      </div>
      <div>
        <ResponsiveContainer width="100%" height={300} className="rounded-xl bg-muted py-4">
          <LineChart data={cloudflareData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="date" stroke="#525252" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
            <YAxis
              stroke="#525252"
              tick={{ fontSize: 12 }}
              width={40}
              tickFormatter={(v: number) => {
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(v);
              }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), "Unique visitors"]}
              contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
              itemStyle={{ color: "#e5e5e5" }}
            />
            <Line type="monotone" dataKey="visitors" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-xs text-muted-foreground">Unique visitors per day (last 30 days)</p>
      </div>
    </div>
  );
}

export default function HowDeadlockApiStarted() {
  return (
    <>
      <p>
        Back in October 2024, a bunch of us developers formed the "Deadlock Dev Community" on Discord. The idea was to
        build shared tooling around Valve's Deadlock. Honestly, there was no shortage of good ideas. The problem was
        that we kept sitting in meetings debating architectures and frameworks instead of actually writing anything.
      </p>
      <p>I got impatient, so I just started building. Eighteen months later, we've tracked over 18 million matches.</p>

      <MatchesPerMonthChart />

      <h2>Nobody was sharing data</h2>
      <p>
        I'd been running{" "}
        <a href="https://valorant-twitch-bot.com/" target="_blank" rel="noopener noreferrer">
          valorant-twitch-bot.com
        </a>{" "}
        before this, so I already knew the drill: ship something rough, see if anyone cares, fix it later. And the
        Deadlock ecosystem had a pretty obvious gap. A few player tracker sites had built private APIs for their own
        use, but nobody shared any of it. If you wanted match history or player stats programmatically, you were out of
        luck.
      </p>
      <p>
        So I opened my editor and started writing Python. FastAPI, a cheap server, Valve's game client APIs. No
        analytics, no frills, not even open source yet. People showed up almost immediately, which surprised me.
      </p>

      <h2>johnpyp</h2>
      <p>
        About a month in, I pulled{" "}
        <a href="https://github.com/johnpyp" target="_blank" rel="noopener noreferrer">
          johnpyp
        </a>{" "}
        into the project. We knew each other from the Dev Community. Turns out we both preferred writing code over
        discussing it, so that worked out.
      </p>
      <p>
        Two developers, no ticket system, no formal process. Something breaks, we fix it. That's still how we work, for
        better or worse.
      </p>

      <h2>The Rust rewrite</h2>
      <p>
        By December 2024, the Python API was struggling. Traffic kept growing, but our server budget was around $20 a
        month and we really wanted to keep it that way.
      </p>
      <p>
        So we just rewrote the whole thing in Rust. Took about a month, over December and January. Almost no downtime.
        The part that surprised me was how much headroom we suddenly had. Same hardware, completely different story.
      </p>
      <p>
        I genuinely love writing Rust. The compiler fights you until your code is correct, and then it runs fast enough
        that two people can serve millions of requests on a $20 server. For a project that runs on community donations,
        that matters way more than developer ergonomics.
      </p>

      <h2>Everything is free</h2>
      <p>
        Every endpoint is free. Generous rate limits by default, and if your project needs more, we hand out API keys at
        no cost. No premium tier, no paywall.
      </p>
      <p>
        The reason is simple, honestly. When I started this project, every existing tracker kept their data locked away.
        If you wanted to build something on top of Deadlock data, tough luck. That annoyed me then, and it still does.
      </p>
      <p>
        We do run a{" "}
        <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
          Patreon
        </a>{" "}
        where supporters get prioritized data fetching for their Steam accounts, starting at $3 a month. That covers
        infrastructure (currently around $200 a month, up from $20 at the start). We've always tried to optimize our way
        out of scaling problems before spending more money.
      </p>

      <h2>20 million requests a day</h2>
      <p>
        The numbers still catch me off guard. 20 million requests per day on average. Around 550,000 unique users every
        week. 18 million matches analyzed and counting.
      </p>
      <p>
        All of it runs on ClickHouse, which is a columnar database built for exactly this kind of thing. Sub-second
        queries over millions of rows. Picking it early on was probably the best technical decision in the whole
        project, and I say that knowing how the rest of the stack turned out.
      </p>

      <h2>What people built with it</h2>
      <p>
        <a href="https://tracklock.gg" target="_blank" rel="noopener noreferrer">
          Tracklock (now part of U.GG)
        </a>{" "}
        existed before our API, but they adopted it early on. In early 2025, sites like{" "}
        <a href="https://statlocker.gg" target="_blank" rel="noopener noreferrer">
          Statlocker
        </a>{" "}
        and{" "}
        <a href="https://lockblaze.com" target="_blank" rel="noopener noreferrer">
          Lockblaze
        </a>{" "}
        launched, both built entirely on our data, and the{" "}
        <a href="https://mobalytics.gg" target="_blank" rel="noopener noreferrer">
          Mobalytics
        </a>{" "}
        Deadlock page wouldn't exist without it either. Statlocker and Mobalytics have also been sponsors the whole
        time, which honestly helps a lot with keeping the servers up.
      </p>
      <p>
        The smaller projects are what really get me, though.{" "}
        <a href="https://livelock.gg" target="_blank" rel="noopener noreferrer">
          Livelock.gg
        </a>{" "}
        shows ongoing matches in real time using our live data, and{" "}
        <a href="https://metalock.gg" target="_blank" rel="noopener noreferrer">
          Metalock.gg
        </a>{" "}
        built a whole meta tracker and leaderboard on top of it. There's the{" "}
        <a href="https://top.gg/bot/1361785119374835984" target="_blank" rel="noopener noreferrer">
          DeadlockAssistant
        </a>{" "}
        Discord bot for match stats and MMR tracking, a{" "}
        <a href="https://github.com/wenright/DeadlockTwitchOverlay" target="_blank" rel="noopener noreferrer">
          Twitch overlay extension
        </a>{" "}
        that lets viewers hover over items on stream to see what they do, and a{" "}
        <a
          href="https://dashboard.twitch.tv/extensions/8svidf83i3usptxryy06qkl7qlrw5t"
          target="_blank"
          rel="noopener noreferrer"
        >
          Deadlock Match Overlay
        </a>{" "}
        Twitch extension that shows the current match's heroes and builds right on stream.{" "}
        <a href="https://ocelock.gg" target="_blank" rel="noopener noreferrer">
          OCElock
        </a>{" "}
        is a competitive Deadlock league for the Oceania region, using the API for match validation and results.{" "}
        <a href="https://www.overwolf.com/app/kofimbadam-deadlock_companion" target="_blank" rel="noopener noreferrer">
          Deadlock Companion
        </a>{" "}
        is an Overwolf desktop app for match tracking and profile analytics. Also on top of this API, people have built
        tournament organizer websites, stream bots, university and school projects and every few weeks someone posts a
        machine learning project on Reddit where they trained a model on our match data to predict outcomes or figure
        out the meta, which is always fun to see.
      </p>
      <p>
        We don't require registration or track who uses the API, so most of these I only find out about when someone
        mentions them in our{" "}
        <a href="https://discord.gg/pqWQfTPQJu" target="_blank" rel="noopener noreferrer">
          Discord
        </a>
        . That server has kind of taken on a life of its own. People report bugs, sure, but they also just talk about
        Deadlock development stuff that has nothing to do with us.
      </p>

      <h2>Where this is going</h2>

      <CloudflareStatsChart />

      <p>
        We're adding more analytics views to the <a href="/heroes">website</a> and getting ready for bigger player
        numbers as Deadlock grows. This blog is part of that. We want to actually write about what we find in the data,
        not just expose it through endpoints and hope someone notices.
      </p>
      <p>
        Everything is{" "}
        <a href="https://github.com/deadlock-api/" target="_blank" rel="noopener noreferrer">
          open source
        </a>
        , the{" "}
        <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
          Patreon
        </a>{" "}
        keeps the servers running, and the{" "}
        <a href="https://discord.gg/pqWQfTPQJu" target="_blank" rel="noopener noreferrer">
          Discord
        </a>{" "}
        is where we hang out. If you want to contribute, the{" "}
        <a href="https://github.com/deadlock-api/deadlock-api-rust" target="_blank" rel="noopener noreferrer">
          API
        </a>
        , this website, and the{" "}
        <a href="https://github.com/deadlock-api/deadlock-api-tools" target="_blank" rel="noopener noreferrer">
          data pipeline
        </a>{" "}
        all take PRs. Or just show up in Discord and tell us what's broken.
      </p>
    </>
  );
}
