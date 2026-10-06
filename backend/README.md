# Backend principal: JavaScript + Workers + D1

**Promovido el 2026-10-05 por petición del usuario.** Este código procede del experimento `experiments/javascript-workers-d1/`, que ya pasó su revisión funcional local. Ahora reside en `backend/`, sirve el frontend oficial y es el destino del arranque principal. La [especificación y el único estado/listado de trabajo](../README.md) permanecen en la raíz. El traslado está verificado y revisado en la sesión principal; el perfil de revisor independiente no estuvo disponible.

Python pasa a [experiments/python-sqlite/](../experiments/python-sqlite/README.md), conservado como referencia ejecutable para equivalencia y medición. El frontend no se duplica. En aquella promoción no se añadieron dependencias, recursos remotos, despliegues ni transferencia de datos personales. La publicación posterior, autorizada el 2026-10-06, se describe abajo.

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

`src/worker.js` atiende Fetch y delega en contratos, autenticación y operaciones. `src/sql.js` crea un contexto por operación dentro de un único `DB.batch()`: captura reloj SQL y revalida sesión/cuenta antes de leer o escribir dominio/replay; elimina el contexto en el mismo batch. Un fallo revierte toda la operación. No hay mutex en memoria ni lecturas mediante réplicas D1.

Los replays devuelven la respuesta original, incluso después de editar/desmarcar, sin reejecutar el efecto. La fecha relativa se resuelve una vez en Madrid al serializar el batch; las pruebas cubren medianoche, ambos DST y reapertura. Los hooks de reloj/DB/métricas solo existen en los fixtures; la API desplegable no admite permisos o relojes de prueba.

Listado, historial y dashboard usan CTEs y parámetros acotados; el orden global de actividad se calcula antes de paginar. `instr(lower(...))` mantiene la búsqueda literal larga sin construir patrones LIKE que excedan el límite D1. Los rangos son inclusivos, las fechas marcadas pertenecen al rango y la última actividad global es independiente del filtro temporal.

## Evidencia actual

- `npm run check`: **23 backend y 152 frontend pasan**, sintaxis JS, tipos/build React y bundle dry-run desde las nuevas rutas.
- Referencia secundaria: **102 pruebas Python pasan** después del traslado, incluido el lanzador que sigue utilizando el frontend compartido.
- `npm run measure`: comparación HTTP real contra Python secundario, snapshots iniciales/replays idénticos y 8 dashboards simultáneos correctos en cada implementación.
- `npm run test:browser` y `npm run test:integration`: ambos pasan desde la raíz contra Worker/D1. El recorrido completo cubre siete anchos y 69 pares de contraste; ambos prueban cuentas/pestañas, respuesta perdida tras commit, reintento y logout retrasado.
- CLI principal probado en una copia desechable: migración explícita, arranque, React/API, alta/creación y conservación de sesión/frente tras reinicio. El puerto ocupado causa error sin fallback ni interrupción del otro proceso; solo se usó D1 temporal.
- Revisión del traslado en la sesión principal, sin hallazgos pendientes: rutas, manifiestos/locks, persistencia, fixtures y documentación. Los seis módulos del runtime JavaScript conservan sus hashes. El revisor configurado no estuvo disponible, por lo que esta promoción no tiene una revisión independiente nueva; el **PASS** independiente corresponde al experimento anterior.

Una espera fallida previa de UI coincidió con cambios/builds concurrentes y no se reprodujo en los pases posteriores. Cada fixture conserva ahora una copia propia de los assets para que las pestañas compartan el mismo build.

La suite cubre acceso, aislamiento, normalización/payload canónico, atomicidad, carreras de revocación/caducidad, conflictos/replays concurrentes, persistencia física y límites de intentos. Incluye importación de replays ficticios de Python, búsqueda literal larga, páginas de 100 y orden global antes de paginar. Los casos controlados de reloj/carrera importan el mismo handler en Node con binding D1 real; las pruebas HTTP y Firefox ejecutan workerd.

### Medición tras el traslado

Fecha UTC: `2026-10-05T15:40:01.383Z`. Misma fixture: 107 frentes —105 de A, 1 de B, 1 legacy— y 109 checks. Una muestra inicial tras preparación/autenticación y 20 calientes por operación. Python seguido de workerd, con wrapper de métricas solo en la fixture; primera muestra no equivale a arranque frío.

| Acción | Python p50/p95 ms | workerd p50/p95 ms | Sentencias D1 | Filas leídas/escritas D1 |
| --- | ---: | ---: | ---: | ---: |
| Listado 100 | 11.505 / 17.711 | 9.058 / 13.055 | 8 | 670 / 4 |
| Historial | 9.164 / 19.518 | 7.902 / 9.719 | 8 | 1107 / 4 |
| Dashboard 100 | 14.304 / 48.037 | 7.551 / 9.012 | 8 | 1372 / 4 |
| Búsqueda larga | 6.178 / 9.743 | 7.131 / 9.205 | 8 | 263 / 4 |
| Crear | 9.144 / 11.637 | 6.325 / 13.138 | 12 | 49 / 9 |
| Replay creación | 7.851 / 10.57 | 7.219 / 9.604 | 12 | 51 / 4 |
| Marcar check | 10.73 / 12.312 | 7.249 / 10.974 | 15 | 51 / 9 |

La medición coincidió con otras comprobaciones locales; los tiempos no establecen una ventaja de rendimiento. El JSON completo queda en `test-results/measurement.json`. Las filas/sentencias son metadatos del emulador, no consumo facturado: incluso GET escribe cuatro filas de contexto transaccional. CPU, cuotas, latencia y precio alojados no se han medido.

## Límites de equivalencia y alojamiento

Se mantiene la API que utiliza React y el comportamiento verificado. Las rutas auxiliares FastAPI `/docs`, `/redoc` y `/openapi.json` devuelven JSON 404. Fetch combina cabeceras Content-Type repetidas, mientras Python puede ver la primera cabecera raw: no se afirma equivalencia universal para esa entrada ni para toda URI malformada.

Las pruebas locales no acreditan cuotas/CPU reales, réplicas ni recuperación. La publicación HTTPS se verifica por separado y su resultado vigente figura en el README raíz. Safari/iPhone físico siguen sin probar.

### Producción en Cloudflare

Publicación autorizada por el usuario el **2026-10-06**, empezando con una base remota nueva y vacía. Web y API comparten **https://activity-hub.software-juancho-prego-gundin.workers.dev**. El destino es `env.production`, Worker `activity-hub`, D1 `activity-hub-production` (`5ffb5d44-eb8f-4fac-8c2b-5714a1251460`), creada con jurisdicción `eu`. Esta jurisdicción afecta a D1, no a la ejecución mundial del Worker.

Se aplicó `0001_gate.sql` sobre la nueva D1; no se importaron datos locales. Los IDs de cuenta/base y la URL son configuración pública, no credenciales. Wrangler gestiona su OAuth fuera del repositorio. La app no necesita un token de Cloudflare como variable de ejecución: accede a D1 mediante el binding `DB`.

Las publicaciones son manuales desde la versión estable de `main`, con el árbol limpio y las comprobaciones pasadas. La rama `feature/information-agent` sirve para desarrollar la ampliación; cambiar de rama no publica nada ni sincroniza bases. No se han configurado despliegues automáticos ni un remoto Git.

Desde la raíz, con **Node 26**:

```sh
npm run check
npm run test:integration
```

Después, desde `backend/`, usando el Wrangler fijado del proyecto:

```sh
# Validar el paquete/configuración de producción sin publicar.
WRANGLER_SEND_METRICS=false ./node_modules/.bin/wrangler deploy --dry-run --env production --env-file scripts/no-secrets.txt

# Revisar las migraciones pendientes de la D1 remota.
WRANGLER_SEND_METRICS=false ./node_modules/.bin/wrangler d1 migrations list DB --env production --remote --env-file scripts/no-secrets.txt

# Solo cuando haya migraciones revisadas y compatibles con el código aún activo.
WRANGLER_SEND_METRICS=false ./node_modules/.bin/wrangler d1 migrations apply DB --env production --remote --env-file scripts/no-secrets.txt

# Publicar Worker y build oficial de React.
WRANGLER_SEND_METRICS=false ./node_modules/.bin/wrangler deploy --env production --env-file scripts/no-secrets.txt
```

Los scripts `dev`, `migrate` y los tests siguen aislados en `local`; no sirven para autenticarse o publicar. Para los comandos remotos se utiliza directamente Wrangler y el archivo vacío de variables `scripts/no-secrets.txt`. No añadir credenciales a argumentos, configuración versionada, logs o assets. El despliegue incluye solo el build `frontend/dist`, no el repositorio ni los experimentos. La observabilidad y las URL de versiones permanecen deshabilitadas.

Después de cada publicación comprobar `/health`, pantalla de acceso, protección de `/api/fronts`, Origin/cookie/CSRF y un recorrido de uso proporcional al cambio. La comprobación inicial usa cuentas ficticias que se retiran antes de la entrega; repetir ese procedimiento en una base ya utilizada requiere identificar estrictamente los datos de prueba. Registrar el ID de versión y el resultado en el estado del README raíz.

### Actualizaciones y recuperación

Antes de cambiar un esquema con datos, registrar la versión del Worker y un punto de recuperación de D1. Consultas operativas de lectura:

```sh
./node_modules/.bin/wrangler versions list --env production --env-file scripts/no-secrets.txt
./node_modules/.bin/wrangler d1 time-travel info DB --env production --env-file scripts/no-secrets.txt
```

`time-travel` actúa sobre la base remota aunque no lleve `--remote`. Si corresponde una exportación SQL, guardarla fuera del repositorio y protegerla: puede contener verificadores y sesiones. Git conserva código y documentación; no copia la D1 remota ni sus registros.

El rollback de código (`wrangler rollback VERSION_ID --env production`) no restaura datos y exige que el código y los bindings sigan siendo compatibles. Restaurar D1 sobrescribe datos y requiere un procedimiento específico; no es un paso rutinario de publicación. Las migraciones incompatibles necesitan un plan de corte/retorno antes de ejecutarse. No hay copia externa programada ni ensayo de recuperación acreditado. Probar restauraciones primero sobre un destino desechable, revisar claves foráneas y revocar sesiones restauradas.

## Fuentes técnicas

- [API D1 y batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [límites D1](https://developers.cloudflare.com/d1/platform/limits/) y [migraciones](https://developers.cloudflare.com/d1/reference/migrations/).
- [Static Assets y routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
- [Desarrollo local D1](https://developers.cloudflare.com/d1/best-practices/local-development/).
- [Wrangler Workers](https://developers.cloudflare.com/workers/wrangler/commands/workers/) y [Wrangler D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/).
- [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) y [rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Revalidar comandos/cuotas con la versión fijada antes de nuevas operaciones. La evidencia ejecutada y las tareas pendientes permanecen en el README raíz.
