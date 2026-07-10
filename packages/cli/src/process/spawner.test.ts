import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { safeStdinWrite } from "./spawner.js";

class FakeStdin extends EventEmitter {
  destroyed = false;
  writable = true;
  writes: string[] = [];
  throwOnWrite: Error | null = null;

  write(data: string, cb?: (err?: Error | null) => void): boolean {
    if (this.throwOnWrite) {
      const err = this.throwOnWrite;
      this.throwOnWrite = null;
      throw err;
    }
    this.writes.push(data);
    cb?.(null);
    return true;
  }
}

test("safeStdinWrite writes when stream is writable", () => {
  const stdin = new FakeStdin();
  safeStdinWrite(stdin as unknown as NodeJS.WritableStream, "stop\n");
  assert.deepEqual(stdin.writes, ["stop\n"]);
});

test("safeStdinWrite no-ops when destroyed or not writable", () => {
  const destroyed = new FakeStdin();
  destroyed.destroyed = true;
  safeStdinWrite(destroyed as unknown as NodeJS.WritableStream, "stop\n");
  assert.equal(destroyed.writes.length, 0);

  const closed = new FakeStdin();
  closed.writable = false;
  safeStdinWrite(closed as unknown as NodeJS.WritableStream, "stop\n");
  assert.equal(closed.writes.length, 0);

  safeStdinWrite(null, "stop\n");
  safeStdinWrite(undefined, "stop\n");
});

test("safeStdinWrite swallows synchronous EPIPE", () => {
  const stdin = new FakeStdin();
  const err = new Error("write EPIPE") as NodeJS.ErrnoException;
  err.code = "EPIPE";
  stdin.throwOnWrite = err;
  assert.doesNotThrow(() =>
    safeStdinWrite(stdin as unknown as NodeJS.WritableStream, "stop\n"),
  );
});

test("safeStdinWrite swallows ERR_STREAM_DESTROYED", () => {
  const stdin = new FakeStdin();
  const err = new Error("destroyed") as NodeJS.ErrnoException;
  err.code = "ERR_STREAM_DESTROYED";
  stdin.throwOnWrite = err;
  assert.doesNotThrow(() =>
    safeStdinWrite(stdin as unknown as NodeJS.WritableStream, "stop\n"),
  );
});
