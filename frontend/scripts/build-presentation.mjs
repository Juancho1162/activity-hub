// Each official frontend build includes a fresh offline deck. Only its public
// dist/ is copied: source material and presenter documents stay in the repo.
import { spawnSync } from "node:child_process"
import { cp } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const deck = fileURLToPath(new URL("../../presentations/product-demo/", import.meta.url))
const output = fileURLToPath(new URL("../dist/presentacion/", import.meta.url))
const result = spawnSync("npm", ["run", "build"], { cwd: deck, stdio: "inherit" })
if (result.error || result.status !== 0) {
  console.error("No se ha compilado la presentación. Instala su lock con npm --prefix presentations/product-demo ci.")
  process.exit(result.status || 1)
}
await cp(new URL("../../presentations/product-demo/dist/", import.meta.url), output, { recursive: true })
