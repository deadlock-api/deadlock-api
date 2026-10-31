/** What every lab variant's hero page receives; the variant fetches its own data from `~/queries`. */
export interface LabHeroPageProps {
  heroId: number;
  heroName: string;
  /** The URL segment, for links to the variant's other pages. */
  variant: string;
}

/** What every lab variant's item page receives; the variant fetches its own data from `~/queries`. */
export interface LabItemPageProps {
  itemId: number;
  itemName: string;
  variant: string;
}
