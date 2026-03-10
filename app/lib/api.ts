import axios, { type AxiosInstance } from "axios";
import { AnalyticsApi, LeaderboardApi, PlayersApi, SteamApi } from "deadlock_api_client";

import { API_ORIGIN } from "~/lib/constants";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 10_000,
};

export class Api {
  public analytics_api: AnalyticsApi;
  public leaderboard_api: LeaderboardApi;
  public players_api: PlayersApi;
  public steam_api: SteamApi;
  public client: AxiosInstance;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = axios.create({
      timeout: config.timeout,
      headers: {
        Accept: "application/json",
        UserAgent: "DeadlockAPI/1.0.0",
      },
    });
    this.client = axios_client;
    this.analytics_api = new AnalyticsApi(undefined, API_ORIGIN, axios_client);
    this.leaderboard_api = new LeaderboardApi(undefined, API_ORIGIN, axios_client);
    this.players_api = new PlayersApi(undefined, API_ORIGIN, axios_client);
    this.steam_api = new SteamApi(undefined, API_ORIGIN, axios_client);
  }
}

export const api = new Api();
