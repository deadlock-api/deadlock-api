import type { AxiosInstance } from "axios";
import { AnalyticsApi, LeaderboardApi, MatchesApi, PlayersApi, SteamApi } from "deadlock_api_client";

import { API_ORIGIN } from "~/lib/constants";
import { createApiClient } from "~/lib/create-api-client";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 10_000,
};

export class Api {
  public analytics_api: AnalyticsApi;
  public leaderboard_api: LeaderboardApi;
  public matches_api: MatchesApi;
  public players_api: PlayersApi;
  public steam_api: SteamApi;
  public client: AxiosInstance;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = createApiClient(config.timeout);
    this.client = axios_client;
    this.analytics_api = new AnalyticsApi(undefined, API_ORIGIN, axios_client);
    this.leaderboard_api = new LeaderboardApi(undefined, API_ORIGIN, axios_client);
    this.matches_api = new MatchesApi(undefined, API_ORIGIN, axios_client);
    this.players_api = new PlayersApi(undefined, API_ORIGIN, axios_client);
    this.steam_api = new SteamApi(undefined, API_ORIGIN, axios_client);
  }
}

export const api = new Api();
