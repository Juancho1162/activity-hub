import { fileURLToPath } from "node:url"
import { build } from "../../frontend/node_modules/vite/dist/node/index.js"

const absolute = relative => fileURLToPath(new URL(relative, import.meta.url))
export const output = absolute("./dist/")
export async function buildGarden(outDir = output) {
  // Replace both entries only in this isolated build. The normal build and
  // original landing component remain available without modification.
  await build({
    root: absolute("../../frontend/"),
    configFile: absolute("../../frontend/vite.config.ts"),
    resolve: {
      alias: [
        { find: /^react$/, replacement: absolute("../../frontend/node_modules/react/index.js") },
        { find: /^react\//, replacement: absolute("../../frontend/node_modules/react/") },
        { find: /^react-dom\//, replacement: absolute("../../frontend/node_modules/react-dom/") },
      ],
      dedupe: ["react", "react-dom"],
    },
    plugins: [{
      name: "local-garden-entry",
      enforce: "pre",
      transform(_code, id) {
        if (id === absolute("../../frontend/src/private-main.tsx")) {
          return { code: "import " + JSON.stringify(absolute("./src/main.jsx")), map: null }
        }
        if (id === absolute("../../frontend/src/main.tsx")) {
          return { code: "import " + JSON.stringify(absolute("./src/landing-main.jsx")), map: null }
        }
      },
    }],
    build: { outDir, emptyOutDir: true },
  })
}
