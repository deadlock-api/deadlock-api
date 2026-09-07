import type { Upgrade } from "deadlock_api_client";

import { slugify } from "./slug";

export function itemSlug(name: string): string {
  return slugify(name);
}

export function findItemBySlug<T extends Pick<Upgrade, "name">>(items: T[], slug: string): T | undefined {
  return items.find((item) => itemSlug(item.name) === slug);
}
