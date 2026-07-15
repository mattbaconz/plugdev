import { readFile } from "node:fs/promises";

const text = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const sections = text.split(/(?=^## )/m).filter((section) => section.startsWith("## "));
const allowed = ["added", "changed", "fixed", "removed"];

if (sections.length === 0 || !sections[0].startsWith("## Unreleased")) {
  throw new Error("CHANGELOG.md must start with an Unreleased section");
}

for (const section of sections) {
  const title = section.match(/^## (.+)$/m)?.[1] ?? "unknown section";
  const categories = [...section.matchAll(/^### \[([^\]]+)\]$/gm)].map((match) => match[1]);

  if (title === "Unreleased" && categories.length === 0) {
    continue;
  }

  if (categories.length === 0) {
    throw new Error(`${title} has no release categories`);
  }

  for (const category of categories) {
    if (!allowed.includes(category)) {
      throw new Error(`${title} uses unsupported category [${category}]`);
    }
  }

  if (new Set(categories).size !== categories.length) {
    throw new Error(`${title} repeats a release category`);
  }

  const positions = categories.map((category) => allowed.indexOf(category));
  if (positions.some((position, index) => index > 0 && position < positions[index - 1])) {
    throw new Error(`${title} categories must follow: ${allowed.map((name) => `[${name}]`).join(", ")}`);
  }
}

console.log(`CHANGELOG.md: ${sections.length} sections use the canonical release format`);
