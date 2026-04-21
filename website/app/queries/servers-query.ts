import { queryOptions } from "@tanstack/react-query";

import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export const serversQueryOptions = queryOptions({
  queryKey: queryKeys.servers.list(),
  queryFn: async () => {
    const response = await api.servers_api.list();
    return response.data.servers;
  },
  staleTime: 30_000,
  refetchInterval: 30_000,
});

export const steamServersQueryOptions = queryOptions({
  queryKey: queryKeys.servers.steamList(),
  queryFn: async () => {
    const response = await api.servers_api.steamList();
    return response.data;
  },
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
