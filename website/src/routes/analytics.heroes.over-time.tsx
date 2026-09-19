import { createFileRoute } from "@tanstack/react-router";

import { heroesPageOptions } from "~/pages/analytics/HeroesPageOptions";

export const Route = createFileRoute("/analytics/heroes/over-time")({ ...heroesPageOptions });
