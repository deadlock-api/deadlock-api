import type { AxiosInstance } from "axios";
import {
  AnalyticsApi,
  AssetsBucketApi,
  HeroesApi,
  ItemsApi,
  LeaderboardApi,
  MatchesApi,
  MapApi,
  NPCUnitsApi,
  PlayersApi,
  RanksApi,
  ServersApi,
  SteamApi,
} from "deadlock_api_client";

import { API_ORIGIN } from "~/lib/constants";
import { createApiClient } from "~/lib/create-api-client";

export interface ApiConfig {
  timeout: number;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  timeout: 20_000,
};

export class Api {
  public analytics_api: AnalyticsApi;
  public leaderboard_api: LeaderboardApi;
  public matches_api: MatchesApi;
  public players_api: PlayersApi;
  public servers_api: ServersApi;
  public steam_api: SteamApi;
  public heroes_api: HeroesApi;
  public items_api: ItemsApi;
  public ranks_api: RanksApi;
  public npc_units_api: NPCUnitsApi;
  public map_api: MapApi;
  public assets_bucket_api: AssetsBucketApi;
  public client: AxiosInstance;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = createApiClient(config.timeout);
    this.client = axios_client;
    this.analytics_api = new AnalyticsApi(undefined, API_ORIGIN, axios_client);
    this.leaderboard_api = new LeaderboardApi(undefined, API_ORIGIN, axios_client);
    this.matches_api = new MatchesApi(undefined, API_ORIGIN, axios_client);
    this.players_api = new PlayersApi(undefined, API_ORIGIN, axios_client);
    this.servers_api = new ServersApi(undefined, API_ORIGIN, axios_client);
    this.steam_api = new SteamApi(undefined, API_ORIGIN, axios_client);
    this.heroes_api = new HeroesApi(undefined, API_ORIGIN, axios_client);
    this.items_api = new ItemsApi(undefined, API_ORIGIN, axios_client);
    this.ranks_api = new RanksApi(undefined, API_ORIGIN, axios_client);
    this.npc_units_api = new NPCUnitsApi(undefined, API_ORIGIN, axios_client);
    this.map_api = new MapApi(undefined, API_ORIGIN, axios_client);
    this.assets_bucket_api = new AssetsBucketApi(undefined, API_ORIGIN, axios_client);
  }
}

export const api = new Api();
