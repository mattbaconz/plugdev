import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  appendDepToYml,
  readPlugdevYml,
  removeDepFromYml,
  updatePlugdevYml,
} from "../../deps/config-write.js";
import { DEP_PRESETS, findPreset } from "../../deps/presets.js";
import type { PlugDevConfig } from "../../config/loader.js";
import { theme } from "../theme.js";

type Mode = "list" | "presets" | "manual";

type DepRow = NonNullable<PlugDevConfig["deps"]>[number];

function depLabel(d: DepRow): string {
  const src = d.source ?? "hangar";
  const id =
    src === "modrinth"
      ? `modrinth:${d.slug ?? d.name}`
      : src === "url"
        ? `url:${d.name}`
        : d.author && d.slug
          ? `${d.author}/${d.slug}`
          : d.name;
  return id;
}

export function DepsScreen(props: {
  cwd: string;
  raw: PlugDevConfig;
  onBack: () => void;
  onChanged: (message: string) => void;
}): React.ReactElement {
  const [deps, setDeps] = useState<DepRow[]>(props.raw.deps ?? []);
  const [mode, setMode] = useState<Mode>("list");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [manualName, setManualName] = useState("");
  const [editingManual, setEditingManual] = useState(false);

  const configuredKeys = useMemo(() => {
    return new Set(
      deps.map((d) => d.name.toLowerCase().replace(/[\s_-]+/g, "")),
    );
  }, [deps]);

  const availablePresets = useMemo(
    () =>
      DEP_PRESETS.filter(
        (p) => !configuredKeys.has(p.aliases[0]!.toLowerCase().replace(/[\s_-]+/g, "")),
      ),
    [configuredKeys],
  );

  const reload = useCallback(async () => {
    const loaded = await readPlugdevYml(props.cwd);
    setDeps(loaded?.raw.deps ?? []);
  }, [props.cwd]);

  useEffect(() => {
    setDeps(props.raw.deps ?? []);
  }, [props.raw.deps]);

  const listLen =
    mode === "list"
      ? deps.length + 2 // + add preset, + add manual
      : mode === "presets"
        ? availablePresets.length
        : 1;

  useInput(
    (input, key) => {
      if (busy) return;
      if (editingManual) {
        if (key.escape) {
          setEditingManual(false);
          setManualName("");
        }
        return;
      }

      if (key.escape) {
        if (mode !== "list") {
          setMode("list");
          setIndex(0);
          return;
        }
        props.onBack();
        return;
      }

      if (key.upArrow) {
        setIndex((i) => (i <= 0 ? Math.max(listLen - 1, 0) : i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) => (i >= listLen - 1 ? 0 : i + 1));
        return;
      }

      if (mode === "list") {
        if (key.return) {
          if (index === deps.length) {
            setMode("presets");
            setIndex(0);
            return;
          }
          if (index === deps.length + 1) {
            setMode("manual");
            setEditingManual(true);
            setManualName("");
            return;
          }
          // toggle enabled
          const dep = deps[index];
          if (!dep) return;
          void (async () => {
            setBusy(true);
            const next = deps.map((d, i) =>
              i === index ? { ...d, enabled: d.enabled === false } : d,
            );
            const result = await updatePlugdevYml(props.cwd, { deps: next });
            setBusy(false);
            if (result.ok) {
              setDeps(next);
              setStatus(
                `${dep.name} · ${next[index]!.enabled === false ? "disabled" : "enabled"}`,
              );
              props.onChanged(`Deps · ${dep.name}`);
            } else {
              setStatus(result.reason);
            }
          })();
          return;
        }
        if (input === "d" || input === "D" || key.delete || key.backspace) {
          const dep = deps[index];
          if (!dep || index >= deps.length) return;
          void (async () => {
            setBusy(true);
            const ok = await removeDepFromYml(props.cwd, dep.name);
            setBusy(false);
            if (ok) {
              await reload();
              setIndex((i) => Math.max(0, i - 1));
              setStatus(`Removed ${dep.name}`);
              props.onChanged(`Removed · ${dep.name}`);
            } else {
              setStatus(`Could not remove ${dep.name}`);
            }
          })();
        }
        return;
      }

      if (mode === "presets" && key.return) {
        const preset = availablePresets[index];
        if (!preset) return;
        void (async () => {
          setBusy(true);
          const entry =
            preset.source === "modrinth" || (!preset.author && preset.modrinthSlug)
              ? {
                  name: preset.slug,
                  source: "modrinth" as const,
                  slug: preset.modrinthSlug ?? preset.slug,
                }
              : {
                  name: preset.slug,
                  source: "hangar" as const,
                  author: preset.author,
                  slug: preset.slug,
                };
          const wrote = await appendDepToYml(props.cwd, entry);
          setBusy(false);
          if (wrote) {
            await reload();
            setMode("list");
            setIndex(0);
            setStatus(`Added ${preset.slug}`);
            props.onChanged(`Added · ${preset.slug}`);
          } else {
            setStatus(`Already configured: ${preset.slug}`);
          }
        })();
      }
    },
    { isActive: true },
  );

  const commitManual = () => {
    const name = manualName.trim();
    if (!name) {
      setEditingManual(false);
      setMode("list");
      return;
    }
    void (async () => {
      setBusy(true);
      const preset = findPreset(name);
      const entry =
        preset?.source === "modrinth" || (!preset?.author && preset?.modrinthSlug)
          ? {
              name: preset?.slug ?? name,
              source: "modrinth" as const,
              slug: preset?.modrinthSlug ?? name,
            }
          : preset?.author
            ? {
                name: preset.slug,
                source: "hangar" as const,
                author: preset.author,
                slug: preset.slug,
              }
            : { name, source: "hangar" as const };
      const wrote = await appendDepToYml(props.cwd, entry);
      setBusy(false);
      setEditingManual(false);
      setManualName("");
      setMode("list");
      if (wrote) {
        await reload();
        setStatus(`Added ${name}`);
        props.onChanged(`Added · ${name}`);
      } else {
        setStatus(`Already configured: ${name}`);
      }
    })();
  };

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Dependencies
      </Text>
      <Text color={theme.muted}>
        {mode === "list"
          ? "↑↓ · Enter toggle · D remove · Esc back"
          : mode === "presets"
            ? "↑↓ · Enter add · Esc cancel"
            : "Type name · Enter add · Esc cancel"}
      </Text>
      <Text color={theme.border}>{"─".repeat(52)}</Text>

      {mode === "list" ? (
        <Box flexDirection="column" marginTop={1}>
          {deps.length === 0 ? (
            <Text color={theme.muted}>  (no deps in plugdev.yml)</Text>
          ) : (
            deps.map((d, i) => {
              const selected = i === index;
              const on = d.enabled !== false;
              return (
                <Box key={`${d.name}-${i}`}>
                  <Text color={selected ? theme.accent : theme.muted}>
                    {selected ? "› " : "  "}
                  </Text>
                  <Text color={on ? undefined : theme.muted} bold={selected}>
                    [{on ? "on" : "off"}] {depLabel(d).padEnd(36).slice(0, 36)}
                  </Text>
                </Box>
              );
            })
          )}
          <Box marginTop={deps.length ? 1 : 0}>
            <Text color={index === deps.length ? theme.accent : theme.muted}>
              {index === deps.length ? "› " : "  "}
            </Text>
            <Text bold={index === deps.length}>+ Add from preset</Text>
          </Box>
          <Box>
            <Text color={index === deps.length + 1 ? theme.accent : theme.muted}>
              {index === deps.length + 1 ? "› " : "  "}
            </Text>
            <Text bold={index === deps.length + 1}>+ Add manually</Text>
          </Box>
        </Box>
      ) : null}

      {mode === "presets" ? (
        <Box flexDirection="column" marginTop={1}>
          {availablePresets.length === 0 ? (
            <Text color={theme.muted}>  All presets already configured</Text>
          ) : (
            availablePresets.map((p, i) => {
              const selected = i === index;
              const src =
                p.source === "modrinth" || (!p.author && p.modrinthSlug)
                  ? `modrinth:${p.modrinthSlug}`
                  : `${p.author}/${p.slug}`;
              return (
                <Box key={p.slug}>
                  <Text color={selected ? theme.accent : theme.muted}>
                    {selected ? "› " : "  "}
                  </Text>
                  <Text bold={selected}>{p.aliases[0]!.padEnd(14)}</Text>
                  <Text color={theme.muted}>{src}</Text>
                </Box>
              );
            })
          )}
        </Box>
      ) : null}

      {mode === "manual" ? (
        <Box marginTop={1} marginLeft={2}>
          <Text color={theme.muted}>name › </Text>
          <TextInput
            value={manualName}
            onChange={setManualName}
            onSubmit={commitManual}
            focus={editingManual}
          />
        </Box>
      ) : null}

      <Box marginTop={1}>
        {busy ? (
          <Text color={theme.muted}>Working…</Text>
        ) : status ? (
          <Text color={theme.success}>{status}</Text>
        ) : (
          <Text color={theme.muted}>Changes write to plugdev.yml</Text>
        )}
      </Box>
    </Box>
  );
}
