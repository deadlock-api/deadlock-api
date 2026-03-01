#!/usr/bin/env bun
export {};

const SPECS = {
  api: "https://api.deadlock-api.com/openapi.json",
  assets: "https://assets.deadlock-api.com/openapi.json",
} as const;

type OpenAPISpec = {
  paths: Record<string, Record<string, EndpointDef>>;
  components?: { schemas?: Record<string, SchemaDef> };
  tags?: { name: string; description?: string }[];
};

type SchemaDef = {
  type?: string | string[];
  format?: string;
  enum?: string[];
  items?: SchemaDef;
  $ref?: string;
  oneOf?: SchemaDef[];
  allOf?: SchemaDef[];
  anyOf?: SchemaDef[];
  properties?: Record<string, SchemaDef>;
  required?: string[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  additionalProperties?: SchemaDef | boolean;
  prefixItems?: SchemaDef[];
};

type ParamDef = {
  name: string;
  in: string;
  required?: boolean;
  schema?: SchemaDef;
  description?: string;
};

type EndpointDef = {
  summary?: string;
  operationId?: string;
  tags?: string[];
  parameters?: ParamDef[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: SchemaDef }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: SchemaDef }> }>;
};

async function fetchSpec(name: keyof typeof SPECS): Promise<OpenAPISpec> {
  const res = await fetch(SPECS[name]);
  return res.json() as Promise<OpenAPISpec>;
}

function resolveRef(spec: OpenAPISpec, ref: string): SchemaDef {
  // "#/components/schemas/Foo" → spec.components.schemas.Foo
  const parts = ref.replace("#/", "").split("/");
  let current: unknown = spec;
  for (const p of parts) current = (current as Record<string, unknown>)[p];
  return current as SchemaDef;
}

function schemaToTS(spec: OpenAPISpec, schema: SchemaDef | undefined, indent = 0, seen = new Set<string>()): string {
  if (!schema) return "unknown";

  if (schema.$ref) {
    const name = schema.$ref.split("/").pop()!;
    if (seen.has(name)) return name;
    const resolved = resolveRef(spec, schema.$ref);
    seen.add(name);
    const body = schemaToTS(spec, resolved, indent, seen);
    // If it resolved to an object, label it
    if (resolved.type === "object" && resolved.properties) {
      return `${name} ${body}`;
    }
    return body === name ? name : `${name} /* ${body} */`;
  }

  if (schema.oneOf) {
    const variants = schema.oneOf.map((s) => schemaToTS(spec, s, indent, seen));
    const result = variants.join(" | ");
    return schema.default !== undefined ? `${result} (default: ${JSON.stringify(schema.default)})` : result;
  }
  if (schema.allOf) {
    return schema.allOf.map((s) => schemaToTS(spec, s, indent, seen)).join(" & ");
  }
  if (schema.anyOf) {
    return schema.anyOf.map((s) => schemaToTS(spec, s, indent, seen)).join(" | ");
  }

  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (schema.type === "array" && schema.prefixItems) {
    const items = schema.prefixItems.map((s) => schemaToTS(spec, s, indent, seen));
    return `[${items.join(", ")}]`;
  }

  if (schema.type === "array") {
    const inner = schemaToTS(spec, schema.items, indent, seen);
    return `${inner}[]`;
  }

  if (schema.type === "object" && schema.properties) {
    const pad = "  ".repeat(indent + 1);
    const closePad = "  ".repeat(indent);
    const required = new Set(schema.required ?? []);
    const lines = Object.entries(schema.properties).map(([key, val]) => {
      const opt = required.has(key) ? "" : "?";
      const desc = val.description ? `  // ${val.description}` : "";
      return `${pad}${key}${opt}: ${schemaToTS(spec, val, indent + 1, seen)};${desc}`;
    });
    return `{\n${lines.join("\n")}\n${closePad}}`;
  }

  if (schema.type === "object" && schema.additionalProperties) {
    const valType =
      typeof schema.additionalProperties === "boolean"
        ? "unknown"
        : schemaToTS(spec, schema.additionalProperties, indent, seen);
    return `Record<string, ${valType}>`;
  }

  // Handle array type like ["integer", "null"]
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((t) => t !== "null");
    const hasNull = schema.type.includes("null");
    const base = types.length === 1 ? schemaToTS(spec, { ...schema, type: types[0] }, indent, seen) : types.join(" | ");
    return hasNull ? `${base} | null` : base;
  }

  if (schema.type === "null") return "null";
  if (schema.type === "string") {
    const fmt = schema.format ? ` (${schema.format})` : "";
    return `string${fmt}`;
  }
  if (schema.type === "integer" || schema.type === "number") {
    const fmt = schema.format ? ` (${schema.format})` : "";
    return `number${fmt}`;
  }
  if (schema.type === "boolean") return "boolean";

  if (schema.type === "object") return "Record<string, unknown>";

  return "unknown";
}

function paramToTS(spec: OpenAPISpec, param: ParamDef): string {
  const opt = param.required ? "" : "?";
  const type = schemaToTS(spec, param.schema);
  const def = param.schema?.default !== undefined ? ` = ${JSON.stringify(param.schema.default)}` : "";
  const desc = param.description ? `  // ${param.description}` : "";
  return `  ${param.name}${opt}: ${type}${def},${desc}`;
}

function printEndpointList(spec: OpenAPISpec) {
  const entries = Object.entries(spec.paths).map(([path, methods]) => {
    const [method, def] = Object.entries(methods)[0];
    return {
      path,
      method: method.toUpperCase(),
      tag: def.tags?.[0] ?? "untagged",
      summary: def.summary ?? def.operationId ?? "",
      operationId: def.operationId ?? "",
    };
  });

  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = grouped.get(e.tag);
    if (arr) arr.push(e);
    else grouped.set(e.tag, [e]);
  }

  for (const [tag, endpoints] of grouped) {
    console.log(`\n## ${tag}\n`);
    for (const ep of endpoints) {
      const opId = ep.operationId ? ` (${ep.operationId})` : "";
      console.log(`  ${ep.method} ${ep.path} — ${ep.summary}${opId}`);
    }
  }
}

function printEndpointDetail(spec: OpenAPISpec, path: string) {
  // Find the path - support both exact match and suffix match
  let matchedPath = path;
  if (!spec.paths[path]) {
    const match = Object.keys(spec.paths).find((p) => p.endsWith(path) || p === `/${path}` || p === path);
    if (!match) {
      console.error(`Endpoint not found: ${path}`);
      console.error(`\nTip: Run without arguments to see all endpoints.`);
      process.exit(1);
    }
    matchedPath = match;
  }

  const methods = spec.paths[matchedPath];
  for (const [method, def] of Object.entries(methods)) {
    console.log(`## ${method.toUpperCase()} ${matchedPath}`);
    if (def.summary) console.log(`Summary: ${def.summary}`);
    if (def.operationId) console.log(`Operation ID: ${def.operationId}`);
    if (def.tags?.length) console.log(`Tag: ${def.tags.join(", ")} → ${def.tags[0]}Api class`);

    // Path params
    const pathParams = def.parameters?.filter((p) => p.in === "path") ?? [];
    const queryParams = def.parameters?.filter((p) => p.in === "query") ?? [];

    if (pathParams.length) {
      console.log(`\nPath params:`);
      for (const p of pathParams) console.log(paramToTS(spec, p));
    }

    if (queryParams.length) {
      console.log(`\nQuery params:`);
      for (const p of queryParams) console.log(paramToTS(spec, p));
    }

    // Request body
    if (def.requestBody) {
      const bodySchema = def.requestBody.content?.["application/json"]?.schema;
      console.log(`\nRequest body${def.requestBody.required ? "" : " (optional)"}:`);
      console.log(`  ${schemaToTS(spec, bodySchema, 1)}`);
    }

    // Response
    const okResponse = def.responses?.["200"] ?? def.responses?.["201"];
    const responseSchema = okResponse?.content?.["application/json"]?.schema;
    if (responseSchema) {
      console.log(`\nResponse:`);
      console.log(`  ${schemaToTS(spec, responseSchema, 1)}`);
    }

    console.log();
  }
}

// --- CLI ---

import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    assets: { type: "boolean", default: false },
    url: { type: "string" },
  },
  allowPositionals: true,
  strict: true,
});

const endpoint = positionals[0];
const spec = values.url
  ? ((await (await fetch(values.url)).json()) as OpenAPISpec)
  : await fetchSpec(values.assets ? "assets" : "api");

if (endpoint) {
  // Search for matching endpoints if it looks like a keyword
  if (!endpoint.startsWith("/") && !endpoint.includes("/")) {
    const matches = Object.keys(spec.paths).filter((p) => p.toLowerCase().includes(endpoint.toLowerCase()));
    if (matches.length === 0) {
      console.error(`No endpoints matching "${endpoint}"`);
      process.exit(1);
    }
    if (matches.length === 1) {
      printEndpointDetail(spec, matches[0]);
    } else {
      console.log(`Endpoints matching "${endpoint}":\n`);
      for (const m of matches) {
        const def = Object.values(spec.paths[m])[0];
        console.log(`  ${m} — ${def.summary ?? ""}`);
      }
      console.log(`\nPass the full path for details.`);
    }
  } else {
    printEndpointDetail(spec, endpoint);
  }
} else {
  printEndpointList(spec);
}
