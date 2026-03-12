import { DefaultApi, HeroesApi, ItemsApi } from "assets_deadlock_api_client";

import { ASSETS_ORIGIN } from "~/lib/constants";
import { createApiClient } from "~/lib/create-api-client";

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
    const axios_client = createApiClient(config.timeout);
    this.heroes_api = new HeroesApi(undefined, ASSETS_ORIGIN, axios_client);
    this.items_api = new ItemsApi(undefined, ASSETS_ORIGIN, axios_client);
    this.default_api = new DefaultApi(undefined, ASSETS_ORIGIN, axios_client);
  }
}

export const assetsApi = new Api();
