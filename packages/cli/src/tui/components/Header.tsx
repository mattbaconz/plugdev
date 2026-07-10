import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { CLI_VERSION } from "../../constants.js";

export function Header(props: {
  projectName: string;
  server: string;
  version: string;
  port: number;
  launcher?: string;
  instance?: string;
}): React.ReactElement {
  const clientBits: string[] = [];
  if (props.launcher && props.launcher !== "auto" && props.launcher !== "embedded") {
    clientBits.push(props.launcher);
    if (props.instance) clientBits.push(props.instance);
  } else if (props.instance) {
    clientBits.push(props.instance);
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text bold color={theme.accent}>
          PlugDev {CLI_VERSION}
        </Text>
        <Text color={theme.muted}>
          {" · "}
          {props.projectName}
          {" · "}
          {props.server} {props.version}
          {" · :"}
          {props.port}
          {clientBits.length > 0 ? ` · ${clientBits.join(" ")}` : ""}
        </Text>
      </Text>
      <Text color={theme.border}>{"─".repeat(52)}</Text>
    </Box>
  );
}
