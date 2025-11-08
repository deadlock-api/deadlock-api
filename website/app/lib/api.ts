import axios from "axios";
import { AnalyticsApi, MatchesApi, MMRApi, PlayersApi } from "deadlock-api-client";
import { BASE_PATH } from "deadlock-api-client/base";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 10000,
};

export class Api {
  public players_api: PlayersApi;
  public matches_api: MatchesApi;
  public analytics_api: AnalyticsApi;
  public mmr_api: MMRApi;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = axios.create({
      timeout: config.timeout,
      headers: {
        Accept: "application/json",
        UserAgent: "DeadlockAPI/1.0.0",
      },
    });
    this.players_api = new PlayersApi(undefined, BASE_PATH, axios_client);
    this.matches_api = new MatchesApi(undefined, BASE_PATH, axios_client);
    this.analytics_api = new AnalyticsApi(undefined, BASE_PATH, axios_client);
    this.mmr_api = new MMRApi(undefined, BASE_PATH, axios_client);
  }
}

export const api = new Api();
