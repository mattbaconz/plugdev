import React from "react";
import { Box, Text } from "ink";
import { Header } from "../components/Header.js";
import { Menu, type MenuItem } from "../components/Menu.js";
import { theme } from "../theme.js";

export type HomeAction =
  | "run"
  | "configure"
  | "open"
  | "open-second"
  | "setup"
  | "doctor"
  | "quit";

export function HomeScreen(props: {
  projectName: string;
  server: string;
  version: string;
  port: number;
  launcher?: string;
  instance?: string;
  offlineName: string;
  secondPlayer: string;
  status?: string;
  onAction: (action: HomeAction) => void;
}): React.ReactElement {
  const items: MenuItem[] = [
    {
      id: "run",
      label: "Run test loop",
      hint: "server + watch + join",
    },
    {
      id: "configure",
      label: "Configure",
      hint: "version · server · client",
    },
    {
      id: "open",
      label: "Open client",
      hint: `as ${props.offlineName}`,
    },
    {
      id: "open-second",
      label: "Open second player",
      hint: `as ${props.secondPlayer}`,
    },
    {
      id: "setup",
      label: "Setup",
      hint: "prefetch server + client",
    },
    {
      id: "doctor",
      label: "Doctor",
      hint: "check toolchain",
    },
    { id: "quit", label: "Quit" },
  ];

  return (
    <Box flexDirection="column">
      <Header
        projectName={props.projectName}
        server={props.server}
        version={props.version}
        port={props.port}
        launcher={props.launcher}
        instance={props.instance}
      />
      <Menu
        items={items}
        onSelect={(id) => props.onAction(id as HomeAction)}
      />
      {props.status ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>{props.status}</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={theme.muted}>↑↓ navigate · Enter select · Esc quit</Text>
        </Box>
      )}
    </Box>
  );
}
