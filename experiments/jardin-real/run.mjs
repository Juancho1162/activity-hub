import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { buildGarden, output } from "./build.mjs"

if (Number(process.versions.node.split(".")[0]) !== 26) throw new Error("Activity Hub requires Node 26.")
const mode = process.argv[2] ?? "dev"
if (!["dev", "build", "check"].includes(mode)) throw new Error("Use dev, build or check.")
const absolute = relative => fileURLToPath(new URL(relative, import.meta.url))
const backend = absolute("../../backend/")
const cache = absolute("./.cache/")
const state = absolute("./.state/local/")
const origin = "http://localhost:8791"
await mkdir(cache, { recursive: true })
await buildGarden()
if (mode === "build") process.exit(0)

// An explicit local-only config; no production environment or credential inputs.
const base = JSON.parse(await readFile(backend + "wrangler.jsonc", "utf8"))
const config = {
  name: "activity-hub-garden-local",
  main: backend + "src/worker.js",
  compatibility_date: base.compatibility_date,
  workers_dev: false, preview_urls: false,
  observability: { enabled: false },
  assets: { ...base.assets, directory: output },
  vars: { WEB_ORIGIN: origin },
  d1_databases: [{
    binding: "DB", database_name: "activity-hub-garden-local-only",
    database_id: "00000000-0000-0000-0000-000000000002",
    migrations_dir: backend + "migrations", remote: false,
  }],
}
const configPath = cache + "wrangler.json"
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
const isolatedConfig = cache + "wrangler-home"
await mkdir(isolatedConfig, { recursive: true })
const env = {
  PATH: process.env.PATH, HOME: isolatedConfig,
  XDG_CONFIG_HOME: isolatedConfig + "/config", XDG_CACHE_HOME: isolatedConfig + "/cache",
  WRANGLER_SEND_METRICS: "false", WRANGLER_LOG: "error",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false", CI: "true",
}
let child
const run = (file, args) => new Promise((resolve, reject) => {
  child = spawn(process.execPath, [file, ...args], { cwd: cache, env, stdio: "inherit" })
  child.once("error", reject)
  child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(signal ? "Local process stopped." : "Local process failed: " + code)))
})
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { child?.kill(signal) })
const wrangler = args => run(backend + "node_modules/wrangler/bin/wrangler.js",
  [...args, "--config", configPath, "--env-file", backend + "scripts/no-secrets.txt"])
if (mode === "check") {
  await run(absolute("./browser-check.mjs"), [])
} else {
  await wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", state])
  console.log("\nJardín: " + origin + "/app/?appearance=garden\nAnterior: " + origin + "/app/?appearance=classic\nBase local persistente en experiments/jardin-real/.state/local. Ctrl+C detiene este servidor.")
  await wrangler(["dev", "--local", "--ip", "127.0.0.1", "--port", "8791", "--inspector-port", "0", "--persist-to", state])
}
