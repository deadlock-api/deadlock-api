import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { LoadMore } from "~/components/patterns/data-table/LoadMore";
import { SoundList, SoundListItem } from "~/components/patterns/sound/SoundList";
import { useInfiniteItems } from "~/components/ui/hooks/use-infinite-items";
import { useSoundPlayer } from "~/components/ui/hooks/use-sound-player";
import { SoundButton } from "~/components/ui/sound-button";

const BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/sounds";
const CAST = `${BUCKET}/abilities/abrams/a2_charge/cast.mp3`;
const TAKES = [1, 2, 3].map((n) => `${BUCKET}/vo/atlas/atlas_kill_haze_0${n}.mp3`);
const CONVO = [
  `${BUCKET}/vo/chrono/chrono_match_start_astro_chrono_convo01_01.mp3`,
  `${BUCKET}/vo/astro/astro_match_start_astro_chrono_convo01_02.mp3`,
  `${BUCKET}/vo/chrono/chrono_match_start_astro_chrono_convo01_03.mp3`,
];
const MISSING = `${BUCKET}/does-not-exist.mp3`;
const NUMBERS = Array.from({ length: 50 }, (_, i) => i + 1);

function LoadMoreSpecimen() {
  const list = useInfiniteItems(NUMBERS, { step: 8 });
  return (
    <div className="flex max-h-64 flex-col overflow-y-auto rounded-lg border">
      <ul className="flex flex-col">
        {list.items.map((n) => (
          <li key={n} className="border-b px-3 py-1.5 text-sm">
            Row {n}
          </li>
        ))}
      </ul>
      <LoadMore loaded={list.items.length} total={list.total} onLoadMore={list.showMore} noun="row" />
    </div>
  );
}

export function SoundSpecimens() {
  const player = useSoundPlayer({ volume: 0.5 });
  const button = (id: string, label: string, urls: string | string[] = id) => ({
    state: player.stateOf(id),
    duration: player.playback?.id === id ? player.playback.duration : undefined,
    label,
    onClick: () => player.toggle(id, urls),
  });
  return (
    <>
      <Specimen
        name="SoundButton"
        source="ui/sound-button"
        note="Plays a clip or a sequence and stops it while it plays, driven by the headless `useSoundPlayer` (ui/hooks/use-sound-player: `play(id, urls)`, `toggle`, `stop`, `stateOf(id)`, `playback`). Each state has its own glyph: play, spinner (loading), stop with a fill running over the clip's `duration` (playing), warning (error, press to retry). It is a toggle (`aria-pressed`) and its name is the action plus `label`. Children are a short visible label such as a take number; without children it is an icon button."
      >
        <Variants label="live (press them)">
          <SoundButton {...button(CAST, "Abrams charge cast")} />
          {TAKES.map((url, i) => (
            <SoundButton key={url} {...button(url, `Kill Haze, take ${i + 1}`)}>
              {i + 1}
            </SoundButton>
          ))}
          <SoundButton {...button("convo", "conversation", CONVO)}>
            {player.stateOf("convo") === "playing" ? "Stop" : "Play all"}
          </SoundButton>
          <SoundButton {...button(MISSING, "a missing clip")}>Missing file</SoundButton>
        </Variants>
        <Variants label="states">
          <SoundButton state="idle" label="idle">
            1
          </SoundButton>
          <SoundButton state="loading" label="loading">
            2
          </SoundButton>
          <SoundButton state="playing" label="playing" duration={4}>
            3
          </SoundButton>
          <SoundButton state="error" label="error">
            4
          </SoundButton>
          <SoundButton state="idle" label="disabled" disabled />
        </Variants>
        <Variants label="size">
          <SoundButton label="icon-xs" />
          <SoundButton label="icon-sm" size="icon-sm" />
          <SoundButton label="xs">Play</SoundButton>
          <SoundButton label="sm" size="sm">
            Play
          </SoundButton>
        </Variants>
      </Specimen>

      <Specimen
        name="SoundList"
        source="patterns/sound/SoundList"
        note="Rows of sounds: `SoundListItem` takes a `label`, a quiet `meta` line, `media` (a hero icon) and its takes as children. The takes sit at the row's end and drop below the name in a narrow container. `active` marks the row that is playing with a fill and an edge; the playing button's stop glyph says it too."
      >
        <SoundList aria-label="Example sounds">
          <SoundListItem label="Kill Haze" meta="Lines" active={TAKES.some((url) => url === player.playback?.id)}>
            {TAKES.map((url, i) => (
              <SoundButton key={url} {...button(url, `Kill Haze, take ${i + 1}`)}>
                {i + 1}
              </SoundButton>
            ))}
          </SoundListItem>
          <SoundListItem label="Charge cast" meta="abrams / a2_charge">
            <SoundButton {...button(CAST, "Charge cast")} />
          </SoundListItem>
          <SoundListItem label="Paradox" meta="Line 1" media={<HeroImage heroId={10} className="size-8" />} active>
            <SoundButton state="playing" duration={3} label="Paradox, line 1" />
          </SoundListItem>
          <SoundListItem label="A very long effect name that has to wrap onto a second line in a narrow container">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <SoundButton key={n} label={`take ${n}`}>
                {n}
              </SoundButton>
            ))}
          </SoundListItem>
        </SoundList>
      </Specimen>
      <Specimen
        name="LoadMore"
        source="patterns/data-table/LoadMore"
        note="Infinite scroll for a long list: `useInfiniteItems(list, { step })` (ui/hooks/use-infinite-items) holds how many rows show, and `LoadMore` after the list presses its own Show more button as it comes within 800px of the viewport. Keyboard and screen reader users press it on purpose; it announces how many rows are shown and is gone once all are. Scroll the box."
      >
        <LoadMoreSpecimen />
      </Specimen>
    </>
  );
}
