import axios from "axios";
import { AnalyticsApi } from "deadlock_api_client";
import { BASE_PATH } from "deadlock_api_client/base";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 10000,
};

export class Api {
  public analytics_api: AnalyticsApi;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = axios.create({
      timeout: config.timeout,
      headers: {
        Accept: "application/json",
        UserAgent: "DeadlockAPI/1.0.0",
      },
    });
    this.analytics_api = new AnalyticsApi(undefined, BASE_PATH, axios_client);
  }
}

export const api = new Api();
