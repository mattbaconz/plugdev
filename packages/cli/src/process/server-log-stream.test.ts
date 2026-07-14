import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatServerLogLine,
  shouldShowServerLine,
  isNotableServerLine,
  createServerLogWriter,
} from "./server-log-stream.js";
import { emptyRconHint } from "./interactive-console.js";

describe("shouldShowServerLine", () => {
  it("verbose boot and live show INFO", () => {
    assert.equal(shouldShowServerLine("[INFO]: hello", "verbose", "boot"), true);
    assert.equal(shouldShowServerLine("[INFO]: hello", "verbose", "live"), true);
  });

  it("quiet boot hides INFO; quiet live keeps ERROR", () => {
    assert.equal(shouldShowServerLine("[INFO]: hello", "quiet", "boot"), false);
    assert.equal(shouldShowServerLine("[INFO]: hello", "quiet", "live"), false);
    assert.equal(
      shouldShowServerLine("[SEVERE]: boom", "quiet", "live"),
      true,
    );
    assert.equal(
      shouldShowServerLine("  at com.example.Foo.bar(Foo.java:10)", "quiet", "live"),
      true,
    );
  });
});

describe("isNotableServerLine / formatServerLogLine", () => {
  it("detects ERROR, WARN, stack", () => {
    assert.equal(isNotableServerLine("[ERROR]: fail"), true);
    assert.equal(isNotableServerLine("[WARN]: careful"), true);
    assert.equal(isNotableServerLine("  at foo.Bar.run(Bar.java:1)"), true);
    assert.equal(isNotableServerLine("[INFO]: ok"), false);
  });

  it("formats ERROR in red with prefix", () => {
    const out = formatServerLogLine("[SEVERE]: command failed");
    assert.match(out, /SEVERE/);
    assert.match(out, /│/);
  });
});

describe("createServerLogWriter", () => {
  it("keeps writing after markReady under verbose", () => {
    const chunks: string[] = [];
    const fake = {
      write(s: string) {
        chunks.push(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const writer = createServerLogWriter("verbose");
    writer.writeChunk(Buffer.from("[INFO]: boot\nDone (1s)!\n"), fake);
    writer.markReady();
    writer.writeChunk(Buffer.from("[SEVERE]: after ready\n"), fake);

    const joined = chunks.join("");
    assert.match(joined, /boot/);
    assert.match(joined, /after ready/);
  });

  it("quiet live filters INFO but keeps ERROR", () => {
    const chunks: string[] = [];
    const fake = {
      write(s: string) {
        chunks.push(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const writer = createServerLogWriter("quiet");
    writer.writeChunk(Buffer.from("[INFO]: silent\nDone (1s)!\n"), fake);
    writer.markReady();
    writer.writeChunk(Buffer.from("[INFO]: still quiet\n[ERROR]: visible\n"), fake);

    const joined = chunks.join("");
    assert.doesNotMatch(joined, /still quiet/);
    assert.match(joined, /visible/);
  });
});

describe("emptyRconHint", () => {
  it("mentions ERROR lines", () => {
    assert.match(emptyRconHint(), /ERROR/);
  });
});
