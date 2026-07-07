export interface DepPreset {
  aliases: string[];
  author: string;
  slug: string;
  description: string;
}

export const DEP_PRESETS: DepPreset[] = [
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
