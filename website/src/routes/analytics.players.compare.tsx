import { createFileRoute } from "@tanstack/react-router";

import { comparePageOptions } from "~/pages/analytics/PlayersPageOptions";

export const Route = createFileRoute("/analytics/players/compare")({ ...comparePageOptions });
