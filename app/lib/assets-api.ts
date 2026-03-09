import { DefaultApi, HeroesApi, ItemsApi } from "assets_deadlock_api_client";
import axios from "axios";
import { ASSETS_ORIGIN } from "~/lib/constants";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 5_000,
};

export class Api {
  default_api: DefaultApi;
  heroes_api: HeroesApi;
  items_api: ItemsApi;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = axios.create({
      timeout: config.timeout,
      headers: {
        Accept: "application/json",
        UserAgent: "DeadlockAPI/1.0.0",
        "Content-Type": "application/json",
      },
    });
    this.heroes_api = new HeroesApi(undefined, ASSETS_ORIGIN, axios_client);
    this.items_api = new ItemsApi(undefined, ASSETS_ORIGIN, axios_client);
    this.default_api = new DefaultApi(undefined, ASSETS_ORIGIN, axios_client);
  }
}

export const assetsApi = new Api();
