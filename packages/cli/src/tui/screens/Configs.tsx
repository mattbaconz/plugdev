import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { ConfigEditor, LiveConfigFile } from "../../live-config/service.js";
import {
  CONFIG_EDITOR_PICKER_OPTIONS,
  listLiveConfigFiles,
  openExternalEditor,
  readConfigEditor,
  readWatchedConfigPaths,
  setConfigEditor,
  setLiveConfigWatched,
} from "../../live-config/service.js";

export function configScreenMessage(dataDir: string | undefined, count: number): string {
  if (!dataDir) return "No live config folder yet — run the project once so the plugin can generate it.";
  if (count === 0) return "No editable live config files found.";
  return "Live dev-server copies — src/main/resources is unchanged.";
}

export function configScreenRows(files: LiveConfigFile[]) {
  return files.map((file) => ({
    path: file.path,
    marker: file.watched ? "●" : "○",
    watched: file.watched,
  }));
}

export function ConfigsScreen(props: {
  cwd: string;
  pluginName: string;
  onBack: () => void;
  onChanged: (message: string) => void;
}): React.ReactElement {
  const [files, setFiles] = useState<LiveConfigFile[]>([]);
  const [dataDir, setDataDir] = useState<string | undefined>();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [preferredEditor, setPreferredEditor] = useState<ConfigEditor>("auto");
  const [pickingEditor, setPickingEditor] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);

  const reload = useCallback(async () => {
    const watched = await readWatchedConfigPaths(props.cwd);
    const listing = await listLiveConfigFiles(props.cwd, props.pluginName, watched);
    setFiles(listing.files);
    setDataDir(listing.dataDir);
    setPreferredEditor(await readConfigEditor(props.cwd));
    setIndex((current) => Math.min(current, Math.max(0, listing.files.length - 1)));
  }, [props.cwd, props.pluginName]);

  useEffect(() => {
    void reload().catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)));
  }, [reload]);

  const openSelected = useCallback(async (preference: ConfigEditor) => {
    const selected = files[index];
    if (!selected) return;
    setBusy(true);
    try {
      const opened = await openExternalEditor(selected.absolutePath, preference);
      setStatus(`Opened ${selected.path} (${opened.label})`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [files, index]);

  useInput((input, key) => {
    if (busy) return;

    if (pickingEditor) {
      if (key.escape) {
        setPickingEditor(false);
        return;
      }
      if (key.upArrow) {
        setPickerIndex((current) =>
          current <= 0 ? CONFIG_EDITOR_PICKER_OPTIONS.length - 1 : current - 1,
        );
        return;
      }
      if (key.downArrow) {
        setPickerIndex((current) =>
          current >= CONFIG_EDITOR_PICKER_OPTIONS.length - 1 ? 0 : current + 1,
        );
        return;
      }
      if (key.return) {
        const choice = CONFIG_EDITOR_PICKER_OPTIONS[pickerIndex];
        if (!choice) return;
        setBusy(true);
        void setConfigEditor(props.cwd, choice.id)
          .then(async (next) => {
            setPreferredEditor(next);
            setPickingEditor(false);
            const message = `Editor set to ${choice.label}`;
            setStatus(message);
            props.onChanged(message);
            await openSelected(next);
          })
          .catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)))
          .finally(() => setBusy(false));
      }
      return;
    }

    if (key.escape) {
      props.onBack();
      return;
    }
    if (key.upArrow && files.length) {
      setIndex((current) => current <= 0 ? files.length - 1 : current - 1);
      return;
    }
    if (key.downArrow && files.length) {
      setIndex((current) => current >= files.length - 1 ? 0 : current + 1);
      return;
    }
    const selected = files[index];
    if (!selected) return;

    if (input === "e" || input === "E") {
      const currentIdx = CONFIG_EDITOR_PICKER_OPTIONS.findIndex((opt) => opt.id === preferredEditor);
      setPickerIndex(currentIdx >= 0 ? currentIdx : 0);
      setPickingEditor(true);
      return;
    }

    if (key.return) {
      void openSelected(preferredEditor);
      return;
    }
    if (input === " ") {
      setBusy(true);
      void setLiveConfigWatched(props.cwd, selected.path, !selected.watched)
        .then(async () => {
          const message = `${selected.watched ? "Stopped watching" : "Watching"} ${selected.path}`;
          setStatus(message);
          props.onChanged(message);
          await reload();
        })
        .catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)))
        .finally(() => setBusy(false));
    }
  });

  const rows = configScreenRows(files);

  if (pickingEditor) {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>Open with…</Text>
        <Text color={theme.muted}>Saved as your preferred config editor</Text>
        <Box flexDirection="column" marginTop={1}>
          {CONFIG_EDITOR_PICKER_OPTIONS.map((opt, rowIndex) => {
            const selected = rowIndex === pickerIndex;
            return (
              <Box key={opt.id}>
                <Text color={selected ? theme.accent : theme.muted}>{selected ? "› " : "  "}</Text>
                <Text bold={selected} color={selected ? theme.accent : undefined}>{opt.label}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.muted}>
            {busy ? "Working…" : "↑↓ navigate · Enter open & save · Esc cancel"}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>Live config files</Text>
      <Text color={theme.muted}>{configScreenMessage(dataDir, files.length)}</Text>
      {dataDir ? <Text color={theme.muted}>{dataDir}</Text> : null}
      <Text color={theme.muted}>Editor: {preferredEditor}</Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, rowIndex) => {
          const selected = rowIndex === index;
          return (
            <Box key={row.path}>
              <Text color={selected ? theme.accent : theme.muted}>{selected ? "› " : "  "}</Text>
              <Text color={row.watched ? theme.success : theme.muted}>{row.marker} </Text>
              <Text bold={selected} color={selected ? theme.accent : undefined}>{row.path}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {busy
            ? "Working…"
            : status ?? "↑↓ navigate · Enter open · e editor · Space watch/unwatch · Esc back"}
        </Text>
      </Box>
    </Box>
  );
}
