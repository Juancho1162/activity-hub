# Activity Hub


**Herramientas personales para asistir, monitorizar y apoyar mi actividad profesional y formativa.**

Activity Hub agrupa herramientas con un propósito común, no una única aplicación en la que todo tenga que estar relacionado. Por ahora se distinguen dos módulos: **notificaciones y asistencia** y **registro y seguimiento de actividad**.

**Prioridad actual: empezar por registro y seguimiento**, con interfaz web e integración con pi mediante MCP. El módulo de notificaciones se definirá más adelante; no bloquea el trabajo sobre registro.

**Versión publicada:** registro diario, dashboard con calendarios sincronizados por fila y fechas visibles, Papelera con restauración y borrado permanente confirmado, interfaz adaptable a móvil y cuentas con código fijo integrado con el gestor de contraseñas, sin recuperación del código. Cifrado en el navegador, CAPTCHA de un solo uso, límites de uso y publicación verificable incorporados a `main`. Últimos ajustes desplegados y comprobados en Cloudflare el 2026-10-07. Véanse [estado y verificación](#6-estado-real-y-verificación) y [trabajo pendiente](#7-trabajo-previsto-y-siguiente-paso).

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

**Temas:** se conserva la paleta clara cálida. El oscuro usa grises antracita, superficies diferenciadas, texto suave y acentos azules discretos, con fondo liso y sombras más ligeras. Ambos conservan la presentación 8-bit y controles accesibles.

### Acceso privado acordado

- **Alta abierta integrada en la app:** sin invitaciones, Google, correo ni nombre de usuario; con CAPTCHA y máximo inicial de 100 cuentas. Sustituye el diseño anterior de propietario único y alta por terminal.
- **Una cuenta, un código fijo.** El código secreto largo y aleatorio se genera únicamente al crear la cuenta y se muestra para guardarlo privadamente. No se cambia, regenera ni sustituye. Funciona como una contraseña, no como un identificador público.
- **Sin recuperación de ningún tipo:** ni administrativa, ni desde una sesión abierta, ni mediante un segundo código. Si se pierde, no existe un procedimiento para recuperarlo o emitir otro para esa cuenta. Una sesión existente no habilita esa posibilidad.
- **Crear cuenta / iniciar sesión / cerrar sesión**, dentro de la web. Entrar exige el código de una cuenta existente; un código incorrecto no crea una cuenta. Cerrar sesión no borra la cuenta ni sus datos.
- Una persona puede tener varias cuentas. Cada alta crea un registro vacío e independiente; frentes, checks, historial y reintentos quedan aislados por cuenta. El servidor conserva una huella verificable del código, no el original; no se incluye en URLs, logs ni almacenamiento persistente de la aplicación. El titular puede guardarlo en su gestor de contraseñas.
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

## 7. Trabajo previsto y siguiente paso

| Bloque | Estado |
| --- | --- |
| Castellano e inglés y tema oscuro | Implementados y verificados en `feature/bilingual-interface`: 261 pruebas frontend, dos recorridos Firefox y Brave/Chromium, con ambos idiomas/temas. Artefacto preparado; integración y publicación pendientes. El claro conserva su paleta. |
| Promoción JavaScript + Workers/D1 | Completada en local: estructura, comandos, suites, medición, ambos recorridos Firefox y arranque/reinicio verificados. Revisión en la sesión principal; perfil independiente no disponible. |
| Referencia Python | Secundaria en `experiments/python-sqlite/`; 102 pruebas pasan, sin modificación de reglas ni de la SQLite existente. |
| Frontend oficial | React con presentación 8-bit, cifrado local, autocompletado y guardado mediante gestor nativo, interfaz adaptable a móvil, navegación estable, marcado/desmarcado inmediato sin animación, calendarios por fila con fechas visibles y Papelera con restauración y borrado permanente confirmado. 242 pruebas, tipos/build, ambos recorridos Firefox y el recorrido Brave contra Worker/D1 pasan; publicado y comprobado. |
| Datos entre implementaciones | Separados. La promoción de código no migra ni sincroniza cuentas/historial. Una transferencia requeriría procedimiento y petición específica. |
| MCP de Activity Hub | Pendiente de concretar autenticación e implementar/probar el conector; el MCP de Cloudflare para Codex ya está instalado y autenticado. |
| Alojamiento y copias | Worker y D1 publicados con límites y almacenamiento cifrado. Límites/CPU/coste bajo carga, copia externa y recuperación pendientes. La migración de contenido anterior requiere que su titular entre con el nuevo cliente. |
| Git y GitHub | `main` incorpora el código publicado en `7ab68de`, incluidos seguridad, guardado/autocompletado del código, interfaz móvil, navegación, marcado inmediato del check, calendarios por fila y Papelera con borrado permanente. Repositorio privado [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), con `origin`, historial de `main`, rama `feature/information-agent` y etiqueta histórica `v0.1.0` subidos y comprobados. Flujo de ramas/PR documentado en [backend/README.md](backend/README.md#flujo-de-cambio-pruebas-y-publicación), con plantilla de PR. Al retomar `feature/information-agent`, actualizarla desde `main`. Sin CI, protección de ramas ni despliegue automático; datos, credenciales y artefactos excluidos. |
| Dispositivos | Firefox y Brave/Chromium en macOS comprobados con anchos móviles y de escritorio. Safari/iPhone físico pendientes. |
| Notificaciones y asistencia | MVP pendiente de definir; no iniciado. |

**Seguridad publicada y verificada, 2026-10-06.** Código `f37028c`, Worker `activity-hub`, versión `6ccdc325-4ea4-4879-8446-8fb424e57698`. Migraciones `0002_private_storage.sql` y `0003_signup_challenges.sql` aplicadas después de registrar versiones y puntos de recuperación. Pasan las comprobaciones remotas de web/CSP, esquema, rechazo sin sesión/no-store, CAPTCHA real y actividad cifrada. El incremento solicitado está terminado; Información/LLM sigue aplazado.

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

**Implementado y verificado; publicación pendiente.** Rama `feature/bilingual-interface`. Selector en el acceso y la sesión activa; preferencia explícita en `activity-hub.language`, sincronizada entre pestañas. Sin elección previa se usa el primer castellano/inglés de los idiomas del navegador, o castellano si no hay coincidencia. Se traducen navegación, formularios, estados, avisos, validaciones, errores conocidos, textos accesibles, título y oferta al gestor nativo. Fechas y porcentajes usan `es-ES`/`en-GB`; los días ISO y `Europe/Madrid` se mantienen. El CAPTCHA toma el idioma al iniciar su verificación; cambiar después no reinicia un desafío pendiente. Nombres, referencias y credenciales se conservan literalmente.

El oscuro pasa de verdes/grises cálidos a una paleta antracita con acentos azules suaves, fondo liso y sombras ligeras. La paleta y decoración del claro no cambian. En móvil, cuenta/cierre y preferencias usan dos filas para mantener visibles los controles a 320 px. Cambiar idioma o tema conserva código autocompletado, ACK del alta, editor, fecha/filtros, foco, sesión e identidad de las solicitudes pendientes; no crea clientes, consultas de actividad ni reintentos.

Diez regresiones de idioma fallaron antes de traducir la UI; pasan con la implementación. Las 17 pruebas nuevas cubren detección, persistencia, almacenamiento bloqueado, sincronización, acceso/alta, límites, fechas, borradores, checks y reintentos, y confirmación del borrado. Dos pruebas adicionales comprueban el idioma del widget de CAPTCHA. `npm run release:prepare` pasa con **36 pruebas backend y 261 frontend**, tipos/build, dry-run de producción, ambos recorridos Firefox contra Worker/D1 temporal y Brave/Chromium. Firefox conserva las regresiones de seguridad, historial, calendarios, Papelera y marcado inmediato; añade acceso inglés, recarga, autocompletado sin eventos, cambio real entre pestañas con editor abierto, fechas/porcentajes y capturas de ambos temas a 1366/768/390/320 px. Se comprueban **106 pares de contraste de al menos 4,5:1**. Brave comprueba ambos idiomas/temas y registro/dashboard a 11 anchos de 320 a 1366 px, además de PasswordCredential/store reales y ausencia de tráfico del código original. Los checks se dibujaron en el primer frame, a 4/5/7 ms en esta ejecución local; no es una medición de dispositivos reales.

Artefacto congelado en `.release/build-bcf292e5-747b-49b8-89ed-c63873026ae2`. Revisados diff, archivos nuevos y capturas de acceso, dashboard y editor en la sesión principal, sin hallazgos pendientes. El primer recorrido inglés exigía alineación tras conservar solo un calendario móvil abierto y ampliar la ventana; se corrigió la preparación de la prueba para abrir la fila del ancho actual, sin cambiar ni debilitar la regla de la aplicación. No se atribuye revisión independiente: este entorno no permite seleccionar el perfil `reviewer` de codexdev. Sin dependencias nuevas, migraciones ni cambios de datos. Safari/iPhone físico y visibilidad/aceptación del aviso nativo siguen pendientes como comprobaciones de dispositivos.

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
