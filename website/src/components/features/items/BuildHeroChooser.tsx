import { UserRound } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { useHeroRoster } from "~/components/domain/selectors/useHeroPicker";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";

/**
 * The Build Designer without a hero: every hero's portrait in a dense row to pick from, since a build over all heroes'
 * games is rarely the one wanted. Picking sets the page's hero filter, which also holds the full searchable picker.
 */
export function BuildHeroChooser({ onPick }: { onPick: (heroId: number) => void }) {
  const { heroes } = useHeroRoster();
  return (
    <Panel>
      <PanelHeader title="Pick a hero" icon={UserRound} size="sm" />
      <PanelBody size="sm">
        <Inline gap={1} asChild>
          <ul aria-label="Heroes">
            {heroes.map((hero) => (
              <li key={hero.id}>
                <Button variant="ghost" size="icon" aria-label={hero.name} onClick={() => onPick(hero.id)}>
                  <HeroImage heroId={hero.id} shape="circle" title="" className="size-8" />
                </Button>
              </li>
            ))}
          </ul>
        </Inline>
      </PanelBody>
    </Panel>
  );
}
