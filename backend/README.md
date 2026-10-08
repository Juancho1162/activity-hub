# Backend principal: JavaScript + Workers + D1

El backend principal reside en `backend/`, sirve el frontend oficial y es el destino del arranque principal. La [especificación](../docs/APP.md), el [estado y trabajo pendiente](../docs/STATUS.md) y el [historial de cambios](../CHANGELOG.md) tienen documentos separados; el [README raíz](../README.md) presenta la aplicación y explica su uso.

La implementación [Python/SQLite](../experiments/python-sqlite/README.md) se conserva como referencia ejecutable para equivalencia y medición, con datos separados. El frontend no se duplica.

## Entorno y comandos

Comprobado en macOS 26.3 arm64, Node 26.0.0, npm 11.12.1 y Wrangler 4.147.0 fijado. Firefox se usa desde `/Applications/Firefox.app`. El `compatibility_date` permanece en `2026-10-01`. No se acredita portabilidad a otros sistemas.

Desde la raíz:

```sh
npm run dev
npm run migrate
npm run check
npm run test:browser
npm run test:integration
npm run measure
```

`dev` compila `frontend/` y sirve web/API en `http://127.0.0.1:8787`. `migrate` es la aplicación explícita del esquema **local**; dev nunca la ejecuta por su cuenta. Los comandos de verificación crean bases temporales y no reutilizan el estado manual. `check` empaqueta con `deploy --dry-run`, sin publicar. `test:browser` ejecuta el recorrido visual completo; `test:integration`, el recorrido funcional acotado de este backend.

También existen `npm --prefix backend test` y `npm --prefix backend run check`. Las pruebas diferenciales y `measure` requieren la `.venv/` existente en la raíz; el servidor principal y los recorridos de navegador no ejecutan Python.

`wrangler.jsonc` sirve `../frontend/dist` como Static Assets. `/api`, `/auth`, `/health` y sus rutas reservadas pasan por el Worker antes del fallback SPA. El entorno `local` usa un ID D1 ficticio estable, `remote: false`, `workers_dev: false`, `preview_urls: false` y observabilidad deshabilitada. `production` tiene su propia cuenta, ID D1 y Origin HTTPS; solo ese entorno habilita `workers_dev`. `scripts/run.js` aísla HOME/config/cache de Wrangler, deshabilita dotenv/variables personales y telemetría. Las dependencias instaladas se trasladaron con esta carpeta, sin reinstalar.

## Estado local y datos

`backend/.state/local/` contiene la **misma carpeta de estado** trasladada desde el experimento; no se reconstruyeron ni importaron sus registros. Se conservan el identificador D1 y los nombres internos de Wrangler, incluido el sufijo histórico `experiment`, para mantener el mismo estado local. La SQLite anterior de Python permanece en `data/activity.sqlite3` de la raíz —o el destino configurado—, sin abrirse ni moverse. Las cuentas y códigos de Python no se incorporan automáticamente a D1.

Las carpetas `.state/`, `.wrangler/`, `.cache/`, `node_modules/`, `dist/` y `test-results/` se ignoran. Una reinstalación de dependencias no debe borrar `.state/`. No ejecutar simultáneamente ambas implementaciones sobre la misma base ni copiar una SQLite abierta para intentar sincronizarlas. La promoción de código no es una migración de datos.

## Implementación y garantías

El contrato de producto y sus límites están en [APP.md](../docs/APP.md#5-contratos-y-garantías); la publicación vigente está en [STATUS.md](../docs/STATUS.md). `src/worker.js` usa el protocolo cifrado; `tests/legacy-worker.js` mantiene únicamente la caracterización del protocolo anterior y la comparación con Python. No hay variable ni ruta HTTP que habilite ese handler en producción.

`src/security.js` aplica límites antes de D1, Turnstile y cierres operativos. `src/auth.js` limita cuentas/sesiones y verifica credenciales derivadas. `src/vault.js` guarda un sobre opaco por cuenta. `src/sql.js` revalida reloj, sesión, cuenta, día y versión dentro de `DB.batch()`; cualquier fallo revierte todo el batch. No hay mutex en memoria, caché privada ni lecturas mediante réplicas D1.

El frontend deriva claves en `privacy-crypto.ts`; `private-auth.ts` mantiene la clave en memoria y `private-vault.ts` descifra, aplica operaciones y guarda con comparación de versiones. La migración inicial exporta exclusivamente datos propios, los cifra y retira el original dentro de la transacción confirmada. La revisión del contenido antiguo y los triggers impiden perder escrituras en vuelo o volver a introducir texto legible después de migrar.

Las pruebas de seguridad usan cuentas sintéticas y D1 temporal. Cubren límite concurrente de 100 cuentas, tamaño, aislamiento, CAPTCHA fallido sin tocar D1, sesiones revocadas/caducadas, conflictos, migración con rollback y manipulación del cifrado. Firefox recorre el cliente y Worker reales; un oráculo de cifrado independiente comprueba el contenido sintético y la ausencia de filas de dominio legibles. El recorrido completo comprueba siete anchos, dos temas, contraste, foco, scroll y solicitudes pendientes. Los resultados y pendientes vigentes están solo en el README raíz.

`npm run measure` conserva la comparación histórica del protocolo **sin cifrar** contra Python: no mide el rendimiento del nuevo almacenamiento. La medición del 2026-10-05 usó 107 frentes, 109 checks y 20 muestras calientes por operación; su JSON está en `test-results/measurement.json`. Ni esas cifras ni las filas leídas/escritas del emulador acreditan CPU, cuota, coste o latencia alojados. `measure` necesita `.venv/`; los recorridos del producto actual no ejecutan Python.

## Flujo de cambio, pruebas y publicación

Destino explícito: Worker `activity-hub`, entorno `production`, cuenta `72734ad9e032887b9758d0c2216e3d48`, D1 `activity-hub-production` (`5ffb5d44-eb8f-4fac-8c2b-5714a1251460`), URL **https://activity-hub.software-juancho-prego-gundin.workers.dev**. D1 se creó con jurisdicción `eu`; esto no limita la ejecución mundial del Worker. Los identificadores y la sitekey son públicos; el secreto Turnstile vive en Workers Secrets.

Cada cambio sigue estos pasos desde la raíz con **Node 26**:

Repositorio: **[Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub)**, actualmente público. `origin` apunta a ese repositorio; `main` conserva el trabajo integrado y `feature/information-agent` mantiene la ampliación aplazada. `docs/APP.md` mantiene las reglas, `docs/STATUS.md` el estado actual y `CHANGELOG.md` los cambios completados y su evidencia. El README raíz permanece como presentación y guía de uso: no añadirle registros de cambios ni versiones de despliegue. Las PR describen cada cambio y su verificación.

Cloudflare Builds está conectado a GitHub: los pushes a `main`, incluidos cambios
solo de documentación, compilan y publican en producción. Integrar una PR en esa
rama implica publicar; comprobar la autorización y las pruebas antes del merge.

Configuración del trigger de producción:

- Directorio raíz: `backend`; variable de build `NODE_VERSION=26`.
- Build: `npm ci && npm --prefix ../frontend ci && npm --prefix ../frontend run build`.
- Deploy: `npx wrangler deploy --env production` (Wrangler fijado en el lockfile del backend).
- Rama: `main`; rutas incluidas: `*`; previews desactivadas.

1. Comprobar rama, remoto y cambios locales; actualizar `main` mediante fast-forward y trabajar en una rama acotada. Mantener las reglas en `docs/APP.md` y el estado en `docs/STATUS.md`.
2. Para cambios ejecutables, ejecutar `npm run verify` y revisar los resultados antes de integrar. Incluye tests backend/frontend, tipos/build y recorridos Firefox/Brave. Cloudflare solo instala dependencias, comprueba tipos, compila y despliega: no sustituye estas pruebas. Para documentación, revisar diff, enlaces y coherencia.
3. Revisar el cambio, con revisión independiente para seguridad, datos y reglas de negocio. Abrir una PR a `main` con la plantilla y evidencia real; comprobar su último commit y checks antes de integrar.
4. Si hay migraciones, planificar su orden y compatibilidad antes del merge. El build automático no aplica migraciones ni comprueba el esquema. No integrar cambios que dependan de un esquema todavía ausente; las migraciones remotas siguen siendo explícitas y requieren su revisión/autorización.
5. Integrar mediante merge commit sin saltarse protecciones. Cloudflare obtiene ese commit de GitHub y publica Worker y assets. Seguir el build hasta su resultado; un merge por sí solo no demuestra un despliegue correcto.
6. Ejecutar `npm run release:smoke` y el recorrido remoto proporcional al cambio. Registrar evidencia en el estado/historial. Si el build o smoke falla, inspeccionar la versión activa antes de repetir. El registro posterior de documentación también activa un build.

Los comandos manuales siguen disponibles cuando se necesita publicar un artefacto
local verificado. No ejecutarlos además del build automático para el mismo cambio:

```sh
npm run verify
npm run release:prepare
npm run release:migrate   # solo migraciones revisadas y autorizadas
npm run release:deploy    # publicación manual explícita desde main limpio
npm run release:smoke     # también sirve tras Cloudflare Builds; no crea cuentas
```

`release:prepare` congela Worker, assets, configuración y migraciones con hashes;
`release:deploy` revalida el artefacto y publica con `--no-bundle`. El build remoto
compila desde GitHub y no utiliza ese artefacto local ni actualiza
`.release/last-deployment.json`: consultar sus logs y las versiones de Cloudflare.

`.release/` contiene evidencia y artefactos locales ignorados por Git; no es una copia de D1. Si cambia código/configuración/tests, o se modifica el artefacto, hay que volver a prepararlo. Editar solo Markdown no cambia el artefacto ejecutable; el árbol debe quedar limpio igualmente. No añadir secretos a argumentos, repositorio, configuración versionada ni assets. Los builds locales aíslan configuración y credenciales de Wrangler; los comandos remotos usan la autenticación del operador y el archivo vacío `scripts/no-secrets.txt`.

Wrangler puede sobrescribir configuración del panel: reconciliar cambios operativos con `wrangler.jsonc`. No pasar `--name activity-hub` junto a `--env production`; en esta versión de Wrangler se puede interpretar como nombre base y añadir un sufijo. El nombre del destino ya está fijado dentro del entorno. Observabilidad y URL de versiones permanecen deshabilitadas por la decisión de privacidad del proyecto. Cloudflare Builds realiza el despliegue automático; no hay GitHub Actions ni recursos de staging.

Para subir una rama y preparar su PR, con la sesión existente de GitHub CLI:

```sh
git push --set-upstream origin HEAD
gh pr create --repo Juancho1162/activity-hub --base main --head "$(git branch --show-current)" --draft
```

Completar la descripción con la plantilla, revisar el diff y los resultados antes de marcarla lista. La revisión en esta misma sesión no se presenta como independiente. No usar push forzado, `--admin`, borrado de ramas ni despliegue automático para resolver un bloqueo. Las instrucciones del flujo no equivalen a protección de ramas: la consulta inicial a GitHub confirmó `main` sin protección y cero workflows de Actions. El código guardado en el repositorio no incluye las bases D1, `.env`, secretos, perfiles de navegador ni artefactos `.release/`.

### Límites e interruptores

En producción se requieren las cuatro bindings de rate limiting. Sus valores iniciales son 600 solicitudes dinámicas, 120/IP, 10/IP y ruta de alta/login, y 60/cuenta por minuto. Su alcance es por ubicación de Cloudflare y eventualmente consistente; no ofrecen un presupuesto global duro. D1 permite como máximo 100 cuentas y un documento de 512 KiB binarios por cuenta; el JSON/base64 y los metadatos ocupan más. Cada lectura autorizada también escribe contexto transaccional, por lo que el espacio acotado no implica operaciones diarias acotadas.

Para un incidente, cambiar la variable correspondiente a `"false"`: `REGISTRATION_ENABLED` cierra altas; `WRITES_ENABLED` cierra PUT del registro; `API_ENABLED` detiene las rutas dinámicas. Conservar los datos y no alterar las claves. Una publicación de emergencia debe mantener los bindings y pasar verificación; el smoke normal espera servicio y registro abiertos y **fallará de forma esperada** si se aplica un cierre. Comprobar entonces el rechazo previsto y documentar el estado, sin deshacer automáticamente el cierre. Los errores 429 indican esperar antes de reintentar; no invalidan el código de acceso.

### Migración y recuperación

`0001_gate.sql` se aplicó a la base remota inicialmente vacía, sin importar datos locales. `0002_private_storage.sql` añade el almacenamiento cifrado, verificadores y protección de migración. Aplicar el esquema no cifra por sí solo los datos existentes: el titular necesita entrar con su código desde el nuevo cliente. Un usuario anterior sin actividad también debe desbloquear su cuenta para actualizar el verificador.

`0003_signup_challenges.sql` añade una huella SHA-256 única del CAPTCHA utilizado por cada cuenta nueva. El token original no se guarda. La creación de cuenta y el consumo de la huella se resuelven en el mismo batch, incluso si el proveedor acepta otra vez el token. La columna admite NULL para conservar las cuentas anteriores y el desarrollo local; la migración es compatible con el Worker anterior. Estado de publicación en el README raíz.

**Después de convertir verificadores o contenido no se puede volver sin más al código `v0.1.0`:** no entiende las credenciales ni los documentos cifrados. Una corrección debe mantener el protocolo nuevo. Un rollback de Worker no revierte D1 y solo sirve si ambas versiones entienden el esquema y los datos actuales. Las pestañas antiguas deben recargar; las rutas de escritura en texto legible quedan retiradas.

Antes de cualquier migración con datos se registra la versión y un punto de recuperación. Time Travel actúa sobre D1 remota aunque su comando no lleve `--remote`. Restaurar D1 sobrescribe datos posteriores y requiere un procedimiento y autorización específicos: ensayar en un destino desechable, revisar integridad y revocar sesiones restauradas. No se considera recuperación probada por conservar un bookmark.

Las copias antiguas pueden contener datos sin cifrar. Las posteriores conservan cifrado, verificadores y metadatos, por lo que también deben protegerse. Git no copia los datos ni las claves de los usuarios. No hay recuperación del código, exportación externa programada ni ensayo de restauración acreditado; tampoco prueba de carga/coste real o Safari/iPhone físico.

## Fuentes técnicas

- [API D1 y batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [límites D1](https://developers.cloudflare.com/d1/platform/limits/) y [migraciones](https://developers.cloudflare.com/d1/reference/migrations/).
- [Rate limiting de Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Siteverify de Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) y [seguridad de D1](https://developers.cloudflare.com/d1/reference/data-security/).
- [Static Assets y routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
- [Desarrollo local D1](https://developers.cloudflare.com/d1/best-practices/local-development/).
- [Wrangler Workers](https://developers.cloudflare.com/workers/wrangler/commands/workers/) y [Wrangler D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/).
- [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) y [rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Revalidar comandos/cuotas con la versión fijada antes de nuevas operaciones. La verificación vigente y las tareas pendientes permanecen en [STATUS.md](../docs/STATUS.md); la evidencia histórica, en [CHANGELOG.md](../CHANGELOG.md).

### Capturas públicas de la app

La landing usa capturas reales con datos ficticios, generadas localmente con
`npm run build && node frontend/scripts/capture-landing.mjs` desde la raíz.
El script usa Brave y D1 temporales, crea cuatro frentes y dos checks mediante la
UI real y exporta ES/EN y claro/oscuro a `frontend/public/previews/`. No utiliza
cuentas de producción. Ejecutar después `npm run build` para incluir las capturas
nuevas; revisar las imágenes y `frontend/tests/public-pages.mjs` antes de publicar.
