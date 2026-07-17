import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awaitWithSettledSibling,
  fetchWithRetry,
  formatNetworkError,
} from "./fetch-retry.js";
import { PlugDevError } from "./errors.js";

test("formatNetworkError includes ECONNRESET cause", () => {
  const cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  const err = Object.assign(new TypeError("fetch failed"), { cause });
  assert.match(formatNetworkError(err), /ECONNRESET/);
});

test("fetchWithRetry maps network failure to PlugDevError", async () => {
  const cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  const networkError = Object.assign(new TypeError("fetch failed"), { cause });

  await assert.rejects(
    () =>
      fetchWithRetry("https://example.invalid/paper.jar", {}, async () => {
        throw networkError;
      }),
    (err: unknown) => {
      assert.ok(err instanceof PlugDevError);
      assert.match(err.message, /Server download failed/);
      assert.match(err.info.cause, /ECONNRESET|fetch failed/);
      return true;
    },
  );
});

test("awaitWithSettledSibling settles sibling when primary rejects first", async () => {
  let siblingSettled = false;
  const primary = Promise.reject(new Error("primary failed"));
  const sibling = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      siblingSettled = true;
      reject(new Error("sibling failed"));
    }, 20);
  });

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);

  try {
    await assert.rejects(
      () => awaitWithSettledSibling(primary, sibling),
      /primary failed/,
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(siblingSettled, true);
    assert.equal(unhandled.length, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("awaitWithSettledSibling returns primary when both succeed", async () => {
  const value = await awaitWithSettledSibling(
    Promise.resolve(42),
    Promise.resolve("ok"),
  );
  assert.equal(value, 42);
});
