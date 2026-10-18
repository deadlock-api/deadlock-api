import { UserRound } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { useHeroRoster } from "~/components/domain/selectors/useHeroPicker";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";

/**
 * The Build Designer without a hero: every hero's portrait and name to pick from, since a build over all heroes'
 * games is rarely the one wanted. Picking sets the page's hero filter, which also holds the full searchable picker.
 */
export function BuildHeroChooser({ onPick }: { onPick: (heroId: number) => void }) {
  const { heroes } = useHeroRoster();
  return (
    <Panel>
      <PanelHeader title="Pick a hero" icon={UserRound} size="sm" />
      <PanelBody size="sm">
        {/* Portrait and name, in as many 4rem columns as fit: names a first-timer can read, three rows on a desktop and
            four columns on a phone. */}
        <ul aria-label="Heroes" className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1">
          {heroes.map((hero) => (
            <li key={hero.id}>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-full flex-col gap-1 px-1 py-1.5"
                onClick={() => onPick(hero.id)}
              >
                <HeroImage heroId={hero.id} shape="circle" decorative className="size-8" />
                <span className="w-full truncate text-xs">{hero.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
