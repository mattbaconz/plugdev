---
title: Detection Rules
tags: [plugdev, spec, agents]
aliases: [detection-rules]
created: 2026-07-06
status: stable
---

# Project Detection Rules

Machine-readable mapping from project signals to PlugDev `type`, `loader`, and Gradle/Maven task. Used by the CLI `ProjectDetector` and documented in [[docs/architecture/project-detection]].

## Priority order

Detection runs top-to-bottom; first strong match wins. Explicit `plugdev.yml` `type` field overrides auto-detection.

## Signal table

| Priority | Signal (file or Gradle plugin) | type | loader / server | Default task | build.system |
|----------|-------------------------------|------|-----------------|--------------|--------------|
| 1 | `plugdev.yml` with `type: network` | network | velocity | — | gradle |
| 2 | `plugdev.yml` with `type: pack` | pack | — | — | — |
| 3 | `plugdev.yml` with `type: mod` | mod | from config | see loader | gradle |
| 4 | `plugdev.yml` with `type: plugin` | plugin | paper | runServer | from config |
| 5 | `fabric.mod.json` in `src/main/resources/` | mod | fabric | runClient | gradle |
| 6 | `quilt.mod.json` | mod | quilt | runClient | gradle |
| 7 | `META-INF/neoforge.mods.toml` or `neoforge.mods.toml` | mod | neoforge | runClient | gradle |
| 8 | `META-INF/mods.toml` (Forge) | mod | forge | runClient | gradle |
| 9 | Gradle `id("fabric-loom")` or `fabric-loom` | mod | fabric | runClient | gradle |
| 10 | Gradle `id("org.quiltmc.loom")` | mod | quilt | runClient | gradle |
| 11 | Gradle `id("net.neoforged.moddev")` | mod | neoforge | runClient | gradle |
| 12 | Gradle `id("net.neoforged.moddev.legacyforge")` | mod | forge | runClient | gradle |
| 13 | Gradle `id("net.minecraftforge.gradle")` | mod | forge | runClient | gradle |
| 14 | Gradle `architectury` plugin + subprojects | mod | architectury | `:fabric:runClient` | gradle |
| 15 | `plugin.yml` or `paper-plugin.yml` in resources | plugin | paper | runServer | gradle |
| 16 | Gradle `id("xyz.jpenilla.run-paper")` | plugin | paper | runServer | gradle |
| 17 | Gradle `id("com.rikonardo.papermake")` | plugin | paper | devServer | gradle |
| 18 | Gradle `id("ru.endlesscode.bukkitgradle")` | plugin | paper | runServer | gradle |
| 19 | `pom.xml` + `paper-api` dependency | plugin | paper | package | maven |
| 20 | `pom.xml` + `run-paper-maven-plugin` | plugin | paper | run | maven |
| 21 | `server.toml` (mcman-style) | pack | serverpack | — | — |
| 22 | `data/` namespace at repo root (datapack) | pack | datapack | — | — |

## Version detection

| Source | Field | Example |
|--------|-------|---------|
| `plugin.yml` | `api-version` | `1.21` |
| `gradle.properties` | `minecraft_version` | `1.21.4` |
| `gradle.properties` | `neoForgeVersion` | NeoForge version string |
| `fabric.mod.json` | `depends.minecraft` | `1.21.x` |
| `neoforge.mods.toml` | loader version range | parse for MC version |
| `plugdev.yml` | `version` | explicit override |

## Multi-loader subproject resolution

| Loader flag | Gradle subproject | Task |
|-------------|-------------------|------|
| `fabric` | `:fabric` | `:fabric:runClient` |
| `neoforge` | `:neoforge` | `:neoforge:runClient` |
| `forge` | `:forge` | `:forge:runClient` |

If only one loader subproject exists, use it without `--loader` flag.

## Folia detection

| Signal | Action |
|--------|--------|
| `plugin.yml` contains `folia-supported: true` | Suggest `server: folia` in generated config |
| User passes `--folia` | Override `server` to folia |
| `plugdev.yml` `server: folia` | Use Folia download + `runFolia` or cached Folia jar |

## Confidence levels

| Level | Meaning |
|-------|---------|
| `explicit` | `plugdev.yml` present |
| `strong` | Loader-specific manifest (`fabric.mod.json`, etc.) |
| `weak` | Gradle plugin only |
| `ambiguous` | Multiple signals — prompt user or prefer `plugdev init` |

## Ambiguity resolution

When both `plugin.yml` and `fabric.mod.json` exist (hybrid repo):

1. Prefer `plugdev.yml` if present
2. Else prefer mod if `fabric-loom` / MDG plugin applied
3. Else prompt: `plugdev detected both plugin and mod signals. Use --plugin or --mod.`
