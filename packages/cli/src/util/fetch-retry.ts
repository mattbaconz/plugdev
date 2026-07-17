import { Agent, fetch as undiciFetch, interceptors } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";
import { Errors } from "./errors.js";

const ERROR_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
] as const;

let sharedDispatcher: ReturnType<Agent["compose"]> | undefined;

function downloadDispatcher(): ReturnType<Agent["compose"]> {
  if (!sharedDispatcher) {
    sharedDispatcher = new Agent({
      connections: 4,
      connectTimeout: 30_000,
      headersTimeout: 60_000,
      bodyTimeout: 180_000,
    }).compose(
      interceptors.retry({
        maxRetries: 5,
        methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "TRACE"],
        statusCodes: [429, 500, 502, 503, 504],
        errorCodes: [...ERROR_CODES],
      }),
      interceptors.redirect({ maxRedirections: 5 }),
    );
  }
  return sharedDispatcher;
}

export function formatNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code) return `${err.message} (${code}: ${cause.message})`;
    return `${err.message} (${cause.message})`;
  }
  const code = (err as NodeJS.ErrnoException).code;
  if (code) return `${err.message} (${code})`;
  return err.message;
}

export type FetchWithRetryInit = UndiciRequestInit & {
  /** When false, rethrow the raw error instead of wrapping as downloadFailed. Default true. */
  wrapDownloadFailed?: boolean;
};

type FetchImpl = (
  url: string,
  init?: UndiciRequestInit,
) => Promise<UndiciResponse>;

/**
 * HTTP GET/fetch with undici retries for transient network errors (ECONNRESET, etc.).
 * Final network failures become PlugDevError via Errors.downloadFailed unless wrapDownloadFailed is false.
 */
export async function fetchWithRetry(
  url: string,
  init: FetchWithRetryInit = {},
  fetchImpl: FetchImpl = undiciFetch,
): Promise<UndiciResponse> {
  const { wrapDownloadFailed = true, dispatcher, ...requestInit } = init;
  try {
    return await fetchImpl(url, {
      ...requestInit,
      dispatcher: dispatcher ?? downloadDispatcher(),
    });
  } catch (err) {
    if (!wrapDownloadFailed) throw err;
    throw Errors.downloadFailed(formatNetworkError(err));
  }
}

/**
 * Await primary while ensuring a parallel sibling cannot become an unhandled rejection
 * when primary fails first (Promise.all sibling leak).
 */
export async function awaitWithSettledSibling<T>(
  primary: Promise<T>,
  sibling?: Promise<unknown>,
): Promise<T> {
  if (!sibling) return primary;
  const [primaryResult, siblingResult] = await Promise.allSettled([primary, sibling]);
  if (primaryResult.status === "fulfilled") {
    if (siblingResult.status === "rejected") throw siblingResult.reason;
    return primaryResult.value;
  }
  throw primaryResult.reason;
}
