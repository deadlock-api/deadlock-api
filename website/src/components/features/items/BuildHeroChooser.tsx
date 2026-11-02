import { UserRound } from "lucide-react";

import { HeroGrid, HeroGridSearch, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { useHeroPicker, useHeroRoster } from "~/components/domain/selectors/useHeroPicker";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";

/**
 * The Build Designer without a hero: the site's one hero picker (a search over the portrait grid, as in the Hero
 * filter's popover and the Team Builder), in a column of its own measure so the portraits stay a readable size on a
 * wide screen. Picking sets the page's hero filter; Enter in the search takes the first match.
 */
export function BuildHeroChooser({
  onPick,
  children,
}: {
  onPick: (heroId: number) => void;
  /** Actions in the header, such as importing a build. */
  children?: React.ReactNode;
}) {
  const { heroes } = useHeroRoster();
  const picker = useHeroPicker({
    heroes,
    value: null,
    onValueChange: (heroId) => {
      if (heroId != null) onPick(heroId);
    },
  });
  return (
    <Panel className="mx-auto w-full max-w-3xl">
      <PanelHeader title="Pick a hero" icon={UserRound} size="sm">
        {children}
      </PanelHeader>
      <PanelBody size="sm" className="flex flex-col gap-2">
        <HeroGridSearch picker={picker} />
        <HeroGrid picker={picker} size="xl" aria-label="Heroes">
          {picker.matches.map((hero) => (
            <HeroGridTile key={hero.id} hero={hero} />
          ))}
        </HeroGrid>
      </PanelBody>
    </Panel>
  );
}
