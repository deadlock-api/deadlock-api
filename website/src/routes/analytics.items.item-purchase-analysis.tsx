import { createFileRoute } from "@tanstack/react-router";

import { itemsPageOptions } from "~/pages/analytics/ItemsPage";

export const Route = createFileRoute("/analytics/items/item-purchase-analysis")({ ...itemsPageOptions });
