import { DomainAssets } from "~/components/dev/design-system/DomainAssets";
import { DomainData } from "~/components/dev/design-system/DomainData";
import { DomainFilters } from "~/components/dev/design-system/DomainFilters";
import { DomainMinigames } from "~/components/dev/design-system/DomainMinigames";
import { DomainRank } from "~/components/dev/design-system/DomainRank";
import { DomainSelectors } from "~/components/dev/design-system/DomainSelectors";
import { Round3DomainAssets } from "~/components/dev/design-system/Round3DomainAssets";
import { Round3DomainMisc } from "~/components/dev/design-system/Round3DomainMisc";
import { Round3DomainPlayer } from "~/components/dev/design-system/Round3DomainPlayer";
import { Chapter } from "~/components/dev/design-system/Specimen";

export function Domain() {
  return (
    <Chapter
      id="domain"
      title="Domain"
      intro="Deadlock-aware building blocks shared by features, in components/domain. They fetch their own assets, so a feature passes ids, not URLs."
    >
      <DomainAssets />
      <DomainRank />
      <DomainSelectors />
      <DomainFilters />
      <DomainData />
      <DomainMinigames />
      <Round3DomainAssets />
      <Round3DomainPlayer />
      <Round3DomainMisc />
    </Chapter>
  );
}
