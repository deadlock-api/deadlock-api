import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { chartRampColor, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { CalendarHeat, CalendarHeatDay, CalendarHeatMonth } from "~/components/patterns/data-table/CalendarHeat";
import {
  StoryChapter,
  StoryDeck,
  StoryFigure,
  StoryNote,
  StoryProgress,
  StoryProgressItem,
} from "~/components/patterns/story/Story";
import { Button } from "~/components/ui/button";
import { Stat, StatGroup } from "~/components/ui/stat";

const ramp = (t: number) => {
  const [r, g, b] = chartRampColor("sequential", 0.5 + 0.5 * t);
  return `rgb(${r} ${g} ${b})`;
};
// A fixed pattern, not random: the dev page renders on the server too.
const DAYS = Array.from({ length: 31 }, (_, index) => ({ day: index + 1, value: ((index * 7) % 11) - 4 }));

/** The story pattern (a long page in chapters, the yearly recap) and the calendar of a year of days. */
export function PatternsStory() {
  const [current, setCurrent] = useState("games");
  return (
    <>
      <Specimen
        name="StoryChapter"
        source="patterns/story/Story"
        note="One chapter of a story page: eyebrow, a punchy headline in condensed capitals, a lead, then what tells it. size cover opens or closes the story (display-size title, more room); align center for those. accent is a data color (a hero's) that tints the glow and the top edge, never text. as h1 for the opening chapter that names the page; the rest are h2 and title their own groups one level below. reveal scroll (default) animates the chapter in as it scrolls into view (CSS view() timelines: blocks rise in reading order, tiles follow one another, the figure pops, bars grow, the glow drifts; off under reduced motion, static without view-timeline support); reveal none keeps it still. Scroll this page to see it."
      >
        <Variants label="default" className="block">
          <StoryChapter
            eyebrow="Games played"
            title="2,842 matches later"
            description="More wins than losses: 1,453 of them went your way."
          >
            <StoryFigure value="1,461" unit="hours played" caption="That is 61 days of nonstop Deadlock." />
          </StoryChapter>
        </Variants>
        <Variants label="reveal none (stays still while scrolling)" className="block">
          <StoryChapter reveal="none" eyebrow="Survival" title="Grayscreen is a feature">
            <StoryFigure
              countUp={false}
              value="9.4"
              unit="hours dead"
              caption="countUp off as well: the number never moves."
            />
          </StoryChapter>
        </Variants>
        <Variants label="size cover, align center, accent from data" className="block">
          <StoryChapter
            as="h3"
            size="cover"
            align="center"
            accent={SERIES_COLORS[2]}
            eyebrow="Year in Deadlock 2026"
            title="That was your 2026"
            description="See you in the Cursed Apple in 2027."
          >
            <Button>Open the player tracker</Button>
          </StoryChapter>
        </Variants>
      </Specimen>

      <Specimen
        name="StoryFigure"
        source="patterns/story/Story"
        note="The one big number of a chapter: value, unit on its baseline, caption (the relatable comparison) under it. Sizes are the type-figure steps and grow with the chapter's width. A tone repeats what the words say; it is never the only signal. countUp (default on) counts a text value that is one number up from zero the first time it scrolls into view (useCountUp from ui/hooks/use-count-up); a figure already on screen at load, a non-number (Ascendant 4, 30:51) and reduced motion keep the text; a screen reader reads the real value."
      >
        <Variants label="size lg / default / sm" className="@container flex-col items-start">
          <StoryFigure size="lg" value="12,122" unit="kills" caption="About 5.1 a match." />
          <StoryFigure value="270" unit="days with Deadlock" />
          <StoryFigure size="sm" value="Ascendant 4" caption="Your peak of the year." />
        </Variants>
        <Variants label="tone (with words), align center" className="@container flex-col">
          <StoryFigure tone="positive" value="51.1%" unit="won" caption="above even" />
          <StoryFigure tone="negative" value="44.8%" unit="won" caption="below even" />
          <StoryFigure align="center" tone="primary" value="214" unit="times MVP" />
        </Variants>
      </Specimen>

      <Specimen
        name="StoryNote"
        source="patterns/story/Story"
        note="The honest line about coverage under numbers only some matches carry. Not hint text: it qualifies data on screen."
      >
        <StoryNote>
          Based on 291 of your 2,369 matches, the ones with full match details. We are still adding the details of the
          others.
        </StoryNote>
      </Specimen>

      <Specimen
        name="StoryProgress"
        source="patterns/story/Story"
        note="The chapters' index: links to their anchors, the one in view current (aria-current=location, a long brand-red bar and full ink, not color alone). The page tracks the current chapter with useActiveAnchor(ids) from ui/hooks/use-active-anchor. Press an item here to move the mark."
      >
        <StoryProgress label="Chapters (example)" className="max-w-48">
          {["intro", "games", "time", "heroes", "outro"].map((id) => (
            <StoryProgressItem
              key={id}
              href={`#story-${id}`}
              current={current === id}
              onClick={(event) => {
                event.preventDefault();
                setCurrent(id);
              }}
            >
              {id === "intro" ? "Your year" : id.charAt(0).toUpperCase() + id.slice(1)}
            </StoryProgressItem>
          ))}
        </StoryProgress>
      </Specimen>

      <Specimen
        name="StoryDeck"
        source="patterns/story/Story"
        note="The column of chapters. progress takes a StoryProgress, which sticks beside the chapters from a 64rem container and is left out below it (the chapters then take the full width)."
      >
        <StoryDeck
          progress={
            <StoryProgress label="Chapters (deck example)">
              <StoryProgressItem href="#deck-a" current>
                Games played
              </StoryProgressItem>
              <StoryProgressItem href="#deck-b">Heroes</StoryProgressItem>
            </StoryProgress>
          }
        >
          <StoryChapter as="h3" id="deck-a" eyebrow="Games played" title="2,842 matches later">
            <StatGroup size="sm" className="grid-cols-2">
              <Stat label="Wins" value="1,453" />
              <Stat label="Win rate" value="51.1%" tone="positive" sub="above even" />
            </StatGroup>
          </StoryChapter>
          <StoryChapter as="h3" id="deck-b" eyebrow="Heroes" title="Your main: Seven" />
        </StoryDeck>
      </Specimen>

      <Specimen
        name="CalendarHeat"
        source="patterns/data-table/CalendarHeat"
        note="A year of days as small month calendars (three a row on a phone, four from 32rem, six from 48rem), each day filled from a ramp. A picture with a text alternative: label summarises it and the days are hidden from assistive technology, so the text around it must name what matters. A day without a reading takes the muted track; state marked rings the day the text names."
      >
        <CalendarHeat
          label="Matches per day in January and February 2026: 25 active days, the most on January 14 (6)."
          className="max-w-md"
        >
          <CalendarHeatMonth label="Jan" startWeekday={3}>
            {DAYS.map(({ day, value }) => (
              <CalendarHeatDay
                key={day}
                color={value > 0 ? ramp(value / 6) : undefined}
                state={day === 14 ? "marked" : "default"}
              />
            ))}
          </CalendarHeatMonth>
          <CalendarHeatMonth label="Feb" startWeekday={6}>
            {DAYS.slice(0, 28).map(({ day, value }) => (
              <CalendarHeatDay key={day} color={value > 2 ? ramp(value / 6) : undefined} />
            ))}
          </CalendarHeatMonth>
          <CalendarHeatMonth label="Mar" startWeekday={6}>
            {DAYS.map(({ day }) => (
              <CalendarHeatDay key={day} />
            ))}
          </CalendarHeatMonth>
        </CalendarHeat>
      </Specimen>
    </>
  );
}
