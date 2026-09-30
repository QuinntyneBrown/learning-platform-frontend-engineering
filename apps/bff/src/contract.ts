import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export type JsonSchema = Record<string, unknown>;

/** The parts of openapi.yaml this code reads. */
export interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema>; responses: Record<string, unknown> };
}

export function loadContract(): OpenApiDocument {
  const url = import.meta.resolve('@coursewright/contracts/openapi.yaml');
  return parse(readFileSync(fileURLToPath(url), 'utf8')) as OpenApiDocument;
}

/**
 * The contract's component schemas as standalone JSON Schemas, ready for Fastify's `addSchema`
 * or Ajv. Each gets `$id: <its name>`, so a route validates its body against the contract itself
 * with `{ $ref: 'LoginRequest#' }` and the BFF can't quietly drift from openapi.yaml.
 */
export function componentSchemas(contract: OpenApiDocument): JsonSchema[] {
  return Object.entries(contract.components.schemas).map(([name, schema]) => ({
    $id: name,
    ...(toSharedRefs(schema) as JsonSchema),
  }));
}

/** Rewrites OpenAPI's document-relative `#/components/schemas/X` into a reference to schema `X`. */
export function toSharedRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toSharedRefs);
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) =>
      key === '$ref' && typeof value === 'string'
        ? [key, `${value.replace('#/components/schemas/', '')}#`]
        : [key, toSharedRefs(value)],
    ),
  );
}
