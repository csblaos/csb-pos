import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const commands = [
  "db:backfill:postgres:purchase-read",
  "db:compare:postgres:purchase-read",
  "smoke:postgres:po-create-received",
  "smoke:postgres:po-status-received",
];

const runScript = (scriptName) =>
  new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", scriptName], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptName} exited with code ${code ?? "unknown"}`));
    });
  });

try {
  for (const command of commands) {
    console.info(`[pg:purchase-suite] running ${command}`);
    await runScript(command);
  }

  console.info("[pg:purchase-suite] all checks passed");
} catch (error) {
  console.error("[pg:purchase-suite] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
