# Activity Hub


**Herramientas personales para asistir, monitorizar y apoyar mi actividad profesional y formativa.**

Activity Hub agrupa herramientas con un propósito común, no una única aplicación en la que todo tenga que estar relacionado. Por ahora se distinguen dos módulos: **notificaciones y asistencia** y **registro y seguimiento de actividad**.

**Prioridad actual: empezar por registro y seguimiento**, con interfaz web e integración con pi mediante MCP. El módulo de notificaciones se definirá más adelante; no bloquea el trabajo sobre registro.

**Implementado y probado en local:** alta abierta desde la app, cuentas privadas e independientes, un único código fijo por cuenta, inicio y cierre de sesión, sin recuperación. Los códigos se generan al crear la cuenta en la web, no por terminal. Véanse [estado y comandos locales](#6-estado-real-y-verificación).

## 1. Notificaciones y asistencia

**Objetivo:** ayudarme a recordar cosas y hacerme llegar información útil, sin depender del registro de mi actividad.

El módulo contempla información procedente de distintas fuentes:

- Cosas que introduzca yo, como recordatorios recurrentes con texto y horario.
- Información que una IA pueda recopilar o preparar a partir de correo, Teams u otras fuentes que se elijan.

Los recordatorios son **siempre independientes**: no pertenecen a un frente, no necesitan que exista uno y no se asocian aunque su contenido trate sobre la misma actividad.

**El MVP de este módulo está pendiente de definir.** Correo, Teams y otras fuentes forman parte de la visión, pero no son integraciones aprobadas para implementar ni se ha decidido cuáles entrarán en la primera versión. Tampoco se ha cerrado cómo se gestionarán las reglas, qué procesará una IA ni qué información se conservará. El acceso a fuentes profesionales requerirá comprobar permisos y políticas aplicables antes de conectarlas.

## 2. Registro y seguimiento de actividad

**Objetivo:** disponer de una pequeña interfaz web para registrar en qué estoy metido y qué días trabajo en ello, con un dashboard propio que permita ver mi actividad registrada.

Se conservan las reglas acordadas para este módulo:

- Inventario de frentes con tres estados, decididos siempre por el usuario:
  - **Abierto:** forma parte de sus actividades actuales.
  - **Standby:** está aparcado con intención de retomarlo.
  - **Archivado:** se da por cerrado, porque se terminó o se decidió dejarlo. Sale de la vista habitual, pero conserva su historial.
- Pasar a standby o archivar no borra actividad registrada. La app no cambia estados por falta de actividad.
- Registro manual con **un check por frente y día**. Vacío significa «sin actividad registrada», no «no lo hice». Manual significa decidido explícitamente por el usuario, también cuando lo solicita a pi.
- La zona horaria del registro es **`Europe/Madrid`**, incluidos sus cambios de horario. Es la referencia común para los días y para interpretar «hoy» y «ayer» desde la web y pi/MCP, independientemente de la zona del servidor.
- Se pueden **marcar y desmarcar checks de días pasados** para completar olvidos o corregir errores, tanto desde la web como mediante una petición explícita a pi.
- Sin horas, intensidad, puntuaciones de esfuerzo ni clasificación automática de abandono.
- Dashboard sencillo de frecuencia, último registro y huecos, basado en los checks que haya marcado.
- Los materiales de proyectos, cursos y demás permanecen en sus carpetas o webs. Este módulo no los replica.
- Acceso desde la interfaz web y desde **pi mediante MCP**, no limitado conceptualmente a dar de alta frentes: debe permitir consultar y gestionar las capacidades que se definan para el módulo, con las mismas reglas e historial. Los cambios requieren una acción o petición explícita; comentar una actividad, recibir un correo o mantener una sesión con IA no crea frentes ni marca checks por sí solo.

### MVP funcional aprobado

**Vista de registro diario:**

- Tarjetas compactas de frentes abiertos, con un check por frente: varias columnas según el espacio disponible en ordenador y una columna en móvil. Con pocos resultados conservan un ancho contenido; las tarjetas de una misma fila tienen igual altura y muestran los nombres completos. El orden de lectura va de izquierda a derecha y después hacia abajo. Marcar conserva la posición y el foco: no se desmonta la lista durante su actualización ni se muestra un guardado optimista. El guardado se refleja en la vista sin avisos transitorios de envío o éxito, y sin atenuar los demás checks y botones.
- Hoy seleccionado por defecto, con posibilidad de elegir una fecha pasada.
- Añadir o editar un frente con nombre y enlace opcional. La referencia no aumenta el tamaño de su tarjeta: aparece como acción compacta independiente. Tarjetas del registro diario densas, con un área de pulsación del check de al menos 44 px.
- Acceso a los frentes en standby y archivados para consultarlos y gestionar su estado.

**Vista de dashboard:**

- Resumen por frente con el porcentaje de días registrados respecto a **todos los días del período seleccionado, ambos extremos incluidos**. Ejemplo: 4 días marcados de 10 seleccionados → 40 %. No es una puntuación ni un objetivo.
- Último día registrado global y número de días registrados frente al total del período.
- Detalle de todos los días en un desplegable por frente, cerrado inicialmente. Huecos visibles al abrirlo, sin interpretarlos como abandono.
- Dashboard ordenado de mayor a menor porcentaje del período, **antes de paginar** y dentro de los filtros/cuenta actuales. Empates estables por creación/UUID. El registro diario conserva su orden anterior.
- Tarjetas de la misma fila con altura uniforme y acciones del calendario alineadas. El nombre más largo determina el espacio necesario, sin recortes ni una altura fija; cada calendario sigue abriéndose de forma independiente.

**Acceso equivalente desde pi/MCP:** consultar frentes e historial, añadir o editar un frente, cambiar su estado y marcar o desmarcar un día. Las dos interfaces operan sobre los mismos datos y reglas, siempre con peticiones explícitas para los cambios.

Quedan fuera de este primer módulo las notificaciones, correo, Teams, el dashboard agregador y el agente coordinador. No se convierte el registro en un gestor de tareas ni en un detector automático de actividad.

### Acceso privado acordado

- **Alta abierta integrada en la app:** cualquiera puede crear una cuenta, sin invitaciones, Google, correo ni nombre de usuario. Sustituye el diseño anterior de propietario único y alta por terminal.
- **Una cuenta, un código fijo.** El código secreto largo y aleatorio se genera únicamente al crear la cuenta y se muestra para guardarlo privadamente. No se cambia, regenera ni sustituye. Funciona como una contraseña, no como un identificador público.
- **Sin recuperación de ningún tipo:** ni administrativa, ni desde una sesión abierta, ni mediante un segundo código. Si se pierde, no existe un procedimiento para recuperarlo o emitir otro para esa cuenta. Una sesión existente no habilita esa posibilidad.
- **Crear cuenta / iniciar sesión / cerrar sesión**, dentro de la web. Entrar exige el código de una cuenta existente; un código incorrecto no crea una cuenta. Cerrar sesión no borra la cuenta ni sus datos.
- Una persona puede tener varias cuentas. Cada alta crea un registro vacío e independiente; frentes, checks, historial y reintentos quedan aislados por cuenta. El servidor conserva una huella verificable del código, no el original; no se incluye en URLs, logs ni almacenamiento persistente del frontend.
- **Correo opcional: solo una posibilidad futura, fuera del alcance actual.** No se añade campo, vinculación ni recuperación por correo ahora; su eventual comportamiento no está definido.
- Se mantienen HTTPS al alojarlo, sesiones seguras, CSRF y límites de entrada y de creación de cuentas. No se generan ni comparten credenciales reales en la documentación o el chat. El flujo multiusuario está implementado y verificado localmente; la evidencia y los límites figuran abajo.
- **La autenticación de pi/MCP sigue pendiente de aprobación técnica.** Se mantiene la propuesta de una credencial independiente para la API; elegir el código de acceso web no configura pi ni aprueba reutilizar ese mismo secreto en el conector.

## 3. Independencia y posible evolución

**La separación funcional está decidida:**

- El módulo de notificaciones no necesita conocer los frentes ni sus checks.
- El módulo de registro no necesita recordatorios para funcionar.
- Crear, recibir, modificar o desactivar un recordatorio no cambia el registro de actividad. Marcar un check tampoco completa, cancela ni reprograma recordatorios.
- No habrá asociaciones entre recordatorios y frentes, ni manuales ni inferidas por coincidencia de nombres o contenido.
- El interés previo en un aviso para repasar los checks puede resolverse como un recordatorio independiente, sin consultar el historial ni asociarlo a ningún frente.

**La separación en despliegues o servicios distintos sigue abierta.** Los módulos pueden terminar siendo servicios separados, pero esta reformulación no exige una arquitectura distribuida desde el inicio ni aprueba un número concreto de recursos alojados. Compartir infraestructura, si se elige por sencillez, no debe introducir relaciones funcionales entre ellos.

Un dashboard central que consuma distintos servicios es una **posible evolución futura, no un requisito actual**. Es distinto del dashboard del módulo de registro, que sí forma parte de su propósito.

La integración común será **pi mediante MCP**: una interfaz conversacional puede acceder a las capacidades de cada módulo sin que estos dependan entre sí. Un agente coordinador que orqueste varios módulos es otra posible evolución, no un componente que haya que construir ahora. No introduce registro automático de actividad ni autorización general para modificar datos.

### Ejemplos de comportamiento acordado

- Puedo crear un recordatorio sobre guitarra sin dar de alta un frente de guitarra.
- Si también existe ese frente, recibir el recordatorio no marca su check; marcar el check no modifica el recordatorio.
- Desactivar un recordatorio no pone ningún frente en standby ni elimina su historial.
- Si más adelante se habilita un resumen de correo, generarlo no registra actividad ni crea frentes automáticamente.
- Pedir a pi «registra que hoy he trabajado en guitarra» es una petición explícita de registro, no una inferencia sobre una conversación. La operación debe seguir las mismas reglas que en la web y usar la fecha actual en `Europe/Madrid`, aunque en la zona del servidor sea otro día.
- Si olvidé registrar la actividad de ayer, puedo marcarla hoy para esa fecha. Si un check era un error, puedo desmarcarlo: ese día vuelve a quedar sin actividad registrada, no como una afirmación de que no hice nada.
- Un curso terminado puede archivarse para que deje de aparecer en la vista habitual, conservando sus checks. Un curso que se pretende retomar queda en standby por decisión del usuario.
- Si registro un check desde pi, al consultar esa fecha en la web aparece el mismo registro. Marcar otra vez el mismo frente y día no crea un segundo check.
- Con mi código válido puedo iniciar sesión en el Mac y en el móvil, sobre los mismos datos y sin proporcionar correo ni nombre. Un código incorrecto no permite consultar ni modificar el registro.
- Creo una cuenta A, registro actividad, cierro sesión y creo B: B empieza vacía. Al entrar de nuevo con el código A recupero únicamente los datos de A. Una escritura pendiente de A no puede aplicarse a B.
- El código de A permanece fijo. Si lo pierdo, no hay recuperación ni sustitución, tampoco desde una sesión abierta o administración. Crear otra cuenta no recupera los datos de A.

## 4. Implementación principal

**Decisión del 2026-10-05:** JavaScript moderno + Cloudflare Workers + D1 pasa a ser la implementación principal, por petición expresa del usuario. React conserva su código, aspecto y comportamiento. El backend anterior de Python se conserva como [referencia secundaria](experiments/python-sqlite/README.md).

| Pieza | Implementación actual |
| --- | --- |
| Backend | JavaScript ES modules en `backend/src/`, ejecutado por workerd/Workers. |
| Datos | D1 local mediante Wrangler y D1 de producción separada; esquema SQL en `backend/migrations/`. |
| Frontend | React + TypeScript + Vite en `frontend/`, con shadcn/ui + 8bitcn y el aspecto «8-bit con encanto». |
| Web y API | [Web publicada](https://activity-hub.software-juancho-prego-gundin.workers.dev) y entorno local en `http://127.0.0.1:8787`; el Worker sirve el build oficial y la API. |
| Referencia anterior | FastAPI + SQLAlchemy + Alembic + SQLite en `experiments/python-sqlite/`; se usa en las comparaciones automáticas. |
| MCP de Activity Hub | Previsto, aún sin implementar ni configurar; su autenticación queda por decidir. Es distinto del MCP de administración de Cloudflare instalado en Codex. |

Node 26.0.0, npm 11.12.1 y Wrangler 4.147.0 fijado en `backend/package-lock.json`; dependencias de React fijadas en su propio lock. Python 3.14 de `.venv/` solo es necesario para la referencia, sus pruebas y las comparaciones. **Arrancar y usar la app principal no requiere Python.** No se instalaron dependencias nuevas durante la promoción.

El código, configuración y dependencias de JavaScript se trasladaron desde `experiments/javascript-workers-d1/` a `backend/`. Su carpeta de estado también se trasladó, conservando los mismos archivos y el identificador D1 local. La configuración local no utiliza recursos de Cloudflare remotos.

La [guía del backend principal](backend/README.md) conserva detalles de transacciones, pruebas, medición y publicación en Cloudflare, autorizada el 2026-10-06 con una base remota vacía. La [investigación de Render](experiments/python-sqlite/RENDER.md) queda asociada a la alternativa Python; sus precios y recetas son históricos. La capacidad/coste bajo carga y la recuperación de copias siguen sin validarse.

Los laboratorios [cyberpunk](experiments/cyberpunk-ui/README.md), [artístico](experiments/art-ui/README.md) y [8-bit](experiments/8bit-twist/README.md) se conservan como referencias visuales. Solo la presentación 8-bit elegida se integró en React; los datos y controles de sus maquetas permanecen aislados. El [favicon](frontend/public/favicon.svg) usa el logo actual de cuatro cuadrados; el [ordenador](frontend/src/assets/pixel-desk.svg) se conserva como alternativa fuera de la interfaz.

## 5. Contratos y garantías

La UI conserva registro diario en columnas, dashboard con orden global antes de paginar, nombres completos, calendarios plegables, foco/scroll y confirmación del servidor. Tema claro/oscuro con un clic, preferencia persistente y sincronización entre pestañas; los cambios visuales no descartan formularios ni solicitudes pendientes. La paleta y los componentes del frontend no se han modificado para esta promoción.

### Acceso y persistencia

- Alta abierta de una cuenta vacía, código fijo de 32 símbolos aleatorios —160 bits— mostrado en ocho grupos. Se confirma que se ha guardado antes de entrar. Se aceptan mayúsculas/minúsculas ASCII, espacios y guiones; el código original no se almacena en la base.
- Sesiones opacas de 256 bits con caducidad absoluta de 30 días, cookie HttpOnly/SameSite=Strict/Path=/ y Secure al usar HTTPS. Comprobación al volver a la pestaña y cada minuto. Logout revoca solo la sesión capturada y no borra una cookie posterior de otra cuenta.
- Cuenta esperada en `X-Activity-Account`; escrituras con Origin exacto y `X-CSRF-Token`. La sesión se revalida dentro del batch que lee o modifica los datos. `/api` y `/auth`, también sus prefijos exactos, pasan por el Worker y llevan `no-store`; no caen en el HTML de la SPA.
- Límites persistentes e independientes: 10 intentos de entrada y 5 altas por ventanas globales de 60 segundos. Un rechazo temporal no implica que un código se haya invalidado. La publicación conserva el registro abierto existente; capacidad y coste bajo carga quedan pendientes de medición.
- Transacciones D1 con reloj SQL, unicidad de check por frente/día, aislamiento por cuenta y replay atómico. Madrid se resuelve al serializar la operación, incluidos medianoche y cambios de horario. No hay mutex en memoria, caché de respuestas privadas ni bypass de desarrollo.
- Los enlaces son referencias; el backend no los visita. Nunca registrar códigos, cookies, tokens, bodies privados, SQL ni parámetros. No hay recuperación/rotación de códigos ni alta administrativa operativa.

**Reintentos:** no hay actualización optimista ni reintentos automáticos. Ante una escritura incierta se bloquean nuevas escrituras y se ofrece reintentar la misma solicitud con su clave, contenido y fecha originales. El formulario se conserva congelado; el reintento está dentro del diálogo para ser accesible. Un rechazo de un reintento no borra la incertidumbre de la solicitud original; se conserva su identidad hasta obtener confirmación. Las respuestas de escritura se contrastan con el ID/contenido enviados, admitiendo la normalización de nombre y URL del backend. La identidad pendiente permanece **solo en memoria de esa pestaña**: se avisa antes de cerrarla/recargarla, pero no se garantiza recuperación tras cerrar el navegador. No se guardan actividad ni código en almacenamiento persistente del frontend; la única credencial persistente del navegador es la cookie de sesión HttpOnly. Si caduca o se revoca la sesión, se ocultan los datos y el editor, sin desmontar su estado pendiente. Volver a entrar **en la misma cuenta** permite un reintento explícito con la misma identidad y el CSRF actualizado. Entrar en otra cuenta no consume ni traslada la solicitud: queda bloqueada hasta volver a la original. Sin solicitudes pendientes, cambiar de cuenta reinicia borradores/vistas; los cambios detectados en otra pestaña requieren confirmación. El cierre de sesión está bloqueado mientras haya una escritura pendiente; un cierre de resultado incierto oculta los datos hasta confirmarlo o reintentarlo.

### Contratos implementados

| Método y ruta | Operación |
| --- | --- |
| `POST /auth/signup` | JSON `{}` y Origin exacto; 201 `{account_id, code}` una vez, sin sesión/cookie. 409 si ya hay sesión válida; 429 límite. |
| `GET /auth/session` | Sesión válida: `authenticated`, `account_id`, `csrf_token`, `expires_at`; 401 sin sesión, 503 sin esquema/servicio. |
| `POST /auth/login` | JSON `{code}` y Origin exacto; emite sesión/cookie de esa cuenta, 401 incorrecto, 429 límite. |
| `POST /auth/logout` | Cookie, `X-Activity-Account`, Origin y CSRF; revoca la sesión capturada, 204 sin `Set-Cookie`. |
| `POST /api/fronts` | Crear frente; `Idempotency-Key` UUID obligatorio. |
| `GET /api/fronts` | Consultar frentes con `states`, `search`, `limit` y `offset`. |
| `GET /api/fronts/{front_id}` | Consultar un frente por UUID. |
| `PATCH /api/fronts/{front_id}` | Editar nombre, referencia o estado. Omitir un campo lo conserva; `reference: null` borra solo el enlace. |
| `PUT /api/fronts/{front_id}/check` | `{ "day": "today", "marked": true }`; UUID de idempotencia obligatorio. También fecha ISO estricta o `yesterday`. |
| `GET /api/history` | Checks presentes dentro de `start`/`end` inclusivos; filtro opcional `front_id`. |
| `GET /api/dashboard` | Frentes con fechas marcadas, último registro global y conteo del período; filtros/paginación. `order=created` por defecto; `order=activity_desc` ordena el conteo inclusivo descendente antes de paginar, con empates por creación/UUID. |

Límites técnicos: nombre recortado de 1–200 caracteres, sin NUL —validado también en SQLite—; referencia HTTP(S) de hasta 2048, nunca recorrida; estados `open`, `standby`, `archived`. Las consultas de frentes incluyen todos los estados si se omite el filtro. Búsqueda por subcadena literal, con las reglas de mayúsculas de SQLite `LIKE` —insensible para ASCII, no normalización lingüística completa—. Orden predeterminado de frentes por creación/UUID y de checks por fecha/UUID. Solo el dashboard admite además `order=activity_desc`; con el mismo denominador para todos los frentes, el conteo equivale al porcentaje sin redondear. Máximo 100 frentes o 1000 checks por página, `offset` hasta 100000 e intervalos de hasta 366 días; se pueden consultar períodos anteriores por tramos. Un UUID de frente inexistente **o de otra cuenta** devuelve 404, incluso en consultas sin actividad; intervalos o entradas inválidas devuelven 422.

Los reintentos de una misma cuenta con la misma clave y solicitud normalizada devuelven la **respuesta original**, sin reaplicar cambios sobre ediciones posteriores. La clave está ligada a la cuenta: el mismo UUID en otra cuenta es independiente y nunca devuelve datos ajenos. La fecha relativa se resuelve en Madrid una sola vez y se conserva al reintentar, incluso tras medianoche o reinicio. Reutilizar una clave con otro contenido, frente u operación devuelve 409. El registro interno de idempotencia se conserva sin caducidad en este bloque; una política futura no podrá romper esas garantías. No hay borrado permanente de frentes.


`/health` comprueba disponibilidad del esquema. `/docs`, `/redoc` y `/openapi.json`, auxiliares de FastAPI, no forman parte del Worker y devuelven JSON 404. La equivalencia verificada cubre la API de la app y sus casos de borde; las cabeceras Content-Type raw duplicadas y toda URI malformada no tienen una garantía de equivalencia universal.

El conector futuro usará los mismos casos de uso, con una credencial independiente y permisos explícitos. No se reutiliza automáticamente el código web, no se configura pi y no se ofrecen SQL, shell o navegación arbitrarios mediante MCP.

## 6. Estado real y verificación

**Promoción local completada y verificada, 2026-10-05.** JavaScript es el backend principal; Python queda como referencia secundaria. Pasan las suites, los dos recorridos de navegador, la comparación y el arranque real desde la raíz. La revisión del traslado se hizo en la sesión principal; el perfil de revisor independiente no estuvo disponible.

### Archivos actuales

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

- `test`: 23 casos del backend —incluido diferencial con Python— y 152 del frontend.
- `check`: sintaxis JS, tipos/build React, la misma suite y bundle Wrangler **dry-run**, sin publicar.
- `test:browser`: recorrido completo de UI en Firefox → React → Worker/D1 temporal; layout, temas, accesibilidad, cuentas, foco/scroll y reintentos. También disponible como `npm --prefix frontend run test:browser`.
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

## 7. Trabajo previsto y siguiente paso

| Bloque | Estado |
| --- | --- |
| Promoción JavaScript + Workers/D1 | Completada en local: estructura, comandos, suites, medición, ambos recorridos Firefox y arranque/reinicio verificados. Revisión en la sesión principal; perfil independiente no disponible. |
| Referencia Python | Secundaria en `experiments/python-sqlite/`; 102 pruebas pasan, sin modificación de reglas ni de la SQLite existente. |
| Frontend oficial | React con presentación 8-bit y barra lateral ampliada en escritorio. 152 pruebas, tipos/build y recorrido Firefox contra Worker/D1 pasan; se conservan las columnas y la navegación móvil. |
| Datos entre implementaciones | Separados. La promoción de código no migra ni sincroniza cuentas/historial. Una transferencia requeriría procedimiento y petición específica. |
| MCP de Activity Hub | Pendiente de concretar autenticación e implementar/probar el conector; el MCP de Cloudflare para Codex ya está instalado y autenticado. |
| Alojamiento y copias | Worker y D1 publicados y comprobados por HTTPS/Firefox, base entregada sin datos de usuario. Límites/CPU/coste bajo carga, copia externa y recuperación pendientes. |
| Git | Repositorio local: `main` conserva la publicación `v0.1.0`; `feature/information-agent` preparada para la ampliación. Sin remoto Git ni despliegue automático. Datos, credenciales y artefactos de ejecución excluidos. |
| Dispositivos | Safari/iPhone físico pendientes. |
| Notificaciones y asistencia | MVP pendiente de definir; no iniciado. |

**Publicación completada, 2026-10-06.** La versión actual puede usarse en Cloudflare creando una cuenta nueva. Se conservan los datos locales y el diseño de las ampliaciones, todavía sin implementar. **Siguiente paso:** concretar el primer incremento de Información a partir de la sección siguiente y desarrollarlo en `feature/information-agent`; publicar cambios posteriores de forma explícita desde la versión estable.

## 8. Ampliación de información y aprendizaje — diseño conservado, 2026-10-06

Esta sección conserva las decisiones de la conversación para continuar el diseño y desarrollo en paralelo al uso de la versión actual. **No describe capacidades implementadas.** La petición inmediata es publicar el registro existente, guardar este contexto y preparar Git; no implementar toda la ampliación durante la publicación. Las reglas del registro manual siguen aplicándose: recibir correo, resumirlo o conversar con IA no crea frentes ni marca actividad por inferencia.

### Propósito y decisiones confirmadas

- Incorporar información empezando por **Proton Mail**, con una integración que permita interpretar fielmente conversaciones, fechas, cambios y contexto; no limitarse al correo nuevo o no leído.
- Conservar información que resulte útil durante meses mediante una **wiki temática mantenida por IA**, inspirada en la idea de LLM Wiki de Karpathy. La IA debe crear, actualizar, relacionar, fusionar, dividir y retirar páginas de forma autónoma, con coherencia e historial; el usuario ha descartado tener que aprobar esas reorganizaciones rutinarias.
- Utilizar **Pi mediante su SDK** para el agente integrado. `pidev` es el lanzador que selecciona el perfil de ingeniería; la integración de producto tendrá instrucciones y herramientas específicas. El usuario ya dispone de una integración de referencia en `/Users/juanchoprego/nomeborres/modelos_mentales`.
- La aplicación, el agente y los trabajos programados deben poder funcionar **alojados y accesibles desde la web, con el Mac apagado**. Un proceso que dependa del ordenador personal no cumple el objetivo.
- Incorporar documentación adicional que el usuario quiera mantener: por ejemplo, información burocrática, guías docentes y reglas de evaluación que no estén en el correo. El formato y los conectores concretos aún deben cerrarse.
- Ofrecer consulta conversacional y visibilidad global mediante resúmenes ejecutivos relevantes para el día y la semana siguiente. Conservar los diarios/resúmenes y sus referencias. El registro diario actual contiene checks: todavía no existe un diario narrativo.

### Organización y fidelidad de la información

Propuesta de base discutida: separar **fuentes originales**, información conservada con procedencia y **páginas temáticas derivadas**. Guardar información útil no obliga a crear inmediatamente una página propia. Una fuente puede apoyar varias temáticas sin generar copias independientes de la evidencia.

Las fechas deben distinguir al menos cuándo se comunicó o incorporó algo y cuándo ocurre o resulta vigente lo descrito. Conservar el historial de ampliaciones, cancelaciones y correcciones. Una fuente antigua incorporada tarde no debe restablecer un plazo sustituido. Fechas relativas o ambiguas, conflictos entre fuentes y extracciones incompletas deben quedar identificados. Mantener la zona de referencia del producto, `Europe/Madrid`, sin perder la zona original cuando sea relevante.

La organización propuesta utiliza preguntas y alcance de cada página: actualizar una existente si ya cubre el asunto; crear una cuando aporte una consulta independiente; fusionar duplicidades; dividir cuestiones que puedan mantenerse por separado; crear una página general con enlaces cuando los temas relacionados conserven valor propio. El número de correos o la longitud de una página no bastan por sí solos para decidir. Estos criterios necesitan ejemplos y evaluación antes de implementarse.

Reorganizar debe conservar las fuentes, revisiones, notas y referencias. Tras una fusión, mantener enlaces a su destino; tras una división, conservar una entrada que permita encontrar los nuevos destinos o la sección correspondiente. Una retirada por obsolescencia conserva historia; el borrado definitivo es una operación diferente, cuya política queda abierta. Distinguir fecha de revisión de caducidad comprobada: no haber consultado algo no demuestra que deba eliminarse.

### Agente autónomo, mantenimiento y consultas

El usuario pide un agente consistente y proactivo, con auditorías periódicas de saneamiento además de reaccionar a cada entrada. Propuesta: trabajos separados de incorporación, mantenimiento y atención al usuario, cada uno con contexto acotado y herramientas de dominio. La planificación, pendientes, reintentos y resultados deben persistir y sobrevivir a cierres del navegador y reinicios del servicio. No depender de que el modelo recuerde hacer una auditoría en una conversación larga.

Combinar cambios acumulados y paso del tiempo. Se discutió como **ejemplo pendiente de validar**, no como requisito aprobado, revisar tras cada ingesta, sanear después de 20 incorporaciones relevantes o un día y hacer una revisión más amplia semanal. Contar cambios de fuentes, no mensajes internos/reintentos; atender también información que necesite revisión aunque no llegue nuevo correo. Acotar trabajo y evitar bucles de reorganización; registrar qué se revisó, qué se cambió y qué quedó pendiente.

La aplicación debe validar versiones, aislamiento por cuenta, referencias y publicación completa de cada conjunto de cambios. Las comprobaciones estructurales no demuestran la fidelidad de una síntesis: el agente necesita contrastar con las fuentes y mostrar las contradicciones no resueltas. El contenido de correos/documentos es información, no instrucciones para modificar sus permisos o comportamiento.

Vistas propuestas: **Hoy**, con cambios y próximas fechas; **Chat**, con respuestas contrastables y continuación desde un resumen; **Biblioteca**, con páginas, vigencia, fuentes e historial. Los resúmenes semanales reúnen evolución, cuestiones abiertas y próximos acontecimientos, consultando información vigente y fuentes, además de diarios anteriores. Las versiones históricas deben seguir siendo comprensibles tras cambios de estructura o información tardía. La relevancia, periodicidad, formato de diarios y tratamiento de actualizaciones todavía necesitan concretarse.

### Caso de uso para concretar el siguiente incremento

Centralizar información de una asignatura a partir de correo, guía docente y normativa de evaluación. Identificar curso académico, asignatura, grupo/convocatoria cuando proceda, porcentajes, mínimos, fechas y excepciones con referencias a sus fuentes. Un correo que amplía una entrega actualiza ese plazo conservando el anterior; una guía de otro curso no se mezcla por coincidencia de título. Ante «¿Qué necesito para aprobar y qué tengo pendiente esta semana?», distinguir reglas documentadas, fechas vigentes e información que falta. La publicación de un documento o una actividad prevista no prueba que el usuario haya realizado esa actividad.

La ingesta debe poder conservar el original y su versión, localizar la evidencia por página/fragmento y reconocer cambios sin duplicar trabajo. Se propusieron PDF, texto, Markdown y enlaces; OCR, páginas autenticadas y seguimiento automático de cambios quedan por diseñar y validar.

### Modelos mentales: módulo separado y consulta en un solo sentido

**Decisión explícita del usuario:** los modelos mentales no se almacenan en la misma wiki. Mantienen su biblioteca, conversaciones, narrativa personal y seguimiento propios. La integración completa del acompañamiento en Activity Hub sigue siendo una posibilidad por concretar; no hay autorización para migrar o modificar la biblioteca existente como parte de esta publicación.

- **Desde Información:** poder consultar modelos mentales cuando ayuden a responder. La propuesta es un acceso de lectura, diferenciando evidencia de las fuentes de marcos personales de interpretación; no copiar la narrativa a la wiki ni modificarla mediante su mantenimiento.
- **Desde Modelos mentales:** consultar únicamente ese espacio y el material que el usuario aporte allí. No recuperar automáticamente correo, documentos de Información ni su wiki; tampoco arrastrarlos al cambiar de apartado mediante historial, caché o contexto de conversación.
- Evitar mezcla indirecta: una respuesta en Información que utilice un modelo mental no debe volver a la ingesta de la wiki como si fuera una fuente independiente de conocimiento general.
- Las auditorías de la wiki no reorganizan narrativas personales. Distinguir aportaciones del usuario, síntesis de IA y observaciones de aprendizaje. «Validado por mí» requiere ese acto del usuario; leer, guardar o recibir una explicación no demuestra comprensión.

La referencia existente usa el SDK de Pi, biblioteca Markdown con revisiones y tokens de concurrencia, y observaciones cualitativas separadas con citas del usuario. Su guardado depende del editor interactivo de Pi y necesita adaptación para una web; las pruebas actuales no acreditan un servicio alojado ni eficacia educativa.

### Viabilidad, referencias y decisiones abiertas

- D1 es la persistencia actual y una opción razonable para textos, relaciones, versiones y trabajos; los documentos voluminosos necesitan un almacenamiento adecuado. El SDK Pi instalado (`@earendil-works/pi-coding-agent`, 1.0.0) ofrece sesiones, herramientas propias, eventos y ejecución desde Node. Propuesta por validar: web/API con D1 y un servicio Node/Pi alojado que ejecute trabajos duraderos.
- Proton Mail Bridge ofrece IMAP local, requiere un plan de pago que incluya Mail y dispone de Linux/CLI. Hace falta validar su operación persistente en servidor, autenticación y recuperación tras reinicios. El correo universitario puede requerir otro conector según proveedor; no presuponer acceso al campus o documentos protegidos por recibir sus enlaces.
- Elegir alojamiento del agente, conexión/proveedor de inferencia, costes y límites, tratamiento de fuentes privadas, formatos de ingesta, política de conservación/borrado y recuperación. La conexión de suscripción del proyecto de aprendizaje no acredita automáticamente el despliegue remoto o multiusuario.
- Antes de desarrollar: concretar herramientas y reglas de escritura del agente, criterios de relevancia y reorganización, auditorías y ejemplos verificables; usar el caso de una asignatura para comprobar contradicciones, años distintos, duplicados, fallos/reintentos y separación de modelos mentales.

Referencias consultadas: [LLM Wiki de Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [Proton Bridge](https://proton.me/mail/bridge), [Bridge en Linux](https://proton.me/support/bridge-for-linux), [CLI de Bridge](https://proton.me/support/bridge-cli-guide), [SQL y FTS5 de D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [límites D1](https://developers.cloudflare.com/d1/platform/limits/). Código local de referencia: `modelos_mentales/pi/profile.mjs`, `pi/tools.mjs`, `pi/library.mjs` y sus `docs/APP.md`/`STATUS.md`, en el proyecto externo indicado arriba.
