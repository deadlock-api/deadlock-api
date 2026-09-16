import { createFileRoute } from "@tanstack/react-router";

import { itemsPageOptions } from "~/pages/analytics/ItemsPage";

export const Route = createFileRoute("/analytics/items/build-flow")({ ...itemsPageOptions });
