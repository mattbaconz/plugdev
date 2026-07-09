export interface DepPreset {
  aliases: string[];
  author: string;
  slug: string;
  description: string;
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
    author: "EssentialsX",
    slug: "EssentialsX",
    description: "EssentialsX — commands, homes, economy base",
  },
  {
    aliases: ["vault", "vaultunlocked"],
    author: "TNE",
    slug: "VaultUnlocked",
    description: "VaultUnlocked — economy/permission API",
  },
  {
    aliases: ["luckperms"],
    author: "LuckPerms",
    slug: "LuckPerms",
    description: "LuckPerms — permissions",
  },
  {
    aliases: ["placeholderapi", "papi"],
    author: "HelpChat",
    slug: "PlaceholderAPI",
    description: "PlaceholderAPI — placeholder expansions",
  },
  {
    aliases: ["mineconomy"],
    author: "piyushkadam",
    slug: "MineConomy",
    description: "MineConomy — standalone economy",
  },
];

/** Default Hangar deps written by `plugdev init` and prefetched by `setup`. */
export const DEFAULT_COMPAT_DEPS: Array<{
  name: string;
  source: "hangar";
  author: string;
  slug: string;
}> = [
  { name: "ViaVersion", source: "hangar", author: "ViaVersion", slug: "ViaVersion" },
  { name: "ViaBackwards", source: "hangar", author: "ViaVersion", slug: "ViaBackwards" },
  { name: "ViaRewind", source: "hangar", author: "ViaVersion", slug: "ViaRewind" },
];

export const DEP_ALIASES: Record<string, { author: string; slug: string }> =
  Object.fromEntries(
    DEP_PRESETS.flatMap((p) =>
      p.aliases.map((a) => [a, { author: p.author, slug: p.slug }]),
    ),
  );

export function listPresetNames(): string[] {
  return DEP_PRESETS.map((p) => p.aliases[0]);
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
