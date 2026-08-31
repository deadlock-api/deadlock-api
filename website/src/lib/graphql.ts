import { createClient } from "deadlock_api_graphql_client";

import { API_ORIGIN } from "~/lib/constants";

export const graphql = createClient({ url: `${API_ORIGIN}/v1/graphql` });
