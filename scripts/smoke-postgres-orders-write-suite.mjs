import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const commands = [
  "db:check:postgres",
  "db:migrate:postgres",
  "smoke:postgres:create-order",
  "smoke:postgres:update-shipping",
  "smoke:postgres:submit-payment-slip",
  "smoke:postgres:submit-for-payment",
  "smoke:postgres:confirm-paid",
  "smoke:postgres:mark-picked-up-unpaid",
  "smoke:postgres:cancel",
  "smoke:postgres:mark-cod-returned",
  "smoke:postgres:mark-packed",
  "smoke:postgres:mark-shipped",
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
    console.info(`[pg:orders-write-suite] running ${command}`);
    await runScript(command);
  }

  console.info("[pg:orders-write-suite] all smoke scripts passed");
} catch (error) {
  console.error("[pg:orders-write-suite] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
