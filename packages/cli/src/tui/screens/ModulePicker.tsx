import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  detectModules,
  defaultJarPatternForModule,
  defaultWatchPathsForModule,
  type ModuleCandidate,
} from "../../detect/modules.js";
import { detectProject } from "../../detect/project.js";
import { writeModuleToYml } from "../../deps/config-write.js";
import type { PlugDevConfig } from "../../config/loader.js";
import { theme } from "../theme.js";

function kindLabel(m: ModuleCandidate): string {
  if (m.kind === "plugin") return m.foliaSupported ? "plugin+folia" : "plugin";
  return m.kind;
}

export function ModulePickerScreen(props: {
  cwd: string;
  raw: PlugDevConfig;
  onBack: () => void;
  onPicked: (message: string) => void;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [modules, setModules] = useState<ModuleCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const project = await detectProject(props.cwd);
        const list =
          project.modules?.length
            ? project.modules
            : await detectModules(
                props.cwd,
                project.buildSystem === "maven" || project.buildSystem === "gradle"
                  ? project.buildSystem
                  : "none",
              );
        setModules(list);
        const active = props.raw.build?.module;
        const idx = active ? list.findIndex((m) => m.id === active) : -1;
        setIndex(idx >= 0 ? idx : Math.max(0, list.findIndex((m) => m.kind === "plugin")));
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [props.cwd, props.raw.build?.module]);

  useInput(
    (_input, key) => {
      if (saving) return;
      if (key.escape) {
        props.onBack();
        return;
      }
      if (loading || modules.length === 0) return;
      if (key.upArrow) {
        setIndex((i) => (i <= 0 ? modules.length - 1 : i - 1));
      } else if (key.downArrow) {
        setIndex((i) => (i >= modules.length - 1 ? 0 : i + 1));
      } else if (key.return) {
        const selected = modules[index];
        if (!selected) return;
        void (async () => {
          setSaving(true);
          const result = await writeModuleToYml(props.cwd, {
            module: selected.id,
            system: selected.buildSystem,
            jarPattern: defaultJarPatternForModule(
              selected.id,
              selected.buildSystem,
              selected.finalName,
            ),
            watchPaths: defaultWatchPathsForModule(modules, selected.id),
          });
          setSaving(false);
          if (result.ok) {
            props.onPicked(`Module · ${selected.id}`);
          } else {
            setError(result.reason);
          }
        })();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Pick build module
      </Text>
      <Text color={theme.muted}>↑↓ select · Enter choose · Esc back</Text>
      <Text color={theme.border}>{"─".repeat(52)}</Text>

      {loading ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>Scanning modules…</Text>
        </Box>
      ) : null}

      {error ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>{error}</Text>
        </Box>
      ) : null}

      {!loading && !error && modules.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>No multi-module reactor detected.</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        {modules.map((m, i) => {
          const selected = i === index;
          const current = props.raw.build?.module === m.id;
          return (
            <Box key={m.id}>
              <Text color={selected ? theme.accent : theme.muted}>
                {selected ? "› " : "  "}
              </Text>
              <Text color={selected ? theme.accent : undefined} bold={selected}>
                {current ? "* " : "  "}
                {m.id.padEnd(26).slice(0, 26)}
              </Text>
              <Text color={theme.muted}>
                [{kindLabel(m)}]
                {m.pluginName ? ` ${m.pluginName}` : ""}
              </Text>
            </Box>
          );
        })}
      </Box>

      {saving ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>Saving…</Text>
        </Box>
      ) : null}
    </Box>
  );
}
