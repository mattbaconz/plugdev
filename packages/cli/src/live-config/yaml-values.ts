import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { readFile, writeFile } from "node:fs/promises";

export function parseConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

export function normalizeConfigKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Config key must not be empty");
  if (trimmed.includes("\0")) throw new Error("Config key must not contain null bytes");
  const parts = trimmed.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) throw new Error("Config key must not be empty");
  return parts.join(".");
}

export function getNestedValue(root: unknown, dottedKey: string): unknown {
  const parts = normalizeConfigKey(dottedKey).split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setNestedValue(
  root: Record<string, unknown>,
  dottedKey: string,
  value: unknown,
): void {
  const parts = normalizeConfigKey(dottedKey).split(".");
  let current: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = current[part];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function asDocumentObject(parsed: unknown): Record<string, unknown> {
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Live config root must be a YAML mapping");
  }
  return parsed as Record<string, unknown>;
}

export async function readLiveConfigDocument(absolutePath: string): Promise<unknown> {
  const text = await readFile(absolutePath, "utf8");
  return parseYaml(text) ?? {};
}

export async function getLiveConfigValue(
  absolutePath: string,
  key?: string,
): Promise<{ document: unknown; value: unknown; key?: string }> {
  const document = await readLiveConfigDocument(absolutePath);
  if (!key) return { document, value: document };
  const normalized = normalizeConfigKey(key);
  return {
    document,
    key: normalized,
    value: getNestedValue(document, normalized),
  };
}

export async function setLiveConfigValue(
  absolutePath: string,
  key: string,
  value: unknown,
): Promise<{ key: string; value: unknown; document: Record<string, unknown> }> {
  const normalized = normalizeConfigKey(key);
  const document = asDocumentObject(await readLiveConfigDocument(absolutePath));
  setNestedValue(document, normalized, value);
  await writeFile(absolutePath, stringifyYaml(document, { lineWidth: 0 }), "utf8");
  return { key: normalized, value, document };
}

export function formatConfigValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return JSON.stringify(value, null, 2);
}
