import { endOfDay } from "date-fns";

export const MIN_GAME_DURATION_S = 0;
export const MAX_GAME_DURATION_S = 60 * 60;

export const PATCHES = [
	{
		id: "2025-10-24",
		name: "Latest Patch (2025-10-24)",
		startDate: new Date("2025-10-24T23:54:51Z"),
		endDate: endOfDay(new Date()),
	},
	{
		id: "2025-09-06",
		name: "Six New Heroes (2025-09-06)",
		startDate: new Date("2025-09-06T20:00:00Z"),
		endDate: endOfDay(new Date()),
	},
	{
		id: "2025-05-08",
		name: "Major Item Rework (2025-05-08)",
		startDate: new Date("2025-05-08T19:43:20Z"),
		endDate: endOfDay(new Date()),
	},
	{
		id: "2025-02-25",
		name: "Major Map Rework (2025-02-25)",
		startDate: new Date("2025-02-25T21:51:13Z"),
		endDate: endOfDay(new Date()),
	},
];

export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";

export const DISCORD_LINK = "https://discord.gg/XMF9Xrgfqu";
export const PATREON_LINK = "https://www.patreon.com/user?u=68961896";
export const STATUS_PAGE_LINK = "https://stats.uptimerobot.com/V1HIfGQT77";
export const GITHUB_LINK = "https://github.com/deadlock-api";

export const OPENAPI_CLIENTS_URL =
	"https://github.com/deadlock-api/openapi-clients";
export const LIVE_EVENTS_API =
	"https://github.com/deadlock-api/deadlock-live-events";
export const ASSETS_API_DOCS_URL = "https://assets.deadlock-api.com/scalar";
export const GAME_API_DOCS_URL = "https://api.deadlock-api.com/docs";
export const DATABASE_DUMPS_URL =
	"https://files.deadlock-api.com/buckets/db-snapshot/public/";
export const STREAMKIT_URL = "https://streamkit.deadlock-api.com/";
