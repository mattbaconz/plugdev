import assert from "node:assert/strict";
import { test } from "node:test";
import { doctorFixCommand, type DoctorFixInput } from "./doctor-fix.js";

function base(overrides: Partial<DoctorFixInput> = {}): DoctorFixInput {
  return {
    isDiscordBot: false,
    isMod: false,
    projectType: "plugin",
    javaOk: true,
    minJava: 21,
    buildSystem: "gradle",
    gradleOk: true,
    bootstrapOk: true,
    spigotMissing: false,
    setupReady: true,
    toolchainReady: true,
    ...overrides,
  };
}

test("doctorFixCommand returns undefined when ready", () => {
  assert.equal(doctorFixCommand(base()), undefined);
});

test("doctorFixCommand prioritizes Java over bootstrap", () => {
  assert.equal(
    doctorFixCommand(
      base({
        javaOk: false,
        bootstrapOk: false,
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "Install JDK 21+ from https://adoptium.net/",
  );
});

test("doctorFixCommand suggests Temurin scoop for Java 25+", () => {
  assert.equal(
    doctorFixCommand(
      base({
        javaOk: false,
        minJava: 25,
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "Install JDK 25+ (e.g. scoop install temurin25-jdk) — https://adoptium.net/",
  );
});

test("doctorFixCommand prioritizes bootstrap reinstall over setup", () => {
  assert.equal(
    doctorFixCommand(
      base({
        bootstrapOk: false,
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "npm i -g @plugdev/cli@latest",
  );
});

test("doctorFixCommand prioritizes Spigot jar over setup", () => {
  assert.equal(
    doctorFixCommand(
      base({
        spigotMissing: true,
        spigotJarPath: "C:/cache/spigot-1.21.4.jar",
        spigotVersion: "1.21.4",
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "Run BuildTools for 1.21.4 and copy spigot-1.21.4.jar to C:/cache/spigot-1.21.4.jar",
  );
});

test("doctorFixCommand suggests plugdev setup when cache missing", () => {
  assert.equal(
    doctorFixCommand(
      base({
        toolchainReady: true,
        setupReady: false,
      }),
    ),
    "plugdev setup",
  );
});

test("doctorFixCommand Discord bot: Node then token", () => {
  assert.equal(
    doctorFixCommand(
      base({
        isDiscordBot: true,
        nodeOk: false,
        tokenPresent: false,
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "Install Node.js from https://nodejs.org/",
  );
  assert.equal(
    doctorFixCommand(
      base({
        isDiscordBot: true,
        nodeOk: true,
        tokenPresent: false,
        tokenEnvName: "BOT_TOKEN",
        toolchainReady: true,
        setupReady: false,
      }),
    ),
    "Set BOT_TOKEN in the environment or .env",
  );
});

test("doctorFixCommand unknown project", () => {
  assert.equal(
    doctorFixCommand(
      base({
        projectType: "unknown",
        toolchainReady: false,
        setupReady: false,
      }),
    ),
    "Add plugin.yml (or fabric.mod.json) in a Maven/Gradle project, then re-run: plugdev doctor",
  );
});
