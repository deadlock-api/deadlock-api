import { createFileRoute } from "@tanstack/react-router";

import { itemsPageOptions } from "~/pages/analytics/ItemsPageOptions";

export const Route = createFileRoute("/analytics/items/item-purchase-analysis")({ ...itemsPageOptions });
