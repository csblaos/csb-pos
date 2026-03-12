import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const commands = [
  "db:check:postgres",
  "db:migrate:postgres",
  "lint",
  "build",
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
    console.info(`[pg:branches-gate] running ${command}`);
    await runScript(command);
  }

  console.info("[pg:branches-gate] all checks passed");
} catch (error) {
  console.error("[pg:branches-gate] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
