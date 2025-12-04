import { DefaultApi, HeroesApi, ItemsApi } from "assets_deadlock_api_client";
import { BASE_PATH } from "assets_deadlock_api_client/base";
import axios from "axios";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 5000,
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
    this.heroes_api = new HeroesApi(undefined, BASE_PATH, axios_client);
    this.items_api = new ItemsApi(undefined, BASE_PATH, axios_client);
    this.default_api = new DefaultApi(undefined, BASE_PATH, axios_client);
  }
}

export const assetsApi = new Api();
