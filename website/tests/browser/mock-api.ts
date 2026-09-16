import { createServer } from "node:http";

import { fixtureResponse, type GraphqlRequest } from "./fixtures";

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body: GraphqlRequest | undefined = raw ? JSON.parse(raw) : undefined;
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4319");
  const fixture = fixtureResponse(url, body);
  response.setHeader("Content-Type", "application/json");
  response.writeHead(fixture === undefined ? 404 : 200);
  response.end(JSON.stringify(fixture ?? { error: `No fixture for ${url.pathname}` }));
});

server.listen(4319, "127.0.0.1");
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
