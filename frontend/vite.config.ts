import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"

// Direct Vite is used by the secondary Python launcher, which supplies its API port.
// The main dev/preview commands serve React through the Worker instead.
// Only a local port is configurable. Never expose an arbitrary upstream or a token.
const port = Number(process.env.ACTIVITY_HUB_API_PORT ?? "8000")
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local API port")
const proxy = Object.fromEntries(["/api", "/auth", "/health"].map((route) => [route, {
  target: `http://127.0.0.1:${port}`,
}]))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { rolldownOptions: { input: {
    landing: fileURLToPath(new URL("./index.html", import.meta.url)),
    app: fileURLToPath(new URL("./app/index.html", import.meta.url)),
  } } },
  server: { host: "127.0.0.1", proxy },
  preview: { host: "127.0.0.1", proxy },
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"], clearMocks: true },
})
