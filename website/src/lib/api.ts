import { type AxiosInstance, type AxiosResponse, isAxiosError, type RawAxiosRequestConfig } from "axios";
import {
  AnalyticsApi,
  AssetsBucketApi,
  CommandsApi,
  CrosshairApi,
  GenericDataApi,
  HeroesApi,
  ItemsApi,
  LeaderboardApi,
  MatchesApi,
  MapApi,
  MiscEntitiesApi,
  NPCUnitsApi,
  PatchesApi,
  PlayersApi,
  RankedSeasonsApi,
  RanksApi,
  SteamApi,
} from "deadlock_api_client";

import { API_ORIGIN } from "~/lib/constants";
import { createApiClient } from "~/lib/create-api-client";
import { ApiError } from "~/lib/http";

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
  public steam_api: SteamApi;
  public heroes_api: HeroesApi;
  public items_api: ItemsApi;
  public ranks_api: RanksApi;
  public ranked_seasons_api: RankedSeasonsApi;
  public npc_units_api: NPCUnitsApi;
  public map_api: MapApi;
  public misc_entities_api: MiscEntitiesApi;
  public assets_bucket_api: AssetsBucketApi;
  public generic_data_api: GenericDataApi;
  public crosshair_api: CrosshairApi;
  public commands_api: CommandsApi;
  public patches_api: PatchesApi;
  public client: AxiosInstance;

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    const axios_client = createApiClient(config.timeout);
    this.client = axios_client;
    this.analytics_api = new AnalyticsApi(undefined, API_ORIGIN, axios_client);
    this.leaderboard_api = new LeaderboardApi(undefined, API_ORIGIN, axios_client);
    this.matches_api = new MatchesApi(undefined, API_ORIGIN, axios_client);
    this.players_api = new PlayersApi(undefined, API_ORIGIN, axios_client);
    this.steam_api = new SteamApi(undefined, API_ORIGIN, axios_client);
    this.heroes_api = new HeroesApi(undefined, API_ORIGIN, axios_client);
    this.items_api = new ItemsApi(undefined, API_ORIGIN, axios_client);
    this.ranks_api = new RanksApi(undefined, API_ORIGIN, axios_client);
    this.ranked_seasons_api = new RankedSeasonsApi(undefined, API_ORIGIN, axios_client);
    this.npc_units_api = new NPCUnitsApi(undefined, API_ORIGIN, axios_client);
    this.map_api = new MapApi(undefined, API_ORIGIN, axios_client);
    this.misc_entities_api = new MiscEntitiesApi(undefined, API_ORIGIN, axios_client);
    this.assets_bucket_api = new AssetsBucketApi(undefined, API_ORIGIN, axios_client);
    this.generic_data_api = new GenericDataApi(undefined, API_ORIGIN, axios_client);
    this.crosshair_api = new CrosshairApi(undefined, API_ORIGIN, axios_client);
    this.commands_api = new CommandsApi(undefined, API_ORIGIN, axios_client);
    this.patches_api = new PatchesApi(undefined, API_ORIGIN, axios_client);
  }
}

export const api = new Api();

/**
 * An `ApiError` carrying the API's own message ("Crosshair code checksum mismatch") for a failed SDK call, whose Axios
 * error only says "Request failed with status code 400". The error body of a blob request arrives as a Blob and is read
 * back first. Any other error is returned as it is.
 */
export async function toApiError(error: unknown): Promise<unknown> {
  if (!isAxiosError(error) || !error.response) return error;
  const { status, statusText, data } = error.response;
  let body: unknown = data;
  if (data instanceof Blob) {
    try {
      body = JSON.parse(await data.text());
    } catch {
      body = null;
    }
  }
  return ApiError.fromResponse(status, statusText, body);
}

/**
 * Runs an SDK call for a binary endpoint (an image) and returns the body as a Blob. The spec types binary bodies as
 * `number[]`, so the generated methods need `responseType: "blob"`.
 */
export async function requestBlob(
  call: (options: RawAxiosRequestConfig) => Promise<AxiosResponse<unknown>>,
  signal?: AbortSignal,
): Promise<Blob> {
  try {
    const response = await call({ responseType: "blob", signal, headers: { Accept: "*/*" } });
    return response.data as Blob;
  } catch (error) {
    throw await toApiError(error);
  }
}
