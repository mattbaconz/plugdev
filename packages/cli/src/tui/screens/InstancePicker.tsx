import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { detectLauncher } from "../../client/detect.js";
import {
  listLauncherInstances,
  type ListedInstance,
} from "../../client/instances-list.js";
import { writeClientInstanceToYml } from "../../deps/config-write.js";
import type { PlugDevConfig } from "../../config/loader.js";
import { theme } from "../theme.js";

export function InstancePickerScreen(props: {
  cwd: string;
  raw: PlugDevConfig;
  serverVersion: string;
  onBack: () => void;
  onPicked: (message: string) => void;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [launcherType, setLauncherType] = useState<"prism" | "multimc" | null>(
    null,
  );
  const [instances, setInstances] = useState<ListedInstance[]>([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const prefer =
    props.raw.client?.launcher === "multimc"
      ? "multimc"
      : props.raw.client?.launcher === "prism"
        ? "prism"
        : "auto";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const launcher = await detectLauncher(prefer, props.raw.client);
        if (!launcher) {
          setError("No Prism/MultiMC found — run plugdev client detect");
          setInstances([]);
          setLauncherType(null);
          return;
        }
        setLauncherType(launcher.type);
        const list = await listLauncherInstances(launcher);
        setInstances(list);
        const current = props.raw.client?.instance;
        const idx = current ? list.findIndex((i) => i.id === current) : -1;
        setIndex(idx >= 0 ? idx : 0);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [prefer, props.raw.client]);

  useInput(
    (_input, key) => {
      if (saving) return;
      if (key.escape) {
        props.onBack();
        return;
      }
      if (loading || instances.length === 0) return;
      if (key.upArrow) {
        setIndex((i) => (i <= 0 ? instances.length - 1 : i - 1));
      } else if (key.downArrow) {
        setIndex((i) => (i >= instances.length - 1 ? 0 : i + 1));
      } else if (key.return) {
        const selected = instances[index];
        if (!selected || !launcherType) return;
        void (async () => {
          setSaving(true);
          const ok = await writeClientInstanceToYml(props.cwd, {
            launcher: launcherType,
            instance: selected.id,
          });
          setSaving(false);
          if (ok) {
            props.onPicked(`Instance · ${selected.name}`);
          } else {
            setError("Failed to write plugdev.yml");
          }
        })();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Pick launcher instance
      </Text>
      <Text color={theme.muted}>
        {launcherType
          ? `${launcherType} · ↑↓ select · Enter choose · Esc back`
          : "↑↓ · Esc back"}
      </Text>
      <Text color={theme.border}>{"─".repeat(52)}</Text>

      {loading ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>Scanning instances…</Text>
        </Box>
      ) : null}

      {error ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>{error}</Text>
        </Box>
      ) : null}

      {!loading && !error && instances.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>No instances found in launcher data dir.</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        {instances.map((inst, i) => {
          const selected = i === index;
          const current = props.raw.client?.instance === inst.id;
          const mismatch =
            inst.mcVersion &&
            props.serverVersion &&
            inst.mcVersion !== props.serverVersion;
          return (
            <Box key={inst.id}>
              <Text color={selected ? theme.accent : theme.muted}>
                {selected ? "› " : "  "}
              </Text>
              <Text color={selected ? theme.accent : undefined} bold={selected}>
                {current ? "* " : "  "}
                {inst.name.padEnd(28).slice(0, 28)}
              </Text>
              <Text color={mismatch ? theme.warn : theme.muted}>
                {inst.mcVersion ?? "?"}
                {mismatch ? " ≠ server" : ""}
              </Text>
            </Box>
          );
        })}
      </Box>

      {instances.some(
        (i) => i.mcVersion && i.mcVersion !== props.serverVersion,
      ) ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>
            Version mismatch OK with Via* deps (default).
          </Text>
        </Box>
      ) : null}

      {saving ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>Saving…</Text>
        </Box>
      ) : null}
    </Box>
  );
}
