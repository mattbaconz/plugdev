import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { detectProject } from "../detect/project.js";
import { loadConfig, type PlugDevConfig, type ResolvedConfig } from "../config/loader.js";
import { readPlugdevYml } from "../deps/config-write.js";
import { runOpen } from "../commands/open.js";
import { runSetup } from "../commands/setup.js";
import { runDoctor } from "../commands/doctor.js";
import { theme } from "./theme.js";
import { HomeScreen, type HomeAction } from "./screens/Home.js";
import { ConfigureScreen } from "./screens/Configure.js";
import { InstancePickerScreen } from "./screens/InstancePicker.js";
import { ModulePickerScreen } from "./screens/ModulePicker.js";
import { DepsScreen } from "./screens/Deps.js";

type Screen = "home" | "configure" | "instances" | "modules" | "deps";

export function App(props: {
  cwd: string;
  onRunRequested: () => void;
}): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("home");
  const [modulesReturn, setModulesReturn] = useState<"home" | "configure">("home");
  const [status, setStatus] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState("project");
  const [config, setConfig] = useState<ResolvedConfig | null>(null);
  const [raw, setRaw] = useState<PlugDevConfig>({});
  const [showModule, setShowModule] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    try {
      const project = await detectProject(props.cwd);
      const resolved = await loadConfig(props.cwd, project);
      const yml = await readPlugdevYml(props.cwd);
      setConfig(resolved);
      setRaw(yml?.raw ?? {});
      setShowModule((project.modules?.length ?? 0) > 1);
      setProjectName(
        project.pluginName ??
          project.loader ??
          project.type ??
          "project",
      );
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [props.cwd]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInput(
    (_input, key) => {
      if (busy) return;
      if (screen === "home" && key.escape) {
        exit();
      }
    },
    { isActive: true },
  );

  const offlineName = config?.client?.offlineName ?? "DevPlayer";
  const secondPlayer =
    config?.client?.players?.[0]?.name?.trim() || "Tester2";
  const launcher = config?.client?.launcher ?? "auto";
  const instance = config?.client?.instance;

  const handleHome = async (action: HomeAction) => {
    if (busy) return;

    if (action === "quit") {
      exit();
      return;
    }
    if (action === "configure") {
      setScreen("configure");
      setStatus(undefined);
      return;
    }
    if (action === "module") {
      setModulesReturn("home");
      setScreen("modules");
      setStatus(undefined);
      return;
    }
    if (action === "deps") {
      setScreen("deps");
      setStatus(undefined);
      return;
    }
    if (action === "run") {
      props.onRunRequested();
      exit();
      return;
    }

    setBusy(true);
    setStatus("Working…");
    try {
      if (action === "open") {
        await runOpen(props.cwd, { client: true, name: offlineName });
        setStatus(`Launched client as ${offlineName}`);
      } else if (action === "open-second") {
        await runOpen(props.cwd, { client: true, name: secondPlayer });
        setStatus(`Launched client as ${secondPlayer}`);
      } else if (action === "setup") {
        const code = await runSetup(props.cwd);
        setStatus(code === 0 ? "Setup complete" : `Setup exited ${code}`);
        await reload();
      } else if (action === "doctor") {
        const code = await runDoctor(props.cwd);
        setStatus(code === 0 ? "Doctor: ready" : `Doctor exited ${code}`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={theme.error}>{error}</Text>
        <Text color={theme.muted}>Fix the project, then run plugdev again.</Text>
      </Box>
    );
  }

  if (!config) {
    return (
      <Box>
        <Text color={theme.muted}>Loading…</Text>
      </Box>
    );
  }

  if (screen === "instances") {
    return (
      <InstancePickerScreen
        cwd={props.cwd}
        raw={raw}
        serverVersion={config.version}
        onBack={() => {
          setScreen("configure");
          void reload();
        }}
        onPicked={(msg) => {
          setStatus(msg);
          setScreen("configure");
          void reload();
        }}
      />
    );
  }

  if (screen === "modules") {
    return (
      <ModulePickerScreen
        cwd={props.cwd}
        raw={raw}
        onBack={() => {
          setScreen(modulesReturn);
          void reload();
        }}
        onPicked={(msg) => {
          setStatus(msg);
          setScreen(modulesReturn);
          void reload();
        }}
      />
    );
  }

  if (screen === "deps") {
    return (
      <DepsScreen
        cwd={props.cwd}
        raw={raw}
        onBack={() => {
          setScreen("home");
          void reload();
        }}
        onChanged={(msg) => {
          setStatus(msg);
          void reload();
        }}
      />
    );
  }

  if (screen === "configure") {
    return (
      <ConfigureScreen
        cwd={props.cwd}
        raw={raw}
        showModule={showModule}
        onBack={() => {
          setScreen("home");
          void reload();
        }}
        onPickInstance={() => {
          setScreen("instances");
        }}
        onPickModule={() => {
          setModulesReturn("configure");
          setScreen("modules");
        }}
      />
    );
  }

  return (
    <HomeScreen
      projectName={projectName}
      server={config.server}
      version={config.version}
      port={config.port}
      launcher={launcher}
      instance={instance}
      offlineName={offlineName}
      secondPlayer={secondPlayer}
      showModule={showModule}
      status={busy ? "Working…" : status}
      onAction={(a) => {
        void handleHome(a);
      }}
    />
  );
}
