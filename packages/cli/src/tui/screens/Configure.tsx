import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { PlugDevConfig } from "../../config/loader.js";
import { updatePlugdevYml } from "../../deps/config-write.js";
import { theme } from "../theme.js";

type FieldId =
  | "version"
  | "server"
  | "port"
  | "launcher"
  | "instance"
  | "offlineName"
  | "players"
  | "joinOnReady"
  | "world"
  | "gamemode"
  | "memory";

type FieldKind = "text" | "enum" | "instance";

interface FieldDef {
  id: FieldId;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  hint?: string;
}

const SERVERS = ["paper", "folia", "purpur", "pufferfish", "spigot"] as const;
const LAUNCHERS = ["auto", "embedded", "prism", "multimc", "none"] as const;
const WORLDS = ["void", "flat", "default"] as const;
const BOOLS = ["true", "false"] as const;
const GAMEMODES = ["creative", "survival", "adventure", "spectator"] as const;

const ALL_FIELDS: FieldDef[] = [
  { id: "version", label: "Minecraft version", kind: "text", hint: "e.g. 1.20.6 · 1.21.4" },
  { id: "server", label: "Server", kind: "enum", options: SERVERS, hint: "←→ cycle" },
  { id: "port", label: "Port", kind: "text", hint: "25565" },
  { id: "launcher", label: "Client launcher", kind: "enum", options: LAUNCHERS, hint: "←→ cycle" },
  { id: "instance", label: "Prism instance", kind: "instance", hint: "Enter to pick" },
  { id: "offlineName", label: "Offline name", kind: "text", hint: "primary player" },
  { id: "players", label: "Extra players", kind: "text", hint: "comma-separated" },
  { id: "joinOnReady", label: "Join on ready", kind: "enum", options: BOOLS, hint: "←→ cycle" },
  { id: "world", label: "World", kind: "enum", options: WORLDS, hint: "←→ cycle" },
  { id: "gamemode", label: "Gamemode", kind: "enum", options: GAMEMODES, hint: "←→ cycle" },
  { id: "memory", label: "JVM memory", kind: "text", hint: "e.g. 1G" },
];

export function valuesFromConfig(raw: PlugDevConfig): Record<FieldId, string> {
  const players = (raw.client?.players ?? []).map((p) => p.name).join(", ");
  return {
    version: raw.version ?? "",
    server: raw.server ?? "paper",
    port: String(raw.port ?? 25565),
    launcher: raw.client?.launcher ?? "auto",
    instance: raw.client?.instance ?? "",
    offlineName: raw.client?.offlineName ?? "DevPlayer",
    players,
    joinOnReady:
      raw.client?.joinOnReady === undefined
        ? "true"
        : String(raw.client.joinOnReady),
    world: raw.dev?.world ?? "void",
    gamemode: raw.dev?.gamemode ?? "creative",
    memory: raw.jvm?.memory ?? "1G",
  };
}

export function patchFromValues(
  values: Record<FieldId, string>,
): Parameters<typeof updatePlugdevYml>[1] {
  const playerNames = values.players
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const port = Number.parseInt(values.port, 10);
  const joinOnReady = /^(true|1|yes)$/i.test(values.joinOnReady.trim());
  const instance = values.instance.trim();

  return {
    version: values.version.trim() || undefined,
    server: (values.server.trim() || "paper") as PlugDevConfig["server"],
    port: Number.isFinite(port) ? port : 25565,
    client: {
      launcher: (values.launcher.trim() || "auto") as NonNullable<
        PlugDevConfig["client"]
      >["launcher"],
      offlineName: values.offlineName.trim() || "DevPlayer",
      joinOnReady,
      players: playerNames.map((name) => ({ name })),
      ...(instance ? { instance } : {}),
    },
    dev: {
      world: values.world.trim() || "void",
      gamemode: values.gamemode.trim() || "creative",
    },
    jvm: {
      memory: values.memory.trim() || "1G",
    },
  };
}

function cycleOption(options: readonly string[], current: string, dir: 1 | -1): string {
  const idx = options.findIndex((o) => o.toLowerCase() === current.toLowerCase());
  const base = idx >= 0 ? idx : 0;
  const next = (base + dir + options.length) % options.length;
  return options[next]!;
}

function visibleFields(launcher: string): FieldDef[] {
  const showInstance =
    launcher === "prism" || launcher === "multimc" || launcher === "auto";
  return ALL_FIELDS.filter((f) => f.id !== "instance" || showInstance);
}

export function ConfigureScreen(props: {
  cwd: string;
  raw: PlugDevConfig;
  onBack: () => void;
  onPickInstance: () => void;
}): React.ReactElement {
  const initial = useMemo(() => valuesFromConfig(props.raw), [props.raw]);
  const [values, setValues] = useState(initial);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | undefined>();
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "muted">("muted");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fields = useMemo(() => visibleFields(values.launcher), [values.launcher]);
  const field = fields[Math.min(fieldIndex, fields.length - 1)]!;

  const persist = useCallback(
    async (next: Record<FieldId, string>, label?: string) => {
      setSaving(true);
      const result = await updatePlugdevYml(props.cwd, patchFromValues(next));
      setSaving(false);
      if (result.ok) {
        setDirty(false);
        setStatus(label ? `Saved · ${label}` : "Saved");
        setStatusKind("ok");
        return true;
      }
      setStatus(result.reason);
      setStatusKind("err");
      return false;
    },
    [props.cwd],
  );

  const applyAndSave = useCallback(
    async (patch: Partial<Record<FieldId, string>>, label?: string) => {
      const next = { ...values, ...patch };
      setValues(next);
      // Clamp index if instance row disappears
      const nextFields = visibleFields(next.launcher);
      setFieldIndex((i) => Math.min(i, nextFields.length - 1));
      await persist(next, label);
    },
    [values, persist],
  );

  useInput(
    (input, key) => {
      if (editing) {
        if (key.escape) {
          setEditing(false);
          setDraft("");
        }
        return;
      }

      if (key.escape) {
        void (async () => {
          if (dirty) await persist(values);
          props.onBack();
        })();
        return;
      }
      if (key.upArrow) {
        setFieldIndex((i) => (i <= 0 ? fields.length - 1 : i - 1));
      } else if (key.downArrow) {
        setFieldIndex((i) => (i >= fields.length - 1 ? 0 : i + 1));
      } else if (key.leftArrow || key.rightArrow) {
        if (field.kind === "enum" && field.options) {
          const dir = key.leftArrow ? -1 : 1;
          const next = cycleOption(field.options, values[field.id], dir);
          void applyAndSave({ [field.id]: next }, field.id);
        }
      } else if (key.return) {
        if (field.kind === "instance") {
          props.onPickInstance();
          return;
        }
        if (field.kind === "enum" && field.options) {
          const next = cycleOption(field.options, values[field.id], 1);
          void applyAndSave({ [field.id]: next }, field.id);
          return;
        }
        setDraft(values[field.id]);
        setEditing(true);
      } else if (input === "s" || input === "S") {
        void persist(values, "all");
      }
    },
    { isActive: true },
  );

  const commitEdit = () => {
    const next = { ...values, [field.id]: draft };
    setValues(next);
    setEditing(false);
    setDraft("");
    setDirty(true);
    void persist(next, field.id);
  };

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Configure plugdev.yml
      </Text>
      <Text color={theme.muted}>
        ↑↓ select · Enter edit · ←→ cycle · S save · Esc back
      </Text>
      <Text color={theme.border}>{"─".repeat(52)}</Text>

      <Box flexDirection="column" marginTop={1}>
        {fields.map((f, i) => {
          const selected = i === fieldIndex;
          const editingThis = selected && editing;
          const display =
            f.id === "instance"
              ? values.instance || "—"
              : values[f.id] || "—";
          return (
            <Box key={f.id} flexDirection="column" marginBottom={editingThis ? 1 : 0}>
              <Box>
                <Text color={selected ? theme.accent : theme.muted}>
                  {selected ? "› " : "  "}
                </Text>
                <Text color={selected ? theme.accent : undefined} bold={selected}>
                  {f.label.padEnd(18)}
                </Text>
                {!editingThis ? (
                  <Text color={display === "—" ? theme.muted : undefined}>
                    {display}
                    {f.kind === "enum" && selected ? (
                      <Text color={theme.muted}>  ←→</Text>
                    ) : null}
                    {f.kind === "instance" && selected ? (
                      <Text color={theme.muted}>  Enter</Text>
                    ) : null}
                  </Text>
                ) : null}
              </Box>
              {editingThis ? (
                <Box marginLeft={2}>
                  <Text color={theme.muted}>{f.hint ? `${f.hint} › ` : "› "}</Text>
                  <TextInput
                    value={draft}
                    onChange={setDraft}
                    onSubmit={commitEdit}
                  />
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        {saving ? (
          <Text color={theme.muted}>Saving…</Text>
        ) : status ? (
          <Text
            color={
              statusKind === "ok"
                ? theme.success
                : statusKind === "err"
                  ? theme.error
                  : theme.muted
            }
          >
            {status}
          </Text>
        ) : (
          <Text color={theme.muted}>Changes save automatically</Text>
        )}
      </Box>
    </Box>
  );
}
