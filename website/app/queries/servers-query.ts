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
