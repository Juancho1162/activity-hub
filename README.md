# Activity Hub


**Herramientas personales para asistir, monitorizar y apoyar mi actividad profesional y formativa.**

Activity Hub agrupa herramientas con un propósito común, no una única aplicación en la que todo tenga que estar relacionado. Por ahora se distinguen dos módulos: **notificaciones y asistencia** y **registro y seguimiento de actividad**.

**Prioridad actual: empezar por registro y seguimiento**, con interfaz web e integración con pi mediante MCP. El módulo de notificaciones se definirá más adelante; no bloquea el trabajo sobre registro.

**Versión publicada:** registro diario, dashboard y cuentas independientes con código fijo, sin recuperación. Cifrado en el navegador, CAPTCHA, límites de uso y publicación verificable incorporados a `main` y desplegados el 2026-10-06. La prueba remota ha motivado un refuerzo del uso único del CAPTCHA, en verificación antes de publicar. Véanse [estado y verificación](#6-estado-real-y-verificación) y [trabajo pendiente](#7-trabajo-previsto-y-siguiente-paso).

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

- **Alta abierta integrada en la app:** sin invitaciones, Google, correo ni nombre de usuario; con CAPTCHA y máximo inicial de 100 cuentas. Sustituye el diseño anterior de propietario único y alta por terminal.
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

Este es el contrato de la versión de seguridad publicada el 2026-10-06. La etiqueta histórica `v0.1.0` conserva el protocolo anterior; el estado vigente de verificación figura en la sección 7.

La UI conserva registro diario en columnas, dashboard con orden global antes de paginar, nombres completos, calendarios plegables, foco/scroll y confirmación del guardado. El tema claro/oscuro se conserva entre pestañas; cambiarlo no descarta formularios ni solicitudes pendientes.

### Privacidad y acceso

- El navegador genera el código fijo de 32 símbolos aleatorios —160 bits— y lo muestra para guardarlo. Se aceptan mayúsculas/minúsculas ASCII, espacios y guiones. No se envía el código al servidor: se deriva una credencial de autenticación; D1 conserva otra huella de esa credencial.
- Se deriva por separado una clave AES-GCM de 256 bits mediante HKDF. Nombres, enlaces, estados, fechas de actividad y respuestas originales de reintentos se cifran **antes de salir del navegador**. Cada guardado usa un IV aleatorio nuevo y autentica también la cuenta y la versión.
- La clave permanece solo en memoria de la pestaña. Recargar, cerrar o abrir otra pestaña requiere introducir de nuevo el código, aunque la cookie de sesión siga vigente. Se puede cerrar esa sesión sin descifrar ni conocer el código; esto no recupera su contenido. No existe recuperación administrativa ni clave maestra del servidor.
- D1 conserva contenido cifrado y metadatos operativos legibles: identificadores, verificadores de autenticación, sesiones, tamaños, versión y tiempos de sincronización. La garantía protege el contenido frente a consultar D1 o copias posteriores a la migración; no frente a un administrador que modifique deliberadamente el JavaScript servido, un dispositivo comprometido o las copias antiguas en texto legible.
- Las cuentas anteriores conservan su código. Al entrar con el nuevo cliente, se actualiza su verificador y el navegador cifra el contenido y los reintentos anteriores. El servidor borra el original solo en la transacción que confirma el cifrado; una revisión del contenido detecta escrituras antiguas concurrentes. Hasta completar esa migración, una cuenta anterior puede conservar datos legibles en D1. Las copias históricas no se cifran retroactivamente.
- Sesiones opacas de 256 bits, caducidad absoluta de 30 días y máximo de 20 sesiones por cuenta. Cookie HttpOnly/SameSite=Strict/Path=/ y Secure con prefijo `__Host-` en HTTPS. Comprobación al volver a la pestaña y cada minuto. Logout revoca la sesión capturada sin borrar una cookie posterior de otra cuenta.
- Cuenta esperada en `X-Activity-Account`; escrituras con Origin exacto y `X-CSRF-Token`. Se revalida sesión/cuenta dentro del batch de D1. `/api` y `/auth`, incluidos sus prefijos exactos, pasan por el Worker y llevan `no-store`.
- Los enlaces son referencias: no se visitan desde el servidor. No registrar códigos, cookies, tokens, cuerpos privados, SQL ni parámetros. Se añaden CSP y cabeceras contra incrustación, detección de tipos y envío de referentes.

### Protección de capacidad

- Alta con Turnstile validado en el servidor: éxito explícito, acción `signup` y hostname de producción exacto. Un error de verificación impide el alta. Solo el entorno HTTP de loopback admite pruebas sin CAPTCHA.
- Máximo **100 cuentas**, aplicado dentro de la transacción de alta para que peticiones concurrentes no lo superen.
- Un único documento cifrado por cuenta, con máximo **512 KiB de cifrado binario** —hasta 699 052 caracteres en base64—. Se limita el cuerpo real recibido incluso sin `Content-Length`. El total de documentos activos queda por debajo de 67 MiB para 100 cuentas; índices, metadatos, espacio interno de SQLite y copias añaden almacenamiento.
- Límites iniciales por 60 segundos: **600 solicitudes dinámicas**, **120 por IP**, **10 por IP y ruta de alta/login** y **60 por cuenta autenticada**. Los primeros límites se comprueban antes de consultar D1. Sin cookie válida en formato, no se consulta D1. La configuración HTTPS incompleta falla cerrada.
- Estos limitadores de Workers son locales a cada ubicación de Cloudflare y eventualmente consistentes: reducen abuso, pero **no constituyen un tope global de facturación ni garantizan no agotar la cuota diaria de D1**. Las lecturas autorizadas también consumen operaciones de contexto transaccional. Un ataque distribuido puede agotar cuota o degradar disponibilidad; no se ha realizado una prueba de carga alojada.
- Interruptores de operación: `API_ENABLED`, `REGISTRATION_ENABLED` y `WRITES_ENABLED`. Permiten cerrar API, altas o escrituras sin eliminar datos. El cliente limita además a 200 frentes y 5000 respuestas de reintentos conservadas; el límite de bytes del servidor es el control que no puede eludir un cliente modificado.

### Contrato de red y comportamiento del registro

| Método y ruta | Operación |
| --- | --- |
| `GET /auth/config` | Sitekey pública, disponibilidad del alta e indicador de loopback; nunca devuelve secretos. |
| `POST /auth/signup` | `{credential, turnstile_token}` y Origin exacto; 201 `{account_id}` sin cookie. El código se genera y muestra localmente. 403 por CAPTCHA/capacidad/cierre, 409 si existe sesión válida, 429 por límite. |
| `GET /auth/session` | `authenticated`, `account_id`, `csrf_token`, `expires_at`; 401 sin sesión, 503 sin esquema/servicio. Una sesión válida no basta para descifrar. |
| `POST /auth/login` | `{credential}` y Origin exacto; emite cookie de sesión. No recibe el código ni la clave de cifrado. |
| `POST /auth/logout` | Cookie, cuenta esperada, Origin y CSRF; 204 sin `Set-Cookie`. |
| `GET /api/vault` | Documento cifrado y versión; día actual de Madrid y reloj del servidor. Solo para migrar devuelve el contenido anterior de esa misma cuenta y su revisión. |
| `PUT /api/vault` | `{version, day, iv, ciphertext, legacy_revision}`; versión esperada, día y revisión inicial comprobados dentro del batch. 409 si cambiaron, 413 por tamaño. Guarda cifrado y retira el original de forma atómica. |

Las rutas antiguas `/api/fronts`, `/api/history` y `/api/dashboard` devuelven 410 tras autenticar. El cliente calcula listado, búsqueda, historial y dashboard después de descifrar. El servidor valida acceso, formato/tamaño del sobre, versión y contexto temporal; al no leer el contenido, no puede validar nombres, estados ni checks dentro del cifrado.

Se conservan las reglas funcionales: nombre de 1–200 caracteres sin NUL; enlace HTTP(S) hasta 2048; estados `open`, `standby`, `archived`; un check por frente/día, sin fechas futuras; intervalos inclusivos de hasta 366 días. Búsqueda literal con comparación ASCII sin distinguir mayúsculas; orden por creación/UUID y, en dashboard, por actividad antes de paginar. No hay borrado permanente de frentes.

**Concurrencia y reintentos:** el navegador lee, modifica y guarda con versión esperada. Ante un conflicto confirmado vuelve a leer y combina la operación, hasta cinco intentos; dos pestañas no sobrescriben a ciegas sus snapshots. Ante una pérdida de respuesta no se reintenta automáticamente: la UI conserva y bloquea la solicitud pendiente hasta confirmarla explícitamente. Las creaciones y checks guardan dentro del cifrado su clave, contenido y respuesta originales; repetirlos devuelve esa respuesta sin deshacer ediciones o desmarcados posteriores. Reutilizar una clave para otra operación devuelve conflicto. La fecha relativa queda fijada cuando se confirma por primera vez y se conserva en su replay.

La identidad pendiente vive solo en memoria de la pestaña; se avisa antes de recargar/cerrar, pero no hay recuperación tras cerrarla. Un cambio de sesión oculta datos y editor sin trasladar la operación a otra cuenta. Volver a entrar en la original permite continuar con la misma identidad. Cerrar sesión queda bloqueado mientras haya una escritura pendiente; un logout incierto mantiene los datos ocultos hasta confirmarlo. Las respuestas originales no caducan automáticamente; al llegar al límite se conserva lo existente y se rechazan nuevos cambios.

`/health` comprueba el esquema. `/docs`, `/redoc` y `/openapi.json` no forman parte del Worker y devuelven JSON 404. Las pruebas de equivalencia con Python corresponden al protocolo anterior, conservado en un handler de caracterización que no es el punto de entrada desplegado.

El conector futuro pi/MCP necesita una credencial y un diseño explícito de acceso al contenido cifrado. El código web no se reutiliza automáticamente; esta ampliación no implementa MCP, LLM ni almacenamiento de claves de proveedores.

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

- `test`: suites del backend —incluido diferencial con Python— y del frontend. Los resultados vigentes del incremento están en la sección 7.
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
| Frontend oficial | React con presentación 8-bit, cifrado local y barra lateral ampliada en escritorio. 162 pruebas, tipos/build y ambos recorridos Firefox contra Worker/D1 pasan. |
| Datos entre implementaciones | Separados. La promoción de código no migra ni sincroniza cuentas/historial. Una transferencia requeriría procedimiento y petición específica. |
| MCP de Activity Hub | Pendiente de concretar autenticación e implementar/probar el conector; el MCP de Cloudflare para Codex ya está instalado y autenticado. |
| Alojamiento y copias | Worker y D1 publicados con límites y almacenamiento cifrado. Límites/CPU/coste bajo carga, copia externa y recuperación pendientes. La migración de contenido anterior requiere que su titular entre con el nuevo cliente. |
| Git | `main` incorpora seguridad en `dce24c8`; `feature/security-hardening` conserva ese trabajo. Etiqueta histórica `v0.1.0`. Al retomar `feature/information-agent`, actualizarla desde `main`. Sin remoto Git ni despliegue automático; datos, credenciales y artefactos excluidos. |
| Dispositivos | Safari/iPhone físico pendientes. |
| Notificaciones y asistencia | MVP pendiente de definir; no iniciado. |

**Seguridad publicada, 2026-10-06.** Commit `dce24c8`, Worker `activity-hub`, versión `3b5dd80b-ebe1-47ff-a180-8a5d29ddf924`. Migración `0002_private_storage.sql` aplicada después de registrar versiones y punto de recuperación. Pasan las comprobaciones remotas de web/CSP, esquema, rechazo sin sesión/no-store y alta sin CAPTCHA. **Trabajo actual:** verificar y publicar el refuerzo de uso único de Turnstile en `fix/turnstile-single-use`. Información/LLM sigue aplazado.

### Seguridad y publicación — incremento solicitado, 2026-10-06

Decisiones confirmadas: registro abierto con CAPTCHA y máximo inicial de **100 cuentas**; contenido cifrado en el navegador, sin contenido legible al consultar D1 o sus copias. La garantía elegida no incluye a un administrador que modifique deliberadamente el cliente web para capturar claves. Identificadores, tamaños, versiones, tiempos de sincronización y metadatos de autenticación siguen siendo visibles. El cifrado de Cloudflare en reposo no sustituye este cifrado de aplicación.

Implementación verificada, revisada y publicada; queda la validación real de Turnstile:

- [x] Frenar peticiones antes de D1, limitar cuerpos y altas de forma atómica, acotar almacenamiento y sesiones por cuenta y añadir interruptores operativos.
- [x] Cifrar nombres, enlaces y actividad en el navegador; separar la credencial de autenticación de la clave de cifrado. Mantener versiones y reintentos seguros entre pestañas. No almacenar el código ni la clave en persistencia del navegador; una nueva carga necesita desbloqueo con el código.
- [x] Conservar las cuentas existentes. Migrar contenido antiguo desde el navegador sin borrar el original antes de confirmar la escritura cifrada. Las copias históricas anteriores no se cifran retroactivamente.
- [ ] Integrar Turnstile y comprobar token válido, caducado/reutilizado y acción/hostname incorrectos. Widget y secreto configurados con el OAuth existente, sin API token adicional. Alta real en Brave comprobada. El replay con otra credencial devuelve 403; la repetición exacta ha devuelto 409 por credencial duplicada después de superar la validación externa. Confirmado con cuerpos iguales y peticiones de red distintas, sin caché ni service worker. La migración aditiva `0003_signup_challenges.sql` y la rama de corrección guardan solo una huella SHA-256 del desafío con unicidad atómica; falta revisar/publicar y repetir la prueba remota.
- [x] Verificar acceso entre cuentas, conflictos concurrentes, respuestas perdidas, manipulación del cifrado y límites; revisión independiente y recorrido real en navegador.
- [x] Estandarizar cambio en rama, pruebas/regresiones, preparación del artefacto, migraciones compatibles, despliegue y comprobación posterior. Git y Cloudflare son pasos distintos; no existe todavía remoto Git.

**Evidencia del incremento:** `npm run release:prepare` pasa con **34 pruebas backend y 162 frontend**, sintaxis/tipos/build, dry-run de producción y ambos recorridos Firefox del protocolo cifrado. Incluye siete anchos, dos temas, 69 pares de contraste, cierre de sesión sin desbloquear, dos cuentas, migración, respuestas perdidas y rechazo de contenido manipulado. Las suites históricas se mantienen como caracterización; las nuevas cubren el protocolo cifrado. Verificado también el rechazo de publicación fuera de `main` y el dry-run del paquete congelado con `--no-bundle`. No se han añadido dependencias al proyecto.

La primera revisión independiente encontró cuatro defectos: límite por cuenta omitido en la consulta de sesión, CAPTCHA demasiado ancho para móvil, orden incorrecto de timestamps con distinta precisión y ausencia de logout antes de desbloquear. Se reprodujeron mediante pruebas fallidas y se corrigieron; las regresiones y el conjunto completo pasan. Segunda revisión independiente: **PASS**, sin hallazgos accionables pendientes en los arreglos ni cambios cercanos; revisión estática, pruebas ejecutadas por la sesión principal. La caché local de Wrangler también se excluye de Git y de la huella del código.

**Verificación remota adicional:** Brave a ancho normal ha completado alta real, creación/check cifrados, recarga, desbloqueo y logout sin clave. En las cuentas ficticias inspeccionadas, D1 contiene el bloque cifrado y cero frentes/replays en las tablas antiguas. La ventana inicial desplazada correspondía a una emulación de 320 px dentro de Brave. Firefox automatizado no completó el CAPTCHA real. Las dos regresiones del refuerzo fallaron antes del arreglo (409 en replay exacto y cuatro altas concurrentes con un desafío aceptado por el verificador simulado) y pasan después. Las cinco cuentas ficticias de estos diagnósticos se retiraron por ID y fecha; recuentos posteriores cero.

**Refuerzo preparado:** pasan **36 pruebas backend y 162 frontend**, ambos recorridos Firefox, sintaxis/tipos/build y dry-run de producción. Nueva revisión independiente: **PASS**, sin hallazgos accionables; estática, con ejecución por la sesión principal. El artefacto está congelado y la migración es compatible con `dce24c8`; volver a ese Worker retiraría el refuerzo de uso único.

**Siguiente paso:** migración/despliegue del artefacto revisado y comprobación remota del uso único. Retirar exclusivamente las cuentas ficticias generadas. El flujo de la [guía de operación](backend/README.md) ya se ha ejecutado para publicar: código revisado en `main`, artefacto congelado, migración remota y despliegue con comprobación posterior.

Premortem: una ráfaga consume D1 antes del rechazo (limitador previo y prueba de cero consultas); altas concurrentes superan 100 (control dentro del batch); dos pestañas pierden cambios (versionado y conflictos); una migración/copia o replay conserva texto legible (inspección con datos sintéticos y traslado atómico); una publicación omite límites/CAPTCHA o no coincide con el código probado (validación de configuración y artefacto antes de publicar).

## 8. Ampliación de información y aprendizaje — diseño conservado, 2026-10-06

Esta sección conserva las decisiones de la conversación para continuar el diseño y desarrollo en paralelo al uso de la versión actual. **No describe capacidades implementadas.** La petición inmediata es publicar el registro existente, guardar este contexto y preparar Git; no implementar toda la ampliación durante la publicación. Las reglas del registro manual siguen aplicándose: recibir correo, resumirlo o conversar con IA no crea frentes ni marca actividad por inferencia.

### Propósito y decisiones confirmadas

- Incorporar información empezando por **Proton Mail**, con una integración que permita interpretar fielmente conversaciones, fechas, cambios y contexto; no limitarse al correo nuevo o no leído.
- Conservar información que resulte útil durante meses mediante una **wiki temática mantenida por IA**, inspirada en la idea de LLM Wiki de Karpathy. La IA debe crear, actualizar, relacionar, fusionar, dividir y retirar páginas de forma autónoma, con coherencia e historial; el usuario ha descartado tener que aprobar esas reorganizaciones rutinarias.
- Utilizar **Pi mediante su SDK** para el agente integrado. `pidev` es el lanzador que selecciona el perfil de ingeniería; la integración de producto tendrá instrucciones y herramientas específicas. El usuario ya dispone de una integración de referencia en `/Users/juanchoprego/nomeborres/modelos_mentales`.
- La aplicación, el agente y los trabajos programados deben poder funcionar **alojados y accesibles desde la web, con el Mac apagado**. Un proceso que dependa del ordenador personal no cumple el objetivo.
- Incorporar documentación adicional que el usuario quiera mantener: por ejemplo, información burocrática, guías docentes y reglas de evaluación que no estén en el correo. El formato y los conectores concretos aún deben cerrarse.
- Ofrecer consulta conversacional y visibilidad global mediante resúmenes ejecutivos relevantes para el día y la semana siguiente. Conservar los diarios/resúmenes y sus referencias. El registro diario actual contiene checks: todavía no existe un diario narrativo.
- **Prioridad revisada:** la ampliación LLM queda aplazada hasta completar seguridad. Cada usuario deberá aportar su propio acceso/cupo del proveedor; nunca se usará por defecto la credencial del administrador. No se implementa aún almacenamiento de claves de proveedores. La compatibilidad de suscripciones, API y cuotas deberá comprobarse con cada proveedor.
- El requisito de cifrado en el navegador condiciona al agente alojado autónomo: no se podrá darle acceso al contenido con el navegador cerrado sin diseñar una delegación explícita de claves/procesamiento y explicar sus garantías. No guardar una clave maestra del servidor en D1 como supuesto aislamiento frente al administrador.

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
