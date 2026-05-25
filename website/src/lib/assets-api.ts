import { DefaultApi } from "assets_deadlock_api_client";

import { ASSETS_ORIGIN } from "~/lib/constants";
import { createApiClient } from "~/lib/create-api-client";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 5_000,
};

export class Api {
  public default_api: DefaultApi;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = createApiClient(config.timeout);
    this.default_api = new DefaultApi(undefined, ASSETS_ORIGIN, axios_client);
  }
}

export const assetsApi = new Api();
