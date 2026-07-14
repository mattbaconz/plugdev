export interface DepPreset {
  aliases: string[];
  /** Hangar author (required when source is hangar). */
  author?: string;
  /** Hangar slug or display name. */
  slug: string;
  description: string;
  /** Default download source. Hangar unless set to modrinth. */
  source?: "hangar" | "modrinth";
  /** Modrinth project slug/id when source is modrinth (or Hangar missing). */
  modrinthSlug?: string;
}

export const DEP_PRESETS: DepPreset[] = [
  {
    aliases: ["viaversion", "via"],
    author: "ViaVersion",
    slug: "ViaVersion",
    description: "ViaVersion — newer clients join older servers",
  },
  {
    aliases: ["viabackwards"],
    author: "ViaVersion",
    slug: "ViaBackwards",
    description: "ViaBackwards — older clients join newer servers",
  },
  {
    aliases: ["viarewind"],
    author: "ViaVersion",
    slug: "ViaRewind",
    description: "ViaRewind — 1.8/1.7 clients on modern servers",
  },
  {
    aliases: ["essentials", "essentialsx"],
    slug: "EssentialsX",
    description: "EssentialsX — commands, homes, economy base",
    source: "modrinth",
    modrinthSlug: "essentialsx",
  },
  {
    aliases: ["vault", "vaultunlocked"],
    author: "TNE",
    slug: "VaultUnlocked",
    description: "VaultUnlocked — economy/permission API",
  },
  {
    aliases: ["luckperms"],
    slug: "LuckPerms",
    description: "LuckPerms — permissions",
    source: "modrinth",
    modrinthSlug: "luckperms",
  },
  {
    aliases: ["placeholderapi", "papi"],
    author: "HelpChat",
    slug: "PlaceholderAPI",
    description: "PlaceholderAPI — placeholder expansions",
  },
  {
    aliases: ["mineconomy"],
    author: "Guayand0",
    slug: "Mineconomy",
    description: "MineConomy — standalone economy",
  },
  {
    aliases: ["worldguard"],
    slug: "WorldGuard",
    description: "WorldGuard — region protection",
    source: "modrinth",
    modrinthSlug: "worldguard",
  },
  {
    aliases: ["worldedit"],
    author: "EngineHub",
    slug: "WorldEdit",
    description: "WorldEdit — world editing",
  },
  {
    aliases: ["griefprevention"],
    author: "GriefPrevention",
    slug: "GriefPrevention",
    description: "GriefPrevention — claim-based protection",
  },
  {
    aliases: ["towny"],
    author: "TownyAdvanced",
    slug: "Towny",
    description: "Towny — town/nation protection",
  },
  {
    aliases: ["floodgate"],
    author: "GeyserMC",
    slug: "Floodgate",
    description: "Floodgate — Bedrock player support (with Geyser)",
  },
  {
    aliases: ["mythicmobs"],
    author: "Lumine",
    slug: "MythicMobs",
    description: "MythicMobs — custom mobs/skills",
  },
  {
    aliases: ["protocollib"],
    author: "dmulloy2",
    slug: "ProtocolLib",
    description: "ProtocolLib — packet API",
  },
  {
    aliases: ["multiverse", "multiversecore"],
    author: "Multiverse",
    slug: "Multiverse-Core",
    description: "Multiverse-Core — multi-world management",
  },
  {
    aliases: ["coreprotect"],
    author: "CORE",
    slug: "CoreProtect",
    description: "CoreProtect — block logging / rollback",
  },
  {
    aliases: ["discordsrv"],
    slug: "DiscordSRV",
    description: "DiscordSRV — Discord bridge",
    source: "modrinth",
    modrinthSlug: "discordsrv",
  },
];

/**
 * Historical full default stack (Via* + common APIs).
 * `init` now writes Via* + project-detected deps; this list remains for tests / reference.
 */
export const DEFAULT_COMPAT_DEPS: Array<{
  name: string;
  source: "hangar" | "modrinth";
  author?: string;
  slug: string;
}> = [
  { name: "ViaVersion", source: "hangar", author: "ViaVersion", slug: "ViaVersion" },
  { name: "ViaBackwards", source: "hangar", author: "ViaVersion", slug: "ViaBackwards" },
  { name: "ViaRewind", source: "hangar", author: "ViaVersion", slug: "ViaRewind" },
  { name: "VaultUnlocked", source: "hangar", author: "TNE", slug: "VaultUnlocked" },
  { name: "EssentialsX", source: "modrinth", slug: "essentialsx" },
  { name: "MineConomy", source: "hangar", author: "Guayand0", slug: "Mineconomy" },
];

export const DEP_ALIASES: Record<string, { author: string; slug: string }> =
  Object.fromEntries(
    DEP_PRESETS.filter((p) => p.author).flatMap((p) =>
      p.aliases.map((a) => [a, { author: p.author!, slug: p.slug }]),
    ),
  );

export function listPresetNames(): string[] {
  return DEP_PRESETS.map((p) => p.aliases[0]);
}

export function findPreset(name: string): DepPreset | undefined {
  const key = name.toLowerCase().replace(/[\s_-]+/g, "");
  return DEP_PRESETS.find(
    (p) =>
      p.aliases.some((a) => a.toLowerCase().replace(/[\s_-]+/g, "") === key) ||
      p.slug.toLowerCase().replace(/[\s_-]+/g, "") === key,
  );
}

export function hangarPlatform(server: string): "PAPER" | "FOLIA" {
  return server === "folia" ? "FOLIA" : "PAPER";
}

/** True when config lists any Via* plugin (cross-version client join). */
export function hasViaCompatDeps(
  deps?: Array<{ name: string; author?: string; slug?: string; enabled?: boolean }>,
): boolean {
  if (!deps?.length) return false;
  return deps.some((d) => {
    if (d.enabled === false) return false;
    const key = `${d.author ?? ""}/${d.slug ?? ""}/${d.name}`.toLowerCase();
    return (
      key.includes("viaversion") ||
      key.includes("viabackwards") ||
      key.includes("viarewind")
    );
  });
}
