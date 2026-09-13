import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

// Démarre la version compilée dans Codespaces et évite de lancer deux serveurs.
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 3000);
const localUrl = `http://127.0.0.1:${port}/api/public`;
async function isRunning() {
  try {
    const response = await fetch(localUrl, {
      signal: AbortSignal.timeout(1000),
    });
    const body = await response.json();
    return response.ok && Boolean(body.doctor && body.services);
  } catch {
    return false;
  }
}
if (!fs.existsSync(path.join(root, "dist", "index.html")))
  throw Error("Compilez d’abord le site avec npm run build.");
if (!(await isRunning())) {
  const data = path.join(root, "data");
  fs.mkdirSync(data, { recursive: true });
  const log = fs.openSync(path.join(data, "codespace-server.log"), "a", 0o600);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.unref();
  fs.closeSync(log);
  for (let attempt = 0; attempt < 60 && !(await isRunning()); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 500));
  if (!(await isRunning()))
    throw Error("Pulse n’a pas démarré. Consultez data/codespace-server.log.");
}
const { CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
const url =
  CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : `http://localhost:${port}`;
console.log(`Pulse est prêt : ${url}`);
console.log(
  "Ouvrez le port 3000 dans l’onglet Ports. Les identifiants initiaux sont dans data/codespace-server.log.",
);
