# Historial de cambios y verificación

Registra cambios completados, publicaciones y su evidencia. El estado vigente está en [docs/STATUS.md](docs/STATUS.md), las reglas en [docs/APP.md](docs/APP.md) y la operación en [backend/README.md](backend/README.md). Las menciones históricas al README como especificación/estado corresponden a la organización anterior.

## 2026-10-08 — Oscuro cálido y marca ampliada

**Publicado:** código `fbcea9e`, [PR #8](https://github.com/Juancho1162/activity-hub/pull/8), versión `e38b4c39-1a8a-480a-b4e5-df65c45c3d8e`. El oscuro comparte los tonos del claro y la plantita: carbón oliva, crema, verde hoja y terracota, con sombras cortas pixeladas. La marca crece a 96 px en acceso y 64 px en navegación, con «Activity Hub» siempre al lado. El favicon simplifica cara/hojas para leerse a 16 px y versiona su URL; pausar la animación conserva el personaje completo mediante un SVG estático separado. La paleta clara se conserva.

`npm run release:prepare` pasa con **36 pruebas backend y 263 frontend**, tipos/build, dry-run y Firefox/Brave. 108 pares de contraste ≥4,5:1 y cuatro bordes ≥3:1; capturas claras/oscuras revisadas a 1366/390/320 px y favicon a 16/32/64/128 px. Las verificaciones conservan límites geométricos, autocompletado, idiomas, pausa y movimiento reducido; el tick aparece en el primer frame (4/5/4 ms). Se verifican 66 enlaces/anclas y la conservación literal de la documentación histórica. Revisión en la sesión principal, sin revisión independiente; Safari/iPhone físico no probado. No hay dependencias ni migraciones nuevas.

`npm run release:deploy` publicó desde main limpio. Web/CSP, salud, 401/no-store y rechazo sin CAPTCHA pasan; los ocho archivos públicos coinciden byte por byte con el artefacto. Brave contra producción confirma paleta cálida, favicon con URL nueva servido y decodable, logo de 96 px junto al nombre a 320/390/1366 px, pausa/reanudación, frames del SVG y movimiento reducido, idiomas, autocompletado/foco y preferencias tras recarga. No se crearon cuentas ni actividad. Huella ejecutable `d7b9b139cf4331b16376aa4cb5f50b09ca2a82bc7bb8a9e0dbc13d12d975298c`, hash del artefacto `2cedfed0f9540c26a70ca514431d408b8f4a162e7ce8dd43b4a224299d05ec6c`. GitHub confirma cero workflows, main sin protección y ninguna revisión/CI en la PR. Estado/publicación registrados mediante una PR de documentación, sin otro despliegue.

## 2026-10-08 — Plantita 8-bit y documentación

**Publicado:** código `c2c6fac`, [PR #6](https://github.com/Juancho1162/activity-hub/pull/6), Worker `32a7f030-272a-488e-a149-738ecaa6068f`. El README pasa a presentar la aplicación y explicar su uso; las reglas se conservan en `docs/APP.md`, el estado en `docs/STATUS.md` y los registros anteriores en este archivo. Se actualizan los enlaces y el workflow para mantener esta separación. La identidad se sustituye por una plantita humanoide propia, dibujada en SVG con píxeles nítidos, pequeños movimientos y parpadeo. Tiene pausa mediante clic/teclado, movimiento reducido y favicon estático; se usa en acceso, navegación y README.

`npm run release:prepare` pasa con **36 pruebas backend y 263 frontend**, tipos/build, dry-run, ambos recorridos Firefox y Brave. Dos pruebas nuevas comprueban teclado/pausa y cambio de idioma sin remontar la imagen ni crear otra preferencia persistente. Brave confirma frames distintos del SVG servido y ausencia de movimiento/parpadeo al emular movimiento reducido; pausar conserva el autocompletado. 108 pares de contraste ≥4,5:1 y cuatro bordes ≥3:1. Capturas claras/oscuras revisadas a anchos móviles y de escritorio. La regresión de nombres como texto admite solo el logo local y sigue rechazando imágenes inyectadas; el primer pase detectó esa incompatibilidad y el conjunto corregido pasa. Los registros históricos anteriores se conservan literalmente. Revisión en la sesión principal, sin revisión independiente. Se comprobaron 64 enlaces/anclas locales y el renderizado HTML del README por GitHub con su logo. Safari/iPhone físico no probado.

`npm run release:deploy` publicó desde main limpio. Web/CSP, salud, 401/no-store y alta sin CAPTCHA pasan; los siete archivos públicos coinciden con el artefacto. Brave contra producción confirma animación real del SVG, pausa/reanudación, movimiento reducido sin parpadeo, autocompletado/foco, idiomas/temas, layout a 320/390/1366 px y recarga. No se crearon cuentas ni actividad de producción. Huella ejecutable `fa796115438a100a07c9c5e91f209714fe8846bae883d95cf5397690dc074946`, hash de artefacto `4f03505b2eee6097f526a7f19533a752f9826631e1b6aef3b3625c489cf55c40`. Estado/publicación registrados mediante una PR de documentación, sin otro despliegue.

## Archivo anterior a la reorganización

Se conserva la evidencia del antiguo README, incluyendo instantáneas de estructura, comandos y límites de cada fecha. No representa por sí sola el estado actual.

## 2026-10-05/06 — Promoción y primeras publicaciones

**Promoción local completada y verificada, 2026-10-05.** JavaScript es el backend principal; Python queda como referencia secundaria. Pasan las suites, los dos recorridos de navegador, la comparación y el arranque real desde la raíz. La revisión del traslado se hizo en la sesión principal; el perfil de revisor independiente no estuvo disponible.

### Estructura al realizar la promoción

```text
package.json                 # Comandos principales: dev, migrate, check, test:browser…
package-lock.json            # Manifest raíz sin dependencias nuevas
backend/                     # Backend principal JavaScript + Workers/D1
  src/                       # API, contratos, autenticación, SQL, fechas y operaciones
  migrations/                # Esquema D1
  scripts/                   # Arranque aislado, navegador y medición
  tests/                     # D1 real y diferencial con Python
  wrangler.jsonc             # Assets oficiales y entornos local/production separados
  README.md                  # Operación y evidencia técnica del backend principal
frontend/                    # React oficial, estilos y pruebas de UI
experiments/python-sqlite/   # Implementación anterior, migraciones y tests Python
  README.md                  # Uso de la referencia y cambios del traslado
  RENDER.md                  # Investigación histórica conservada
experiments/cyberpunk-ui/    # Laboratorio visual
experiments/art-ui/          # Laboratorio visual
experiments/8bit-twist/       # Laboratorio visual
README.md                    # Especificación y único estado/listado de trabajo
.github/PULL_REQUEST_TEMPLATE.md # Cambio, verificación, revisión y publicación de cada PR
```

### Arrancar la app principal

Desde la raíz, con las dependencias ya presentes:

```sh
npm run dev
```

Abre **http://127.0.0.1:8787**. El comando compila el frontend oficial y arranca el Worker con D1 local. `Ctrl+C` lo detiene. El arranque **no aplica migraciones** ni genera cuentas. Si cambias el frontend, reinicia el comando para recompilarlo. El puerto ocupado provoca un error; no se mata otro proceso ni se cambia de origen silenciosamente.

La antigua orden `./dev.py` ya no está en la raíz. `npm --prefix frontend run dev` y `run preview` también arrancan el backend principal con sus assets; el Vite directo queda para las herramientas de la referencia Python.

Para preparar una instalación nueva o aplicar las migraciones locales explícitamente:

```sh
npm run migrate
npm run dev
```

La base D1 existente se conserva en `backend/.state/local/`. No se han importado cuentas, códigos ni historial desde Python. Su SQLite anterior sigue en `data/activity.sqlite3`, o en el destino que se configurase, y no fue abierta ni movida por esta reorganización. Las dos bases siguen separadas.

En una cuenta nueva, pulsa **Crear cuenta**, guarda el código de forma privada, marca **He guardado mi código** y entra. Para una cuenta que ya existía en D1, utiliza su código habitual. Un código de la base Python no se incorpora automáticamente a D1. No incluyas códigos en el chat, terminal o capturas.

Los comandos usan el Wrangler instalado en `backend/node_modules/`, con configuración/cache aisladas, dotenv y telemetría deshabilitados. No hace falta instalar herramientas globales. Para reconstruir dependencias en otro checkout se usan los locks de `backend/` y `frontend/`; la promoción no ejecutó instalaciones.

### Comprobaciones

```sh
npm test
npm run check
npm run test:browser
npm run test:integration
npm run measure
```

- `test`: suites del backend —incluido diferencial con Python— y del frontend. Los resultados vigentes del incremento están en la sección 7.
- `check`: sintaxis JS, tipos/build React, la misma suite y bundle Wrangler **dry-run**, sin publicar.
- `test:browser`: recorrido completo de UI en Firefox → React → Worker/D1 temporal; layout, temas, accesibilidad, cuentas, foco/scroll y reintentos. Después comprueba PasswordCredential/store reales y layout en Brave/Chromium, con otro perfil y D1 temporales. Usa los Firefox y Brave instalados en macOS, sin instalar dependencias ni abrir perfiles personales. También disponible como `npm --prefix frontend run test:browser`.
- `test:integration`: recorrido acotado adicional de cuentas, API, dos pestañas, respuesta perdida tras commit y logout retrasado sobre D1.
- `measure`: misma fixture y acciones HTTP en workerd y Python secundario, con bases temporales. Las métricas locales no equivalen a CPU, cuotas ni costes alojados.

Las pruebas Python se conservan y pueden ejecutarse desde la raíz:

```sh
.venv/bin/python -B -W error -m unittest discover -s experiments/python-sqlite/tests -t experiments/python-sqlite
```

**Evidencia del traslado, 2026-10-05:**

- `npm run check`: **23 backend + 152 frontend** pasan, junto con sintaxis/tipos/build y bundle dry-run.
- Referencia secundaria: **102 pruebas Python** pasan desde las nuevas rutas.
- `npm run test:browser` y `npm run test:integration`: pasan los dos recorridos contra Worker/D1, incluidas dos cuentas/pestañas, respuesta perdida tras commit y reintento, logout retrasado, foco/scroll, 69 pares de contraste y siete anchos en el recorrido completo.
- `npm run measure`: snapshots y replays equivalentes con la referencia Python trasladada; ocho dashboards simultáneos correctos en cada implementación.
- Prueba del CLI principal en una copia desechable: `npm run migrate` y `npm run dev`, React y API protegida, alta/creación reales, sesión y frente conservados tras reiniciar. Con 8787 ocupado, falla sin cambiar de puerto ni detener el proceso ajeno. Solo se utilizó D1 temporal.

Una espera fallida del navegador coincidió con cambios/builds concurrentes de UI y no se reprodujo en los pases posteriores. Los fixtures conservan ahora su propia copia de assets. Se preservó el cambio concurrente en `frontend/src/App.tsx`, ajeno a la promoción.

**Revisión:** comparación de rutas/código con la copia previa, manifiestos/locks, arranque, persistencia, pruebas y documentación; sin hallazgos pendientes. Los seis módulos del runtime JavaScript conservan sus hashes y la resolución de dependencias no cambió. Revisión realizada en la sesión principal porque el perfil de revisor configurado no estuvo disponible; no se atribuye una revisión independiente nueva. La revisión independiente previa del experimento figura como evidencia histórica en [backend/README.md](backend/README.md).

**Ajuste de barra lateral, 2026-10-06:** ampliada en escritorio a 220–232 px, con nombre/navegación de 11 px, iconos de 20 px, logo y espacio interior mayores; se conserva la tipografía retro. El cambio está en `frontend/src/charm.css` y mantiene la navegación superior hasta 960 px. A 1024 px se ajustan márgenes y separación para conservar dos columnas del registro incluso con scroll vertical. El primer pase de navegador detectó la pérdida de esa segunda columna; corregido y comprobado sin cambiar las pruebas. Pasan los **152 tests del frontend** y `npm run test:browser` con tipos/build, ambos temas, siete anchos de 320 a 1920 px y 69 pares de contraste. Revisión local del CSS y las capturas, sin hallazgos pendientes; las suites de backend/Python no se repitieron para este ajuste visual.

La evidencia local anterior se limita a macOS 26.3 arm64, Node 26 y Firefox existente. La publicación de Cloudflare se comprueba por separado; Safari/iPhone físico, capacidad/coste bajo carga y restauración siguen sin probar. Los datos, procesos y perfiles de las pruebas son propios y temporales.

### Publicación en Cloudflare, 2026-10-06

- URL: **https://activity-hub.software-juancho-prego-gundin.workers.dev**. Worker `activity-hub`, entorno explícito `production`; versión `5b8ec809-e074-4821-aa71-b5166d269cb4`.
- Base nueva `activity-hub-production`, creada con jurisdicción `eu`, migración `0001_gate.sql` aplicada. No se han trasladado cuentas, sesiones ni actividad local. El alta personal se hace desde la web; conservar privadamente el código que muestra una sola vez.
- `npm run check`: **23 pruebas backend + 152 frontend**, sintaxis, tipos/build y bundle local pasan. El bundle de producción también se ha validado y desplegado. `npm run test:integration` pasa en Firefox con D1 temporal.
- **Recorrido remoto HTTPS en Firefox: PASS.** Alta y confirmación del código, login, cookie `__Host-` Secure/HttpOnly/SameSite=Strict, CSRF, crear/editar/marcar, historial/dashboard, recarga con persistencia, dos cuentas/pestañas, respuesta perdida tras commit, reintento con la misma clave y logout retrasado. Pantallas de 1366 y 390 px. Los primeros intentos fallaron por cambiar la referencia de `fetch` después de montar React en la instrumentación; corregida la prueba, pasó sin cambios del runtime.
- Retiradas por ID y fecha las cinco cuentas ficticias de la verificación y sus registros. Recuento final: **0 cuentas, frentes, checks, sesiones, replays y contextos pendientes**. Solo permanecen esquema/metadatos y contadores de intentos. Tras la limpieza: web y `/health` 200; API/sesión sin autenticar 401 con `no-store`; Origin ajeno 403; `/docs` 404 JSON.
- Preparación de Codex según la [guía oficial de Cloudflare](https://developers.cloudflare.com/agent-setup/prompt.md): 16 skills instaladas en `~/.agents/skills/`, MCP `cloudflare` configurado y autenticado por OAuth. Wrangler del proyecto autenticado. El usuario ha elegido omitir `cf`. Reiniciar Codex permite cargar el nuevo servidor MCP; no es necesario para usar la web.
- Revisión independiente de configuración y documentación: **PASS**, sin hallazgos accionables. Inspección estática; la sesión principal ejecutó las pruebas y operaciones remotas. La atribución del cambio en los README se contrastó con la descripción anterior/posterior, sin una copia inicial completa.

Riesgos considerados en esta primera publicación: apuntar por error a datos locales o ajenos (IDs/entorno explícitos y D1 nueva), incluir archivos privados en assets (solo build de React, seis archivos públicos), rechazar la sesión por Origin/cookie incorrectos (URL HTTPS exacta y prueba de navegador), y conservar datos de verificación (retirada limitada a los IDs ficticios generados). El rollback del Worker no restaura D1; la recuperación no se considera probada por haber publicado.

### Seguridad y publicación — incremento solicitado, 2026-10-06

Decisiones confirmadas: registro abierto con CAPTCHA y máximo inicial de **100 cuentas**; contenido cifrado en el navegador, sin contenido legible al consultar D1 o sus copias. La garantía elegida no incluye a un administrador que modifique deliberadamente el cliente web para capturar claves. Identificadores, tamaños, versiones, tiempos de sincronización y metadatos de autenticación siguen siendo visibles. El cifrado de Cloudflare en reposo no sustituye este cifrado de aplicación.

Implementación verificada, revisada y publicada:

- [x] Frenar peticiones antes de D1, limitar cuerpos y altas de forma atómica, acotar almacenamiento y sesiones por cuenta y añadir interruptores operativos.
- [x] Cifrar nombres, enlaces y actividad en el navegador; separar la credencial de autenticación de la clave de cifrado. Mantener versiones y reintentos seguros entre pestañas. No almacenar el código ni la clave en persistencia de la app; una nueva carga necesita desbloqueo con el código. El incremento posterior permite guardarlo opcionalmente en el gestor del navegador.
- [x] Conservar las cuentas existentes. Migrar contenido antiguo desde el navegador sin borrar el original antes de confirmar la escritura cifrada. Las copias históricas anteriores no se cifran retroactivamente.
- [x] Integrar Turnstile: alta real y rechazo 403 del token reutilizado, tanto con el mismo cuerpo como con otra credencial, comprobados en Brave contra producción. Fallos/caducidad del proveedor y acción/hostname incorrectos cubiertos en pruebas del backend. Widget y secreto configurados con el OAuth existente, sin API token adicional; huella de uso único aplicada mediante `0003_signup_challenges.sql`.
- [x] Verificar acceso entre cuentas, conflictos concurrentes, respuestas perdidas, manipulación del cifrado y límites; revisión independiente y recorrido real en navegador.
- [x] Estandarizar cambio en rama, pruebas/regresiones, preparación del artefacto, migraciones compatibles, despliegue y comprobación posterior. Git y Cloudflare son pasos distintos; no existe todavía remoto Git.

**Evidencia del incremento:** `npm run release:prepare` pasa con **36 pruebas backend y 162 frontend**, sintaxis/tipos/build, dry-run de producción y ambos recorridos Firefox del protocolo cifrado. Incluye siete anchos, dos temas, 69 pares de contraste, cierre de sesión sin desbloquear, dos cuentas, migración, respuestas perdidas y rechazo de contenido manipulado. Las suites históricas se mantienen como caracterización; las nuevas cubren el protocolo cifrado. Verificado también el rechazo de publicación fuera de `main` y el dry-run del paquete congelado con `--no-bundle`. No se han añadido dependencias al proyecto.

La primera revisión independiente encontró cuatro defectos: límite por cuenta omitido en la consulta de sesión, CAPTCHA demasiado ancho para móvil, orden incorrecto de timestamps con distinta precisión y ausencia de logout antes de desbloquear. Se reprodujeron mediante pruebas fallidas y se corrigieron; las regresiones y el conjunto completo pasan. Segunda revisión independiente: **PASS**, sin hallazgos accionables pendientes en los arreglos ni cambios cercanos; revisión estática, pruebas ejecutadas por la sesión principal. La caché local de Wrangler también se excluye de Git y de la huella del código.

**Verificación remota final:** Brave a ancho normal completó alta real 201, rechazos 403 de ambas reutilizaciones, creación/check cifrados, recarga, desbloqueo y logout sin clave. CDP confirmó cuerpos/token comparables, peticiones distintas y ausencia de caché/service worker. En la cuenta ficticia final, D1 contenía un bloque cifrado de 1300 caracteres, huella de CAPTCHA de 64 caracteres y cero frentes/replays en las tablas antiguas. Las seis cuentas ficticias de diagnóstico/verificación se retiraron por ID y fecha; recuento final de esas cuentas, bloques cifrados y sesiones: **cero**. La ventana inicial desplazada correspondía a una emulación de 320 px dentro de Brave. Firefox automatizado no completó el CAPTCHA real; la validación remota se realizó en Brave.

El refuerzo de uso único se añadió tras observar que un replay exacto superaba la validación externa y llegaba al conflicto de credencial. Las dos regresiones fallaron antes del arreglo (409 en replay exacto y cuatro altas concurrentes con un desafío aceptado por el verificador simulado) y pasan después. Revisión independiente del refuerzo: **PASS**, sin hallazgos accionables; estática, con ejecución por la sesión principal. La migración es compatible con `dce24c8`; volver a ese Worker retiraría el refuerzo de uso único.

**Siguiente paso:** ninguno pendiente del incremento solicitado. Para cada cambio futuro, seguir la [guía de operación](backend/README.md): rama, pruebas y revisión, artefacto congelado, integración en `main`, migración si procede, despliegue y comprobación posterior. Los pendientes de dispositivos/carga/recuperación siguen identificados arriba; la ampliación LLM se conserva en la sección 8 y no se ha iniciado.

Premortem: una ráfaga consume D1 antes del rechazo (limitador previo y prueba de cero consultas); altas concurrentes superan 100 (control dentro del batch); dos pestañas pierden cambios (versionado y conflictos); una migración/copia o replay conserva texto legible (inspección con datos sintéticos y traslado atómico); una publicación omite límites/CAPTCHA o no coincide con el código probado (validación de configuración y artefacto antes de publicar).

### Ajustes de acceso y barra lateral — 2026-10-07

**Publicado:** código `9392738`, integrado desde `feature/access-and-sidebar-layout`, Worker `e11d992a-5d52-4388-8962-c7e66c4385a9`. «Entrar» ocupa todo el ancho con 52 px de alto; «Crear cuenta» conserva un tamaño compacto y área táctil de 44 px. La barra de escritorio elimina el máximo de 900 px y mantiene su posición y margen inferior durante el scroll. Comprobados ambos temas: en ventanas de 720, 1080 y 1440 px de alto deja 24 px inferiores; a 480 px deja 12 px y el pie sigue visible. El acceso se ha inspeccionado a 320, 390 y 1366 px sin desbordamientos.

`npm run release:prepare`: **36 pruebas backend y 162 frontend**, tipos/build, ambos recorridos Firefox y dry-run de producción pasan. Inspección visual y del diff por la sesión principal; ajuste de presentación sin cambios de autenticación ni de esquema. Despliegue y comprobaciones remotas correctos; HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Incremento terminado.

### Transición entre Registro y Dashboard — 2026-10-07

**Publicado:** código `59f185d`, integrado desde `feature/view-transitions`, Worker `575dea62-aacd-4719-86a7-d0e5ac9988d6`. La carga retiraba la lista y reducía toda la página a una tarjeta: en la reproducción, el scroll saltaba de 750 a 0 px. Se conserva la vista completa de origen, sin permitir acciones sobre datos antiguos, hasta recibir la nueva lectura. Encabezado y fechas permanecen con sus datos; un error muestra el destino con su opción de reintento. Las respuestas descartadas y los cambios de cliente/sesión no recuperan la vista antigua; las solicitudes de escritura pendientes conservan su identidad. Entrada de 180 ms y señal de espera en el menú, con reducción de movimiento respetada.

`npm run release:prepare`: **36 pruebas backend y 167 frontend**, tipos/build, ambos recorridos Firefox y dry-run de producción pasan. Cinco regresiones de navegación y un recorrido con respuestas reales retenidas en ambos sentidos, ambos temas y anchos de 1366, 390 y 320 px comprueban contenido, scroll, foco y bloqueo de controles. Una comprobación adicional en Firefox con reducción de movimiento confirma ausencia de animaciones y transiciones; durante la carga conserva los 750 px de scroll. Revisión local del diff y de las capturas por la sesión principal, sin hallazgos pendientes. Despliegue y comprobaciones remotas correctos; HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Sin migraciones ni tareas pendientes de este incremento.

### Respuesta del check y Papelera — 2026-10-07

**Publicado:** código `377acca`, integrado desde `feature/responsive-checks-and-front-deletion`, Worker `f588b41b-4106-425d-bd6b-3fc58f78be73`. El usuario ha elegido eliminar de forma recuperable. «Eliminar frente» está en el editor; la vista «Papelera» permite buscar y restaurar cualquier estado con todos sus checks. El check muestra inmediatamente que está guardando y utiliza una sola petición en el recorrido habitual. Se conserva el cifrado en el navegador y el control de versión, cuenta y día del servidor.

`npm run release:prepare`: **36 pruebas backend y 187 frontend**, tipos/build, ambos recorridos Firefox contra Worker/D1 y dry-run de producción pasan. Incluye respuestas reales retenidas, una sola PUT sin GET para el check ya cargado, identidad/posición/foco estables, reintentos y conflictos entre pestañas, cambio de día, eliminación/restauración de los tres estados y persistencia tras recarga. Inspección de ambos temas a siete anchos, Papelera a 1366/768/390/320 px y 81 pares de contraste. Se han revisado localmente el diff y las capturas, sin hallazgos pendientes; no se afirma revisión independiente de este incremento.

Medición puntual en Firefox contra Worker/D1 local, con **300 ms de demora artificial por petición**: antes GET, PUT y GET, con el check dibujado a los 931 ms; después una PUT, indicador visible a los 4 ms y check confirmado a los 310 ms. Es una comparación local simulada, no latencia observada en producción. Una comprobación adicional con reducción de movimiento confirma un indicador estático, sin animaciones.

Se corrigieron dos hallazgos de la revisión y el navegador: repetir una solicitud que estaba en memoria debe leer el documento actual para no mostrar un check sustituido desde otra pestaña; restaurar debe recuperar el foco si el navegador lo retiró al deshabilitar el botón, sin quitárselo a otra acción. Quedan comprobados en las regresiones y el recorrido real. Integrado en `main` y publicado desde el paquete congelado `.release/build-5c531f67-6220-4b72-92eb-35fbcc417c44`; comprobaciones remotas de web/CSP, salud, acceso privado y CAPTCHA correctas, sin crear cuentas de producción. HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Sin migraciones D1, dependencias nuevas ni tareas pendientes de este incremento.

Riesgos comprobables: un documento en memoria sobrescribe datos de otra pestaña (CAS y lectura tras conflicto); una confirmación antigua se muestra en otro día/cuenta (contextos separados y memoria invalidada); una respuesta perdida se toma como éxito o se duplica (misma identidad y reintento explícito); eliminar pierde checks o estado (Papelera conserva ambos y se prueba la recuperación). Después de usar la Papelera, una pestaña con el cliente anterior puede necesitar recarga para reconocer las nuevas operaciones del documento cifrado; falla cerrada en vez de sustituir contenido.

### Marcado inmediato sin animación — 2026-10-07

**Publicado:** código `8007d83`, integrado desde `feature/instant-checks`, Worker `a9529a60-f3a7-4b96-80fa-915a3baaa33a`. El usuario ha indicado que esperar a la confirmación, aun mostrando un indicador, sigue siendo lento. La petición actual sustituye ese comportamiento: la marca aparece o desaparece en el propio clic; el cifrado y la petición continúan en segundo plano. Retirados el spinner y las transiciones del check. La vista previa conserva su contexto y revierte ante errores, manteniendo el reintento seguro ante incertidumbre.

Las regresiones fallaron antes del cambio y pasan después: marcar/desmarcar sin respuesta, revertir ambos valores tras rechazo, conservar identidad ante respuesta perdida, no aplicar la marca a otra fecha ni cliente y mantenerla durante una lectura posterior al ACK. Una regresión adicional encontró y corrigió la recuperación de una vista previa antigua al refrescar después de confirmar.

`npm run release:prepare`: **36 pruebas backend y 193 frontend**, tipos/build, ambos recorridos Firefox contra Worker/D1 y dry-run de producción pasan. El recorrido detiene cada petición antes de llegar al servidor y también su respuesta real de commit: marcar, desmarcar y volver a marcar se dibujan en el primer frame, a **4, 2 y 7 ms** respectivamente en esta prueba local. Comprueba ausencia de animación, transición y spinner, guardado real con una PUT sin GET y estabilidad de posición/foco/controles. Inspeccionados el diff y la captura de la marca dibujada con la petición retenida, sin hallazgos pendientes; revisión local de la sesión principal, sin afirmar revisión independiente. Se usan Firefox/BiDi y `requestAnimationFrame` del proyecto; no hay herramientas MCP de trazas de rendimiento disponibles. No son medidas de latencia de producción ni del guardado remoto.

Integrado en `main` y desplegado desde `.release/build-83912772-7afe-4613-a0ba-608fae937a6f`. Comprobaciones remotas de web/CSP, salud, acceso privado y rechazo de alta sin CAPTCHA correctas, sin crear cuentas de producción. HTML, JavaScript y CSS servidos coinciden exactamente con el paquete verificado. Sin migraciones D1, dependencias nuevas ni tareas pendientes de este incremento.

Riesgos comprobables: presentar una marca pendiente como guardada (texto accesible y error/retroceso); aplicar la vista previa a otro día o cuenta (contextos y pruebas); resucitar una marca antigua tras refrescar (eliminación de la vista previa al confirmar); duplicar una escritura tras perder la respuesta (identidad congelada y reintento explícito). Las escrituras y la sesión conservan el bloqueo existente durante el guardado.

### Autocompletado del código de acceso — 2026-10-07

**Publicado:** código `7f07cdb`, integrado desde `fix/password-manager-autofill`, Worker `f2bb2778-ca5b-4f96-b916-59d81bff6e4b`. Reproducido el borrado del código: la revalidación de una cookie válida sin clave de descifrado vaciaba el campo, y el input controlado reemplazaba un valor nativo sin evento React al renderizar de nuevo. Se conserva el borrador al comprobar la misma cuenta; el formulario usa un campo nativo `password` con `current-password` y lee su valor al enviar. No se introduce inicio de sesión automático ni persistencia del secreto.

Siete regresiones cubren foco/pageshow/visibilidad, autocompletado sin eventos y envío por Enter, renovación de CSRF, cambio de cuenta y conservación del límite/error de entrada. Seis fallaron con el código previo y las siete pasan tras el arreglo. `npm run release:prepare` pasa con **36 pruebas backend y 200 frontend**, tipos/build, ambos recorridos Firefox contra Worker/D1 temporal y dry-run de producción. El recorrido de UI conserva el autocompletado durante las tres comprobaciones reales y cambios de tema, mantiene campo/foco y confirma entrada, descifrado y borrado al enviar. Artefacto congelado en `.release/build-98173617-8f8a-48a2-8c0f-fac52f76a276`. La prueba simula la asignación nativa con datos propios; no usa la extensión ni la bóveda personal de Bitwarden.

Las comprobaciones remotas de web/CSP, salud, acceso privado y rechazo del alta sin CAPTCHA pasan, sin crear cuentas de producción. HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Sin migraciones D1, dependencias nuevas ni tareas pendientes de este incremento.

Riesgos comprobables: conservar el secreto tras enviar o cambiar de cuenta (borrado explícito y pruebas); desactivar la revalidación para evitar el borrado (comprobaciones de sesión reales); saltarse el bloqueo de una solicitud pendiente o trasladarla a otra cuenta (recorridos existentes de dos pestañas y reautenticación). Revisión local del diff en la sesión principal, sin hallazgos pendientes; sin atribuir una revisión independiente.

### Borrado permanente desde la Papelera — 2026-10-07

**Publicado:** código `2cf4098`, integrado desde `feature/permanent-trash-deletion`, Worker `2bd499d4-73b9-4aa8-9c09-43399a6d8e9b`. «Eliminar para siempre» se ofrece por frente en la Papelera, con confirmación y cancelación antes de enviar. Reutiliza cifrado, control de versión/cuenta y solicitud congelada ante incertidumbre; borra el frente, checks e historial, y retira el contenido de sus reintentos anteriores. Conserva recibos mínimos para impedir que una solicitud antigua lo recree.

Diecisiete regresiones fallaron antes de implementar la función; dos más reprodujeron y corrigieron un hallazgo de revisión: los recibos retirados debían evitar la caché y revalidar acceso, también si la sesión se revocó. Se comprueban además documentos inconsistentes, los límites de frentes/respuestas/bytes y paginación tras borrar. La prueba UI necesitó esperar la navegación y seleccionar los controles por rol/diálogo, evitando los envoltorios visuales y el botón de fondo. No se debilitaron las comprobaciones.

`npm run release:prepare` pasa con **36 pruebas backend y 226 frontend**, tipos/build, ambos recorridos Firefox contra Worker/D1 temporal y dry-run de producción. El recorrido UI borra frentes de los tres estados con dos checks, comprueba cancelación/foco, pérdida real de respuesta tras commit, reintento sin otra escritura, persistencia tras recarga y conservación de otros registros. El documento descifrado sintético ya no contiene el frente, sus checks, nombre o enlace, tampoco en reintentos. Revisadas capturas de ambos temas a 1366, 390 y 320 px; el recorrido completo comprueba 89 pares de contraste y conserva las regresiones de autocompletado y marcado inmediato. Artefacto congelado en `.release/build-295ef937-aee8-44d2-a4d0-1053207f7b5d`. Revisión local del diff y capturas en la sesión principal, sin hallazgos pendientes; sin atribuir una revisión independiente. Sin migraciones ni dependencias nuevas.

Publicación desde `main` limpio y comprobaciones remotas de web/CSP, salud, acceso privado y rechazo del alta sin CAPTCHA correctas, sin crear cuentas de producción. HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Sin tareas pendientes de este incremento.

Riesgos comprobables: borrar sin confirmar o un frente restaurado (foco inicial en Cancelar y validación del documento actual); dejar contenido en reintentos (inspección del documento descifrado sintético); recrearlo tras una respuesta perdida (recibos mínimos y reintento explícito); perder cambios de otra pestaña (CAS y pruebas en ambos órdenes); impedir limpiar al alcanzar la cuota (compactación de reintentos y borrado al límite sin ampliar los 512 KiB). No se ejecutan borrados de datos personales para probar la función.

### Calendarios del Dashboard por fila y fechas visibles — 2026-10-07

**Publicado:** código `4ddff4b`, integrado desde `fix/dashboard-calendar-rows`, Worker `270a7a84-acbc-4513-b5df-9215c87dd4a7`. Abrir o cerrar un calendario sincroniza los frentes de su fila actual, conservando las demás filas. Las fechas de cada casilla y el intervalo completo con año se ven al desplegar. Se conservan controles nativos, teclado/foco y plegado al cambiar de período; no se añaden animaciones, peticiones de actividad ni persistencia del despliegue.

Las tres regresiones iniciales reprodujeron el despliegue independiente y la ausencia del intervalo completo; pasan tras el cambio. Se cubren homónimos en filas de una/dos/cuatro columnas, abrir otra fila sin cerrar la primera, cerrar desde un compañero, fechas semánticas y períodos de un día, 366 días y cambio de año. `npm run release:prepare` pasa con **36 pruebas backend y 229 frontend**, tipos/build, ambos recorridos Firefox contra Worker/D1 temporal y dry-run de producción. El recorrido UI comprueba filas reales abiertas/cerradas en ambos temas a 1920/1684/1366/1024/768/390/320 px, alineación, fechas sin recortes, Enter/Espacio, foco y ausencia de lecturas/escrituras al desplegar; 92 pares de contraste pasan. Revisadas capturas de escritorio y móvil. Artefacto congelado en `.release/build-88095889-114a-43aa-a180-27ee1608e15f`. Revisión local del diff, pruebas y capturas en la sesión principal, sin hallazgos pendientes; no se atribuye una revisión independiente.

Publicado desde `main` limpio. Pasan las comprobaciones remotas de web/CSP, salud, acceso privado y rechazo de alta sin CAPTCHA; HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. Sin cuentas de producción creadas, migraciones ni tareas pendientes de este incremento.

Riesgos comprobables: sincronizar toda la página o una fila equivocada (medir la fila actual antes de cambiar alturas y probar otros anchos/filas); romper Enter/Espacio o el foco (activar los controles nativos en Firefox); esconder fechas o desbordar tarjetas (fechas semánticas y capturas/medidas); enviar actividad al desplegar (comprobar ausencia de lecturas/escrituras). Sin cambios de datos, cifrado, cuentas ni dependencias.

### Guardado en el gestor de contraseñas y adaptación móvil — 2026-10-07

**Publicado:** código `7ab68de`, integrado desde `fix/password-saving-mobile-layout`, Worker `d4c2bdcc-0579-49db-b73d-1f0ed54ca4a8`. Se ofrece el código al gestor nativo únicamente tras una entrada verificada y la activación de su cuenta. Alta y entrada usan formularios reconocibles; se mantiene una señal compatible de finalización donde no existe PasswordCredential. El aviso y el guardado dependen del navegador y de la elección del usuario. El secreto permanece fuera de D1 y de la persistencia de la aplicación; no se introduce entrada automática. La misma web adapta navegación, fechas, filtros y editor al ancho disponible.

Tres regresiones iniciales de autenticación reprodujeron la falta de integración nativa y del formulario de contraseña de alta. Doce pruebas cubren entrada confirmada/pendiente/rechazada, ACK y cuenta de alta, autocompletado sin eventos, ausencia/rechazo del gestor, sesión recordada, desmontaje y cuentas diferenciadas. La prueba de una solicitud incierta comprueba que no se ofrece la credencial de otra cuenta bloqueada. Una regresión adicional reproduce y comprueba el despliegue de filtros sin lecturas/escrituras ni pérdida de selección. El navegador real reprodujo un desbordamiento del registro a **361 px**; se corrigieron también las etiquetas estrechas a 320 px.

`npm run release:prepare` pasa con **36 pruebas backend y 242 frontend**, tipos/build, dry-run de producción, ambos recorridos Firefox contra Worker/D1 temporal y el nuevo recorrido Brave/Chromium. Firefox comprueba 15 anchos del registro de 320 a 1920 px en ambos temas, límites de controles, ausencia de superposición, etiquetas visibles, filtros abiertos/cerrados, orientación horizontal, editor desplazable a 430 px de alto y 92 pares de contraste. Brave construye PasswordCredential y llama a store reales con códigos sintéticos tras alta/entrada, rechaza guardado tras código incorrecto, conserva autocompletado nativo y verifica 11 anchos de registro/dashboard. Comprueba que la app no pide credenciales automáticamente ni envía el código original. No se afirma haber visto o aceptado el aviso en headless, ni probado Safari/iPhone físico.

Artefacto congelado en `.release/build-2c324d21-eec2-4aa2-9e0e-c0a1448256a0`. Revisados código, pruebas y capturas de escritorio, móvil y editor bajo en la sesión principal, sin hallazgos pendientes; no se atribuye una revisión independiente porque no está disponible la selección del perfil de revisor. Sin dependencias nuevas, migraciones ni cambios de datos.

Publicado desde `main` limpio. Pasan las comprobaciones remotas de web/CSP, salud, acceso privado y rechazo del alta sin CAPTCHA; HTML, JavaScript y CSS servidos coinciden exactamente con el artefacto verificado. No se han creado cuentas de producción. No quedan tareas pendientes de este incremento; la comprobación manual de Safari/iPhone y del aviso nativo en cada navegador sigue pendiente como verificación de dispositivos.

Riesgos comprobables: guardar un código rechazado o de otra cuenta (solo tras prueba válida y activación, incluidos alta y bloqueo de solicitudes); bloquear el acceso por la política del gestor (API opcional sin esperar al diálogo); persistir el secreto en la app (sin localStorage, URLs ni tráfico del código original); romper Bitwarden al controlar el campo (mantener entrada nativa y pruebas existentes); ocultar controles o invadirlos al cambiar el ancho (medidas de límites, no superposición y 44 px, con capturas en tamaños intermedios).

### GitHub y workflow de desarrollo — 2026-10-07

Repositorio privado **[Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub)**, conectado como `origin`. Subidos y comprobados el historial de `main`, `feature/information-agent` y la etiqueta histórica `v0.1.0`; las demás ramas anteriores se conservan localmente. El flujo de rama, verificación, revisión, PR, integración y publicación está en [backend/README.md](backend/README.md#flujo-de-cambio-pruebas-y-publicación), con [plantilla de PR](.github/PULL_REQUEST_TEMPLATE.md). El cambio se registra en la **[PR #1](https://github.com/Juancho1162/activity-hub/pull/1)**, desde `chore/github-workflow`.

Actualizados también `AGENTS.md`, la skill `engineering-workflow`, el README y el estado de **codexdev** en su perfil local, fuera de este repositorio. `python3 scripts/check_profile.py` pasa los cinco grupos, incluida la carga nativa de las tres skills. `quick_validate.py` sigue indisponible por falta de PyYAML; no se añadieron dependencias. Revisión local del diff, enlaces e instrucciones; `git diff --check` correcto. Inspeccionados 252 blobs del historial con patrones de credenciales y rutas privadas, sin coincidencias detectadas; no equivale a una auditoría exhaustiva.

La API de GitHub confirma repositorio privado, `main` sin protección y cero workflows de Actions. Las pruebas siguen siendo locales; no hay CI ni despliegue automático. Este incremento modifica solo Markdown: no se repiten las suites funcionales ni se publica el Worker. La comprobación del artefacto confirma la misma huella de código ejecutable y los mismos hashes preparados de la última publicación. La revisión se hizo en la sesión principal, sin atribuir revisión independiente. Bases D1, credenciales y artefactos locales permanecen fuera de Git.

### Castellano, inglés y tema oscuro — 2026-10-08

**Publicado:** código `546c1c8`, integrado desde `feature/bilingual-interface` mediante la [PR #2](https://github.com/Juancho1162/activity-hub/pull/2), Worker `09386ef0-2317-4221-ad74-8c323b975729`. Selector en el acceso y la sesión activa; preferencia explícita en `activity-hub.language`, sincronizada entre pestañas. Sin elección previa se usa el primer castellano/inglés de los idiomas del navegador, o castellano si no hay coincidencia. Se traducen navegación, formularios, estados, avisos, validaciones, errores conocidos, textos accesibles, título y oferta al gestor nativo. Fechas y porcentajes usan `es-ES`/`en-GB`; los días ISO y `Europe/Madrid` se mantienen. El CAPTCHA toma el idioma al iniciar su verificación; cambiar después no reinicia un desafío pendiente. Nombres, referencias y credenciales se conservan literalmente.

El oscuro pasa de verdes/grises cálidos a una paleta antracita con acentos azules suaves, fondo liso y sombras ligeras. La paleta y decoración del claro no cambian. En móvil, cuenta/cierre y preferencias usan dos filas para mantener visibles los controles a 320 px. Cambiar idioma o tema conserva código autocompletado, ACK del alta, editor, fecha/filtros, foco, sesión e identidad de las solicitudes pendientes; no crea clientes, consultas de actividad ni reintentos.

Diez regresiones de idioma fallaron antes de traducir la UI; pasan con la implementación. Las 17 pruebas nuevas cubren detección, persistencia, almacenamiento bloqueado, sincronización, acceso/alta, límites, fechas, borradores, checks y reintentos, y confirmación del borrado. Dos pruebas adicionales comprueban el idioma del widget de CAPTCHA. `npm run release:prepare` pasa con **36 pruebas backend y 261 frontend**, tipos/build, dry-run de producción, ambos recorridos Firefox contra Worker/D1 temporal y Brave/Chromium. Firefox conserva las regresiones de seguridad, historial, calendarios, Papelera y marcado inmediato; añade acceso inglés, recarga, autocompletado sin eventos, cambio real entre pestañas con editor abierto, fechas/porcentajes y capturas de ambos temas a 1366/768/390/320 px. Se comprueban **106 pares de contraste de al menos 4,5:1**. Brave comprueba ambos idiomas/temas y registro/dashboard a 11 anchos de 320 a 1366 px, además de PasswordCredential/store reales y ausencia de tráfico del código original. Los checks se dibujaron en el primer frame, a 4/5/7 ms en esta ejecución local; no es una medición de dispositivos reales.

Artefacto congelado en `.release/build-bcf292e5-747b-49b8-89ed-c63873026ae2`. Revisados diff, archivos nuevos y capturas de acceso, dashboard y editor en la sesión principal, sin hallazgos pendientes. El primer recorrido inglés exigía alineación tras conservar solo un calendario móvil abierto y ampliar la ventana; se corrigió la preparación de la prueba para abrir la fila del ancho actual, sin cambiar ni debilitar la regla de la aplicación. No se atribuye revisión independiente: este entorno no permite seleccionar el perfil `reviewer` de codexdev. Sin dependencias nuevas, migraciones ni cambios de datos. Safari/iPhone físico y visibilidad/aceptación del aviso nativo siguen pendientes como comprobaciones de dispositivos.

`npm run release:deploy` publicó desde `main` limpio. Pasan las comprobaciones remotas de web/CSP, salud, rechazo sin sesión/no-store y alta sin CAPTCHA. Los seis archivos públicos servidos coinciden byte por byte con el artefacto preparado; `_headers` es configuración interpretada por Cloudflare. Brave, con un perfil nuevo contra producción, confirma textos castellano/inglés, conservación del campo autocompletado y foco, paleta antracita, layout a 320/390/1366 px y persistencia de las dos preferencias tras recargar; el campo de acceso vuelve vacío. No se han creado cuentas ni actividad en producción. Huella ejecutable `d97932b1bdfb6f38ba142ef0f6305c6dbca59fa775de947cc7e1dfe692f689dd`, hash del artefacto `0efd823a8f028105c6dc51b3a89b76baae8a585ec9b31acfd1a5a16e2ee8c3fc`. El repositorio continúa sin CI ni despliegue automático; la evidencia y el estado de publicación se actualizan mediante una PR de documentación sin repetir suites funcionales ni desplegar de nuevo.

### Tema oscuro Nord y selector de idioma 8-bit — 2026-10-08

**Publicado:** código `8c9435c`, integrado mediante la [PR #4](https://github.com/Juancho1162/activity-hub/pull/4), Worker `a3d0a0ab-f6e4-432e-b0f3-e45be037f58e`. Se sustituye la paleta antracita por una adaptación de [Nord](https://www.nordtheme.com/docs/colors-and-palettes/). El tema anterior ya superaba el contraste mínimo; el cambio busca una separación más clara de superficies y una combinación visual más cómoda, sin prometer comodidad universal. Se consultaron también las guías de [color de Primer](https://primer.style/accessibility/design-guidance/color-considerations/) y [tokens de Carbon](https://www.carbondesignsystem.com/building-blocks/foundations/color/tokens). La paleta clara no cambia. El selector de idioma reutiliza la decoración original de los botones 8-bit, conserva el desplegable nativo, la etiqueta accesible y el manejo por teclado. No cambian cuentas, cifrado, datos ni animaciones, y no se añaden dependencias ni migraciones.

`npm run release:prepare` pasa con **36 pruebas backend y 261 frontend**, tipos/build, dry-run de producción, ambos recorridos Firefox contra Worker/D1 temporal y Brave/Chromium. El primer intento dentro del sandbox falló por la prohibición de abrir puertos locales; la ejecución autorizada fuera del sandbox pasa. Se comprueban **108 pares de texto/icono/superficie de al menos 4,5:1**, y **4 bordes de controles de al menos 3:1** entre ambos temas, siguiendo los criterios de [texto de W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). La revisión visual incluye el acceso claro y dashboard oscuro a 1366/320 px, con el selector y cierre de sesión compartiendo marco. La revisión del cambio se hizo en la sesión principal, sin revisión independiente. Safari/iPhone físico y comodidad durante uso prolongado siguen sin comprobar.

Artefacto congelado `build-e1671f19-5b7e-4388-8ab7-e6a9a23323a5`, huella ejecutable `064e8b02430e2fd701ac2d21722f39270e51dbe9d4479763ee2c64ee36b9623d`, hash del artefacto `aaba1e32dfc80b91ba54462d72cd1decfa20161b0566d93fcafde2c8699c0ec7`. `npm run release:deploy` publicó desde `main` limpio y pasan las comprobaciones remotas de web/CSP, salud, rechazo sin sesión/no-store y alta sin CAPTCHA. Los seis archivos públicos coinciden byte por byte con el artefacto; `_headers` es configuración interpretada por Cloudflare. Brave contra producción, con un perfil temporal, confirma textos castellano/inglés, conservación del autocompletado y foco, paleta Nord, marco pixelado de idioma, layout a 320/390/1366 px y preferencias tras recargar. No se han creado cuentas ni actividad en producción. GitHub confirma cero workflows de Actions, ninguna revisión ni comprobación CI en la PR y `main` sin protección; el cambio fue revisado y probado localmente. Incremento terminado; este registro se integra mediante una PR de documentación, sin repetir las suites ni desplegar otra vez.

