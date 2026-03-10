import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "smoke:postgres:cutover-gate"]],
  ["npm", ["run", "db:compare:postgres:reports-read"]],
];

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });

    child.on("error", reject);
  });

for (const [command, args] of commands) {
  // Keep the gate explicit so rollout can stop at the first failing precondition.
  await run(command, args);
}

console.log("[reports.read.gate] ok");
