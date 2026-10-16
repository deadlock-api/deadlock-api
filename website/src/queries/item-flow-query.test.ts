import assert from "node:assert/strict";
import { test } from "node:test";

import { create as createAxiosClient } from "axios";
import { AnalyticsApi } from "deadlock_api_client";

// Order matters in these lists, and sent as repeated keys the values reached the API reordered: locked items mixed up
// their columns (807 matches instead of 58,849) and an ability order prefix matched another order. The client has to
// send each list as one `a,b` value; the queries pass the lists as they are.
test("the API client sends order dependent lists as one comma separated value", async () => {
  const requestUrls: string[] = [];
  const client = createAxiosClient({
    adapter: async (config) => {
      requestUrls.push(decodeURIComponent(config.url ?? ""));
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    },
  });
  const analytics = new AnalyticsApi(undefined, "https://api.test", client);

  await analytics.itemFlowStats({ lockedItemIds: [968099481, 7409189], lockedColumns: [0, 1] });
  await analytics.abilityOrderStats({ heroId: 1, abilityOrderPrefix: [491391007, 3516947824] });

  const [itemFlowUrl, abilityOrderUrl] = requestUrls;
  assert.match(itemFlowUrl, /[?&]locked_item_ids=968099481,7409189(&|$)/);
  assert.match(itemFlowUrl, /[?&]locked_columns=0,1(&|$)/);
  assert.match(abilityOrderUrl, /[?&]ability_order_prefix=491391007,3516947824(&|$)/);
});
