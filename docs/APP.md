# Producto y reglas de Activity Hub

Activity Hub reúne herramientas para registrar actividad y, más adelante, consultar información y recibir asistencia. Esta es la especificación del producto; el [estado actual](STATUS.md) y el [historial](../CHANGELOG.md) se mantienen por separado. La presentación y las instrucciones de uso están en el [README](../README.md).

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
- **Eliminar mueve el frente a una Papelera recuperable**, independiente de su estado. Sale del registro y del dashboard; restaurarlo conserva su identidad, estado anterior y todos sus checks. Sigue ocupando almacenamiento y contando para el límite de frentes hasta eliminarlo para siempre.
- **Desde la Papelera se puede eliminar para siempre**, tras una confirmación explícita que identifica el frente y advierte de la pérdida de todo su historial. Solo se permite si continúa en la Papelera. Se retiran el frente, sus checks y el contenido de sus reintentos; se conservan recibos mínimos sin nombres, enlaces ni fechas de actividad para impedir que solicitudes antiguas lo recreen. No hay recuperación desde la app ni purga automática; las copias históricas cifradas no se eliminan retroactivamente.
- Registro manual con **un check por frente y día**. Vacío significa «sin actividad registrada», no «no lo hice». Manual significa decidido explícitamente por el usuario, también cuando lo solicita a pi.
- La zona horaria del registro es **`Europe/Madrid`**, incluidos sus cambios de horario. Es la referencia común para los días y para interpretar «hoy» y «ayer» desde la web y pi/MCP, independientemente de la zona del servidor.
- Se pueden **marcar y desmarcar checks de días pasados** para completar olvidos o corregir errores, tanto desde la web como mediante una petición explícita a pi.
- Sin horas, intensidad, puntuaciones de esfuerzo ni clasificación automática de abandono.
- Dashboard sencillo de frecuencia, último registro y huecos, basado en los checks que haya marcado.
- Los materiales de proyectos, cursos y demás permanecen en sus carpetas o webs. Este módulo no los replica.
- Acceso desde la interfaz web y desde **pi mediante MCP**, no limitado conceptualmente a dar de alta frentes: debe permitir consultar y gestionar las capacidades que se definan para el módulo, con las mismas reglas e historial. Los cambios requieren una acción o petición explícita; comentar una actividad, recibir un correo o mantener una sesión con IA no crea frentes ni marca checks por sí solo.

### MVP funcional aprobado

**Vista de registro diario:**

- Tarjetas compactas de frentes abiertos, con un check por frente: varias columnas según el espacio disponible en ordenador y una columna en móvil. Con pocos resultados conservan un ancho contenido; las tarjetas de una misma fila tienen igual altura y muestran los nombres completos. El orden de lectura va de izquierda a derecha y después hacia abajo. **Marcar y desmarcar se dibujan en el clic**, sin esperar al servidor ni usar animaciones, transiciones o un indicador giratorio. El guardado cifrado continúa en segundo plano; la vista previa está separada de los datos confirmados. Ante un error vuelve al último estado confirmado y lo explica; una respuesta perdida conserva su identidad para reintento explícito. Se mantienen posición, foco y DOM; sin avisos transitorios de envío o éxito, ni atenuación de los demás checks y botones.
- Hoy seleccionado por defecto, con posibilidad de elegir una fecha pasada.
- Añadir o editar un frente con nombre y enlace opcional. La referencia no aumenta el tamaño de su tarjeta: aparece como acción compacta independiente. Tarjetas del registro diario densas, con un área de pulsación del check de al menos 44 px.
- Acceso a los frentes en standby y archivados para consultarlos y gestionar su estado.
- «Eliminar frente» desde su editor; «Papelera» en el menú para buscar, restaurar o eliminar para siempre frentes de cualquier estado. Los frentes en la Papelera no se editan ni se marcan hasta restaurarlos.

**Vista de dashboard:**

- Resumen por frente con el porcentaje de días registrados respecto a **todos los días del período seleccionado, ambos extremos incluidos**. Ejemplo: 4 días marcados de 10 seleccionados → 40 %. No es una puntuación ni un objetivo.
- Último día registrado global y número de días registrados frente al total del período.
- Detalle de todos los días en un desplegable por frente, cerrado inicialmente. Al abrirlo se ven el intervalo con año y la fecha de cada casilla, con o sin actividad registrada; los huecos no se interpretan como abandono.
- Dashboard ordenado de mayor a menor porcentaje del período, **antes de paginar** y dentro de los filtros/cuenta actuales. Empates estables por creación/UUID. El registro diario conserva su orden anterior.
- Tarjetas de la misma fila con altura uniforme y acciones del calendario alineadas. El nombre más largo determina el espacio necesario, sin recortes ni una altura fija. Abrir o cerrar un calendario abre o cierra todos los de su fila visible, según el ancho actual; las demás filas conservan su despliegue. En móvil con una sola columna afecta únicamente al frente elegido. Cambiar de período vuelve a plegarlos; el despliegue no consulta ni escribe actividad.

**Acceso equivalente desde pi/MCP:** consultar frentes e historial, añadir o editar un frente, cambiar su estado, marcar o desmarcar un día, mover a Papelera, restaurar o borrar para siempre. Las dos interfaces operan sobre los mismos datos y reglas, siempre con peticiones explícitas para los cambios; el conector sigue pendiente.

Quedan fuera de este primer módulo las notificaciones, correo, Teams, el dashboard agregador y el agente coordinador. No se convierte el registro en un gestor de tareas ni en un detector automático de actividad.

**Idiomas de la web:** castellano e inglés, con selector tanto en acceso como dentro de la cuenta. Primera selección según los idiomas del navegador, con castellano como fallback; la elección explícita se recuerda en este navegador y se sincroniza entre sus pestañas. Textos, estados, avisos, etiquetas accesibles, fechas y porcentajes siguen el idioma. Nombres y enlaces escritos por el usuario se conservan; la fecha del registro sigue referida a `Europe/Madrid`. Cambiar idioma conserva sesión, autocompletado, borradores y solicitudes pendientes sin recargar ni consultar/escribir actividad.

**Temas:** se conserva la paleta clara cálida. El oscuro comparte su familia de colores y los de la plantita: fondo carbón oliva, superficies diferenciadas, texto crema, verde hoja y acentos terracota. El fondo es liso y las sombras cortas mantienen la geometría pixelada. Las etiquetas secundarias y los errores mantienen contraste en texto pequeño. Ambos conservan la presentación 8-bit y controles accesibles; el selector nativo de idioma comparte el marco pixelado de los botones.

### Acceso privado acordado

- **Alta abierta integrada en la app:** sin invitaciones, Google, correo ni nombre de usuario; con CAPTCHA y máximo inicial de 100 cuentas. Sustituye el diseño anterior de propietario único y alta por terminal.
- **Una cuenta, un código fijo.** El código secreto largo y aleatorio se genera únicamente al crear la cuenta y se muestra para guardarlo privadamente. No se cambia, regenera ni sustituye. Funciona como una contraseña, no como un identificador público.
- **Sin recuperación de ningún tipo:** ni administrativa, ni desde una sesión abierta, ni mediante un segundo código. Si se pierde, no existe un procedimiento para recuperarlo o emitir otro para esa cuenta. Una sesión existente no habilita esa posibilidad.
- **Crear cuenta / iniciar sesión / cerrar sesión**, dentro de la web. Entrar exige el código de una cuenta existente; un código incorrecto no crea una cuenta. Cerrar sesión no borra la cuenta ni sus datos.
- Una persona puede tener varias cuentas. Cada alta crea un registro vacío e independiente; frentes, checks, historial y reintentos quedan aislados por cuenta. El servidor conserva una huella verificable del código, no el original; no se incluye en URLs, logs ni almacenamiento persistente de la aplicación. El titular puede guardarlo en su gestor de contraseñas.
- **Correo opcional: solo una posibilidad futura, fuera del alcance actual.** No se añade campo, vinculación ni recuperación por correo ahora; su eventual comportamiento no está definido.
- Se mantienen HTTPS al alojarlo, sesiones seguras, CSRF y límites de entrada y de creación de cuentas. No se generan ni comparten credenciales reales en la documentación o el chat. El flujo multiusuario está implementado y verificado localmente; la evidencia y los límites están en [STATUS.md](STATUS.md).
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

**Decisión del 2026-10-05:** JavaScript moderno + Cloudflare Workers + D1 pasa a ser la implementación principal, por petición expresa del usuario. React conserva su código, aspecto y comportamiento. El backend anterior de Python se conserva como [referencia secundaria](../experiments/python-sqlite/README.md).

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

La [guía del backend principal](../backend/README.md) conserva detalles de transacciones, pruebas, medición y publicación en Cloudflare, autorizada el 2026-10-06 con una base remota vacía. La [investigación de Render](../experiments/python-sqlite/RENDER.md) queda asociada a la alternativa Python; sus precios y recetas son históricos. La capacidad/coste bajo carga y la recuperación de copias siguen sin validarse.

Los laboratorios [cyberpunk](../experiments/cyberpunk-ui/README.md), [artístico](../experiments/art-ui/README.md) y [8-bit](../experiments/8bit-twist/README.md) se conservan como referencias visuales. Solo la presentación 8-bit elegida se integró en React; los datos y controles de sus maquetas permanecen aislados. La identidad utiliza una [plantita humanoide 8-bit animada](../frontend/public/plant-logo.svg), de 96 px en acceso y 64 px en navegación, siempre junto al nombre «Activity Hub». Puede pausarse por clic/teclado usando la [misma figura estática](../frontend/public/plant-logo-static.svg), y respeta movimiento reducido. El [favicon](../frontend/public/favicon.svg) simplifica la cara y las hojas para tamaños de pestaña; el [ordenador](../frontend/src/assets/pixel-desk.svg) se conserva como alternativa fuera de la interfaz.

## 5. Contratos y garantías

Este es el contrato vigente. La etiqueta histórica `v0.1.0` conserva el protocolo anterior; la publicación y verificación actuales están en [STATUS.md](STATUS.md).

La UI conserva registro diario en columnas, dashboard con orden global antes de paginar, nombres completos, calendarios plegables, foco/scroll y confirmación del guardado. El tema claro/oscuro se conserva entre pestañas; cambiarlo no descarta formularios ni solicitudes pendientes.

La pantalla de acceso prioriza **Entrar**, con un botón de ancho completo y mayor altura; **Crear cuenta** queda como acción secundaria compacta. En escritorio, la barra lateral sigue la altura disponible de la ventana, permanece visible al hacer scroll y conserva «Espacio privado» al pie, sin el antiguo máximo de 900 px.

La misma web adapta su navegación, fechas y controles a móvil. Registro, Dashboard y Papelera conservan etiquetas visibles, «Nuevo frente» muestra su nombre y los filtros se pueden desplegar sin borrar su selección. Los formularios estrechos apilan los campos y las acciones del editor; las pantallas bajas permiten desplazarse dentro del diálogo hasta Guardar. El diseño no oculta desbordamientos de toda la página para aparentar que encaja.

Al alternar Registro, Dashboard y Papelera, la vista anterior conserva sus datos, fechas, altura y posición mientras llega la nueva lectura, con sus controles bloqueados. La nueva vista entra con una transición de 180 ms; el menú conserva el foco y permite cambiar de destino durante la carga. La preferencia de reducir movimiento desactiva las animaciones.

### Privacidad y acceso

- El navegador genera el código fijo de 32 símbolos aleatorios —160 bits— y lo muestra para guardarlo. Se aceptan mayúsculas/minúsculas ASCII, espacios y guiones. No se envía el código al servidor: se deriva una credencial de autenticación; D1 conserva otra huella de esa credencial.
- Se deriva por separado una clave AES-GCM de 256 bits mediante HKDF. Nombres, enlaces, estados, fechas de actividad y respuestas originales de reintentos se cifran **antes de salir del navegador**. Cada guardado usa un IV aleatorio nuevo y autentica también la cuenta y la versión.
- La clave permanece solo en memoria de la pestaña. Recargar, cerrar o abrir otra pestaña requiere introducir de nuevo el código, aunque la cookie de sesión siga vigente. Se puede cerrar esa sesión sin descifrar ni conocer el código; esto no recupera su contenido. No existe recuperación administrativa ni clave maestra del servidor.
- El formulario de entrada admite autocompletado nativo: conserva el código al recuperar el foco o revalidar la misma cuenta, también al renovar el CSRF. Lee el campo al enviar y lo borra entonces o al detectar otra cuenta. La aplicación no lo persiste en localStorage, sessionStorage ni cookies.
- Tras una entrada explícita verificada y la activación de su cuenta, se ofrece el código original al **gestor de contraseñas del navegador**, mediante PasswordCredential si está disponible. El identificador es la cuenta real; no se introduce otro usuario, correo o procedimiento de recuperación. Se usan formularios nativos y una señal de finalización de la navegación después de retirar el formulario, según las [indicaciones de Chromium](https://new.chromium.org/developers/design-documents/create-amazing-password-forms/). El aviso y la aceptación dependen del navegador y de sus ajustes; un rechazo, falta de API o diálogo pendiente no impide entrar. El navegador puede guardar/sincronizar el código conforme a sus propias preferencias; la clave AES y D1 no cambian. No se pide al gestor recuperar credenciales ni iniciar sesión automáticamente.
- D1 conserva contenido cifrado y metadatos operativos legibles: identificadores, verificadores de autenticación, sesiones, tamaños, versión y tiempos de sincronización. La garantía protege el contenido frente a consultar D1 o copias posteriores a la migración; no frente a un administrador que modifique deliberadamente el JavaScript servido, un dispositivo comprometido o las copias antiguas en texto legible.
- Las cuentas anteriores conservan su código. Al entrar con el nuevo cliente, se actualiza su verificador y el navegador cifra el contenido y los reintentos anteriores. El servidor borra el original solo en la transacción que confirma el cifrado; una revisión del contenido detecta escrituras antiguas concurrentes. Hasta completar esa migración, una cuenta anterior puede conservar datos legibles en D1. Las copias históricas no se cifran retroactivamente.
- Sesiones opacas de 256 bits, caducidad absoluta de 30 días y máximo de 20 sesiones por cuenta. Cookie HttpOnly/SameSite=Strict/Path=/ y Secure con prefijo `__Host-` en HTTPS. Comprobación al volver a la pestaña y cada minuto. Logout revoca la sesión capturada sin borrar una cookie posterior de otra cuenta.
- Cuenta esperada en `X-Activity-Account`; escrituras con Origin exacto y `X-CSRF-Token`. Se revalida sesión/cuenta dentro del batch de D1. `/api` y `/auth`, incluidos sus prefijos exactos, pasan por el Worker y llevan `no-store`.
- Los enlaces son referencias: no se visitan desde el servidor. No registrar códigos, cookies, tokens, cuerpos privados, SQL ni parámetros. Se añaden CSP y cabeceras contra incrustación, detección de tipos y envío de referentes.

### Protección de capacidad

- Alta con Turnstile validado en el servidor: éxito explícito, acción `signup` y hostname de producción exacto. Un error de verificación impide el alta. D1 impide también reutilizar un desafío para registrar otra cuenta mediante una huella SHA-256 única, guardada en la misma transacción; nunca conserva el token original. Solo el entorno HTTP de loopback admite pruebas sin CAPTCHA.
- Máximo **100 cuentas**, aplicado dentro de la transacción de alta para que peticiones concurrentes no lo superen.
- Un único documento cifrado por cuenta, con máximo **512 KiB de cifrado binario** —hasta 699 052 caracteres en base64—. Se limita el cuerpo real recibido incluso sin `Content-Length`. El total de documentos activos queda por debajo de 67 MiB para 100 cuentas; índices, metadatos, espacio interno de SQLite y copias añaden almacenamiento.
- Límites iniciales por 60 segundos: **600 solicitudes dinámicas**, **120 por IP**, **10 por IP y ruta de alta/login** y **60 por cuenta autenticada**. Los primeros límites se comprueban antes de consultar D1. Sin cookie válida en formato, no se consulta D1. La configuración HTTPS incompleta falla cerrada.
- Estos limitadores de Workers son locales a cada ubicación de Cloudflare y eventualmente consistentes: reducen abuso, pero **no constituyen un tope global de facturación ni garantizan no agotar la cuota diaria de D1**. Las lecturas autorizadas también consumen operaciones de contexto transaccional. Un ataque distribuido puede agotar cuota o degradar disponibilidad; no se ha realizado una prueba de carga alojada.
- Interruptores de operación: `API_ENABLED`, `REGISTRATION_ENABLED` y `WRITES_ENABLED`. Permiten cerrar API, altas o escrituras sin eliminar datos. El cliente limita además a 200 frentes y 5000 respuestas originales de reintentos conservadas. Borrar para siempre libera espacio y sustituye las respuestas del frente por identificadores consumidos dentro de un recibo mínimo; estos recibos no impiden limpiar al alcanzar el límite de respuestas y siguen sujetos a los mismos 512 KiB. El límite de bytes del servidor es el control que no puede eludir un cliente modificado.

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

Se conservan las reglas funcionales: nombre de 1–200 caracteres sin NUL; enlace HTTP(S) hasta 2048; estados `open`, `standby`, `archived`; un check por frente/día, sin fechas futuras; intervalos inclusivos de hasta 366 días. Búsqueda literal con comparación ASCII sin distinguir mayúsculas; orden por creación/UUID y, en dashboard, por actividad antes de paginar. El borrado permanente exige que el frente siga en la Papelera en el documento actual.

**Concurrencia y reintentos:** el navegador lee, modifica y guarda con versión esperada. Un check de fecha absoluta puede utilizar el documento confirmado que mantiene en memoria para esa cuenta y cliente: la escritura revalida versión, día de sincronización y acceso en el servidor. Ante un conflicto confirmado vuelve a leer y combina la operación, hasta cinco intentos; dos pestañas no sobrescriben a ciegas sus snapshots. Tras confirmar un check, traslado a Papelera, restauración o borrado permanente, la UI calcula la vista desde el documento completo confirmado, sin otra lectura de red. La memoria se descarta al cambiar consulta/cliente, ocultar acceso o fallar el transporte; las consultas normales siguen leyendo del servidor.

Ante una pérdida de respuesta no se reintenta automáticamente: la UI conserva y bloquea la solicitud pendiente hasta confirmarla explícitamente. Las creaciones, checks, traslados a Papelera y restauraciones guardan dentro del cifrado su clave, contenido y respuesta originales; repetirlos lee el documento actual y devuelve esa respuesta sin deshacer cambios posteriores. La vista se calcula desde el documento actual, no desde la respuesta histórica del replay. Reutilizar una clave para otra operación devuelve conflicto. La fecha relativa queda fijada cuando se confirma por primera vez y se conserva en su replay.

**Excepción por borrado permanente:** se eliminan también las cargas y respuestas anteriores de ese frente; un recibo `delete_front` conserva su ID, resultado de borrado e identificadores de solicitudes consumidas. Confirmar el mismo borrado funciona aunque ya no exista el frente. Una solicitud antigua retirada comprueba de nuevo el documento autenticado y responde `deleted-request`: informa de que el frente se eliminó, cierra la incertidumbre y actualiza la vista, sin recrearlo. No basta una copia en memoria para dar ese recibo por comprobado. Si otra pestaña restauró antes del borrado, se rechaza la eliminación; si borró primero, no puede restaurarse después.

La identidad pendiente vive solo en memoria de la pestaña; se avisa antes de recargar/cerrar, pero no hay recuperación tras cerrarla. Un cambio de sesión oculta datos, editor y confirmación de borrado sin trasladar la operación a otra cuenta. Volver a entrar en la original permite continuar con la misma identidad. Cerrar sesión queda bloqueado mientras haya una escritura pendiente; un logout incierto mantiene los datos ocultos hasta confirmarlo. Las respuestas originales no caducan automáticamente; al llegar al límite se conserva lo existente y se rechazan nuevos cambios salvo la limpieza explícita mediante borrado permanente.

**Respuesta inmediata del check, revisada el 2026-10-07 por petición del usuario:** se dibuja de forma optimista el valor solicitado mientras se guarda y, si el transporte necesita una lectura posterior, hasta recibirla. No se modifican anticipadamente el documento confirmado ni los cálculos del dashboard. El texto accesible identifica el guardado pendiente; no hay spinner ni animación del check. Un rechazo o resultado incierto retira la vista previa y muestra el último estado confirmado y el error; la incertidumbre mantiene bloqueada la solicitud original hasta su reintento explícito. La vista previa nunca se aplica a otra consulta, fecha o cliente y se elimina al confirmar o completar la lectura para evitar que resurja después.

`/health` comprueba el esquema. `/docs`, `/redoc` y `/openapi.json` no forman parte del Worker y devuelven JSON 404. Las pruebas de equivalencia con Python corresponden al protocolo anterior, conservado en un handler de caracterización que no es el punto de entrada desplegado.

El conector futuro pi/MCP necesita una credencial y un diseño explícito de acceso al contenido cifrado. El código web no se reutiliza automáticamente; esta ampliación no implementa MCP, LLM ni almacenamiento de claves de proveedores.

## 6. Ampliación de información y aprendizaje — diseño aplazado

Esta sección conserva las decisiones de la conversación del 2026-10-06 para continuar el diseño y desarrollo en paralelo al uso de la versión actual. **No describe capacidades implementadas.** Información/LLM sigue aplazado. Las referencias de viabilidad deben revalidarse antes de desarrollar. Las reglas del registro manual siguen aplicándose: recibir correo, resumirlo o conversar con IA no crea frentes ni marca actividad por inferencia.

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
