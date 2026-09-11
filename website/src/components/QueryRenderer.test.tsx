import assert from "node:assert/strict";
import { test } from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { QueryRenderer } from "./QueryRenderer";

async function failedQuery(data?: number[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const options = {
    queryKey: ["tracker-refresh-test"],
    queryFn: async (): Promise<number[]> => {
      throw new Error("Temporarily unavailable");
    },
  };
  if (data) client.setQueryData(options.queryKey, data);
  await assert.rejects(client.fetchQuery(options));
  return new QueryObserver(client, options).getCurrentResult();
}

test("keeps cached matches visible after a refresh error when explicitly enabled", async () => {
  const query = await failedQuery([10, 20]);
  const html = renderToStaticMarkup(
    <QueryRenderer query={query} keepDataOnError>
      {(matches) => <p>{matches.join(", ")}</p>}
    </QueryRenderer>,
  );
  assert.equal(html, "<p>10, 20</p>");
});

test("still shows an initial-load error when there are no cached matches", async () => {
  const query = await failedQuery();
  const html = renderToStaticMarkup(
    <QueryRenderer query={query} keepDataOnError errorFallback={() => <p>Try again</p>}>
      {() => <p>Matches</p>}
    </QueryRenderer>,
  );
  assert.equal(html, "<p>Try again</p>");
});

test("retains the default error behavior for existing callers", async () => {
  const query = await failedQuery([10]);
  const html = renderToStaticMarkup(
    <QueryRenderer query={query} errorFallback={() => <p>Try again</p>}>
      {() => <p>Matches</p>}
    </QueryRenderer>,
  );
  assert.equal(html, "<p>Try again</p>");
});

test("an empty successful response is still cached data", async () => {
  const query = await failedQuery([]);
  const html = renderToStaticMarkup(
    <QueryRenderer query={query} keepDataOnError>
      {(matches) => <p>{matches.length} matches</p>}
    </QueryRenderer>,
  );
  assert.equal(html, "<p>0 matches</p>");
});
