import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const commands = [
  "smoke:postgres:auth-rbac-read-gate",
  "smoke:postgres:settings-system-admin-read-gate",
  "smoke:postgres:settings-system-admin-write-gate",
  "smoke:postgres:branches-gate",
  "smoke:postgres:store-settings-gate",
  "smoke:postgres:notifications-gate",
  "smoke:postgres:products-units-onboarding-read-gate",
  "smoke:postgres:products-units-onboarding-write-gate",
  "smoke:postgres:products-write-gate",
  "smoke:postgres:reports-read-gate",
  "smoke:postgres:stock-movement-gate",
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
    console.info(`[pg:all-postgres-observe-gate] running ${command}`);
    await runScript(command);
  }

  console.info("[pg:all-postgres-observe-gate] all checks passed");
} catch (error) {
  console.error("[pg:all-postgres-observe-gate] failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
