import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
}

export function Menu(props: {
  items: MenuItem[];
  onSelect: (id: string) => void;
}): React.ReactElement {
  const [index, setIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setIndex((i) => (i <= 0 ? props.items.length - 1 : i - 1));
    } else if (key.downArrow) {
      setIndex((i) => (i >= props.items.length - 1 ? 0 : i + 1));
    } else if (key.return) {
      const item = props.items[index];
      if (item) props.onSelect(item.id);
    }
  });

  return (
    <Box flexDirection="column">
      {props.items.map((item, i) => {
        const selected = i === index;
        return (
          <Box key={item.id}>
            <Text color={selected ? theme.accent : theme.muted}>
              {selected ? "› " : "  "}
            </Text>
            <Text color={selected ? theme.accent : undefined} bold={selected}>
              {item.label.padEnd(22)}
            </Text>
            {item.hint ? (
              <Text color={theme.muted}>{item.hint}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
