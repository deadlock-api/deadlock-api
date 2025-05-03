import type { Color } from "~/types/general";

export interface AssetsRank {
  tier: number;
  name: string;
  images: {
    large: string;
    large_webp: string;
    small?: string;
    small_webp?: string;
    large_subrank1?: string;
    large_subrank1_webp?: string;
    large_subrank2?: string;
    large_subrank2_webp?: string;
    large_subrank3?: string;
    large_subrank3_webp?: string;
    large_subrank4?: string;
    large_subrank4_webp?: string;
    large_subrank5?: string;
    large_subrank5_webp?: string;
    large_subrank6?: string;
    large_subrank6_webp?: string;
    small_subrank1?: string;
    small_subrank1_webp?: string;
    small_subrank2?: string;
    small_subrank2_webp?: string;
    small_subrank3?: string;
    small_subrank3_webp?: string;
    small_subrank4?: string;
    small_subrank4_webp?: string;
    small_subrank5?: string;
    small_subrank5_webp?: string;
    small_subrank6?: string;
    small_subrank6_webp?: string;
  };
  color: Color;
}
