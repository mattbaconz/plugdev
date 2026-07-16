import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import type { LiveConfigFile } from "../../live-config/service.js";
import {
  listLiveConfigFiles,
  openExternalEditor,
  readWatchedConfigPaths,
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

  const reload = useCallback(async () => {
    const watched = await readWatchedConfigPaths(props.cwd);
    const listing = await listLiveConfigFiles(props.cwd, props.pluginName, watched);
    setFiles(listing.files);
    setDataDir(listing.dataDir);
    setIndex((current) => Math.min(current, Math.max(0, listing.files.length - 1)));
  }, [props.cwd, props.pluginName]);

  useEffect(() => {
    void reload().catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)));
  }, [reload]);

  useInput((input, key) => {
    if (busy) return;
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

    if (key.return) {
      setBusy(true);
      void openExternalEditor(selected.absolutePath)
        .then(() => setStatus(`Opened ${selected.path}`))
        .catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)))
        .finally(() => setBusy(false));
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
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>Live config files</Text>
      <Text color={theme.muted}>{configScreenMessage(dataDir, files.length)}</Text>
      {dataDir ? <Text color={theme.muted}>{dataDir}</Text> : null}
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
          {busy ? "Working…" : status ?? "↑↓ navigate · Enter open · Space watch/unwatch · Esc back"}
        </Text>
      </Box>
    </Box>
  );
}
