import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const stripWrappingQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const loadEnvFile = (filename) => {
  const filepath = path.join(process.cwd(), filename);
  if (!existsSync(filepath)) {
    return;
  }

  const content = readFileSync(filepath, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    process.env[key] = value;
  }
};

loadEnvFile(".env");
loadEnvFile(".env.local");
