# Render: investigación histórica de la alternativa Python

**Investigación inicial: 2026-10-02. Última consulta de tarifas base: 2026-10-03.** Referencias vigentes: [producto](../../docs/APP.md) y [estado](../../docs/STATUS.md). El resto de este documento conserva la investigación histórica.

**Archivado el 2026-10-05 al promover JavaScript + Workers/D1.** Este documento conserva la investigación, decisiones y pasos propuestos para la anterior implementación Python. No es el plan de alojamiento vigente ni un listado activo de tareas; las tarifas y recetas no se han revalidado durante el traslado.

Esta guía conserva la investigación sobre operación de servicios Python en Render desde terminal, configuración inicial en el panel y observabilidad. Activity Hub es un conjunto de herramientas con dos módulos independientes: **notificaciones y asistencia** y **registro y seguimiento de actividad**. Se comenzará por registro, con acceso web y desde pi mediante MCP. Su alcance funcional se define en el README; esta guía no lo amplía ni fija su arquitectura.

Las fuentes son documentación oficial, tarifas publicadas y el esquema OpenAPI de Render. Precios y comandos deben revalidarse antes de contratar o ejecutar cambios.

**Límite de la verificación:** no se ha instalado la CLI, autenticado ninguna cuenta, llamado a una API autenticada ni creado infraestructura. Los comandos son ejemplos documentados, no resultados de una prueba real. Los IDs son marcadores, no recursos existentes. Tampoco se han probado integraciones de correo, Teams o IA.

## 1. Conclusión y separación de decisiones

**Elección histórica del usuario:** Render, backend Python con **FastAPI, SQLAlchemy, Alembic y SQLite**, frontend **React**, conector MCP local, alta web abierta, cuentas privadas con un código fijo por cuenta y gestión del alojamiento por terminal. El frontend local utiliza Vite/TypeScript y shadcn/ui con 8bitcn, elegidos para una estética retro. La vía web/PWA en iPhone y la separación funcional se conservan: los recordatorios no se asocian a frentes ni dependen de sus checks.

El **MVP funcional y la base tecnológica** están acordados en el README; Django ya no es la propuesta. Quedan pendientes herramientas complementarias, autenticación del conector, topología de frontend/backend, copias y recursos. El diseño vigente exige signup abierto dentro de la app, un único código fijo por cuenta, signin y logout, sin regeneración ni recuperación. Un correo opcional queda solo como posibilidad futura. El acceso multiusuario ya está implementado, probado y revisado localmente; se ha retirado la administración de códigos por terminal. No está configurado ni probado en Render. El estado y las limitaciones verificadas se mantienen en el README. El MVP de notificaciones se definirá después y no bloquea el registro. Tener dos módulos no obliga a contratar dos web services ni significa que ya se haya decidido compartir uno.

**Recomendación técnica, pendiente de aprobación:** un web service de pago y un disco para registro, en workspace **Hobby**, con observabilidad nativa. No añadir cron, Grafana, Prometheus o Terraform sin una necesidad concreta.

El escenario anterior con cron no es necesario para el registro propuesto ni constituye una arquitectura aprobada para los dos módulos. Las integraciones y tareas de notificaciones podrían necesitar otros recursos; su despliegue sigue abierto.

Render es una plataforma gestionada: construye y ejecuta servicios, proporciona red y TLS, captura logs y ofrece métricas. No administra por nosotros las dependencias, la autenticación, la lógica de cada módulo ni una estrategia de recuperación verificada.

### Vocabulario útil

| Concepto | Significado |
| --- | --- |
| Workspace | Agrupa recursos, miembros y facturación. Su plan determina las funciones de plataforma. |
| Compute plan | CPU/RAM y precio de **cada servicio**. Es independiente del plan del workspace. |
| Web service | Proceso que sirve HTTP, con una dirección pública `onrender.com`. |
| Persistent disk | Directorio cuyos datos sobreviven a reinicios y despliegues. No equivale a una base de datos gestionada. |
| Cron job | Servicio que ejecuta una tarea programada y debe terminar. |
| Blueprint | Declaración de recursos y configuración en un `render.yaml` conectado a Git. |

**Hobby no significa servidor gratuito.** Podemos usar un workspace Hobby de 0 USD y pagar el cómputo del web service. Fuentes: [planes], [web services], [Blueprints].

## 2. Módulos y opciones de despliegue

La separación siguiente es **funcional, no un diagrama de infraestructura ya elegida**:

```text
Activity Hub: asistencia y seguimiento profesional y formativo
├── Notificaciones: entradas manuales / fuentes por definir → avisos
└── Registro: frentes y checks manuales → historial → dashboard propio
```

No hay una relación entre recordatorios y frentes. Una futura recopilación de correo o Teams pertenecería a notificaciones, no al mecanismo de registrar actividad.

| Opción pendiente de decidir | Ventaja | Compromiso |
| --- | --- | --- |
| Compartir inicialmente un servicio, manteniendo los módulos separados | Menos recursos que operar y menor coste base | Comparten capacidad, despliegues y posibles fallos del proceso. La independencia funcional no garantiza aislamiento operativo. |
| Desplegar servicios distintos por función | Permite evolucionar y operar cada módulo por separado | Añade recursos, configuración y coste. Su número y tipo dependen del MVP. |

Ninguna opción exige ahora un dashboard agregador ni una arquitectura de microservicios. El dashboard previsto es el del módulo de registro y su propuesta inicial está en el README. Compartir o separar el despliegue del futuro módulo de notificaciones se decidirá al concretar ese módulo.

### Criterios técnicos aplicables, según la opción elegida

- La propuesta es compilar React y servir su build desde el mismo web service que FastAPI; la alternativa es un sitio estático separado. La topología sigue pendiente. Una PWA no obliga por sí sola a contratar otro hosting. El build estático de Vite está probado localmente. Si se adopta la primera opción, falta verificar el build conjunto Node/Python y servir esos artefactos en Render; no se ha preparado ni probado allí.
- Fijar una versión de Python explícita mediante `.python-version` o `PYTHON_VERSION`; no depender del valor por defecto de Render. La variable exige versión completa. El backend local se ha probado con Python 3.14.7; comprobar la disponibilidad y compatibilidad en Render antes de fijar su runtime de producción. También habrá que fijar Node y las herramientas de frontend elegidas, sin instalar runtimes globales automáticamente.
- Un web service debe escuchar HTTP en `0.0.0.0` y en el puerto configurado por `PORT` (Render usa 10000 por defecto), no solo en `localhost`.
- Si un módulo usa SQLite, colocar sus datos bajo el punto de montaje del disco, por ejemplo `/var/data`. Fuera de él, el sistema de archivos es efímero. Esto no aprueba una base de datos compartida entre módulos.
- Un cron de notificaciones puede invocar una operación autenticada de su módulo. Si este utiliza un disco de un web service, el cron no puede abrir directamente ese archivo SQLite. No se resuelve leyendo el historial del módulo de registro.
- Para comunicar un cron y un web service mediante red privada deben estar en la misma región y workspace. Los cron jobs pueden **enviar** peticiones privadas, pero no recibirlas.
- El conector local previsto funciona por stdio: pi lo arranca y este llama a la API HTTPS de FastAPI. No requiere otra VM ni publicar un servidor MCP HTTP en Render. El conector forma parte de la base acordada; su credencial independiente y contratos siguen por concretar y verificar. No está implementado ni da acceso a correo o Teams.

**La red privada no convierte automáticamente una ruta del servidor público en una ruta privada.** Una operación invocada por cron debe exigir autorización o aislarse en un puerto interno; no basta con darle un nombre como `/internal/...`.

Render despliega desde un repositorio Git remoto o una imagen Docker. No dar por supuesto un equivalente a `railway up` que sube la carpeta local. Un `--commit` debe corresponder a código disponible en el origen remoto; no publica cambios locales.

Fuentes: [web services], [versión de Python], [red privada], [discos].

## 3. Costes y límites

**Estimación de la propuesta de registro, pendiente de aprobación:** un web service con una instancia y un disco, sin cron. Tarifas consultadas en USD/mes, antes de impuestos. No incluyen dominio propio, almacenamiento adicional para copias, utilización de pi/IA, otras integraciones ni excesos de consumo.

| Recurso propuesto para registro | Base mensual |
| --- | ---: |
| Workspace Hobby | 0 USD |
| Web service `0.5c-512mb` — 0,5 CPU / 512 MB RAM, antes llamado Starter | 7 USD |
| Disco persistente de 1 GB, a 0,25 USD/GB | 0,25 USD |
| **Base propuesta, sin cron** | **7,25 USD** |

La suficiencia de 512 MB todavía no se ha medido. No se han reservado ni aceptado esos recursos. Las copias manuales propuestas usan almacenamiento privado externo al servicio, que deberá concretarse; no se ha contratado un destino adicional.

La referencia anterior de **8,25 USD** sumaba un cron de al menos 1 USD que el registro no necesita. Un cron se factura por tiempo de ejecución y las ejecuciones largas o frecuentes pueden superar ese mínimo. Separar módulos en más servicios, incorporar IA o automatizar copias puede alterar el coste: **no extrapolar esta base a los dos módulos**. El número de recordatorios tampoco equivale necesariamente al número de cron jobs contratados.

Hobby incluye 5 GB de tráfico saliente al mes y 500 minutos de build del nivel Starter. La documentación consultada indica 0,15 USD por GB público adicional; los builds adicionales también pueden facturarse. El tráfico privado entre servicios de la misma región no cuenta como tráfico saliente. Un subdominio de Render basta para empezar, sin comprar un dominio.

El workspace **Pro cuesta 25 USD/mes adicionales al cómputo**. Con los recursos propuestos de registro, la base pasaría a 32,25 USD, antes de un proveedor externo de observabilidad. No parece razonable subir solo para conectar Grafana en este proyecto.

### Control de gasto

- Revisar Billing y el inventario de servicios. Crear otra instancia o un cron adicional añade consumo.
- Configurar un límite para gastos extra de **build pipeline**. Ese límite no es un tope global de la factura ni detiene necesariamente el cómputo existente.
- No se ha verificado un límite duro global de gasto equivalente al de Railway. No prometer que la factura se parará automáticamente en 10 USD.
- Quitar un recurso del YAML **no lo elimina**: puede seguir existiendo y facturando.
- Los planes gratuitos no son la propuesta para conservar este historial: el web gratuito se duerme tras 15 minutos de inactividad, no admite disco persistente y el Postgres gratuito caduca a los 30 días.

Fuentes: [precios], [cron], [planes], [tráfico], [build pipeline], [gratis].

## 4. Qué se hace en el panel y qué desde terminal

| Operación | Vía razonable | Observación |
| --- | --- | --- |
| Alta, facturación y conexión del proveedor Git | Panel inicial | Acciones humanas; no requiere compartir credenciales en el chat. |
| Autorizar la CLI | `render login` + navegador | La CLI guarda su token; no inspeccionar ese archivo para extraerlo. |
| Listar recursos, despliegues y logs | CLI | Soporta salida JSON y filtros. |
| Crear o actualizar servicios | CLI o Blueprint | `services create/update` tienen soporte no interactivo. Crear recursos puede generar cargos. |
| Configuración reproducible de varios recursos | Blueprint | Una sola fuente de configuración, no cambios contradictorios entre YAML y CLI. |
| Primera conexión y aprobación del Blueprint | Panel | Flujo oficial documentado; uso puntual asumible. |
| Validar el YAML | CLI | No crea ni aplica recursos. Puede consultar el workspace para detectar conflictos. |
| Aplicar cambios de Blueprint | Sync del Blueprint | Por defecto tras push; con Auto Sync desactivado, Manual Sync en el panel. |
| Desplegar una versión de código o reiniciar | CLI | Distinto de sincronizar la configuración del Blueprint. |
| SSH a una instancia | CLI / SSH | Acceso al servicio, no administración de una VM completa. |
| Rollback al artefacto de un deploy anterior | API o panel | No se ha encontrado un subcomando dedicado en la referencia CLI consultada. |
| Lanzar manualmente un cron | API o panel | No confundirlo con crear un one-off job. |
| CPU y otras métricas desde terminal | REST API | La CLI consultada no documenta `render metrics`. |
| Snapshots de disco | API o panel | La restauración es destructiva. |
| Secretos y avisos de email/Slack | Panel inicialmente; API donde corresponda | La comodidad no justifica exponer valores en comandos, salidas o historial. |

Fuentes: [CLI], [referencia CLI], [API], [OpenAPI], [Blueprints]. No se promete paridad absoluta entre CLI y panel.

### Instalación y autorización futuras

**No ejecutado.** Requiere autorización para instalar la herramienta y que el usuario complete el login:

```sh
brew install render
render login
render workspaces --output json
render workspace set
```

Antes de seguir, comprobar el workspace activo y consultar la ayuda de la versión instalada:

```sh
render help
render help services
render help deploys
```

La referencia online puede cambiar. No ejecutar comandos de creación de un tutorial sin confirmar plan, región, repositorio y coste.

### Consultas habituales

Después del login y de que existan recursos, sustituir el marcador por el ID correcto:

```sh
SERVICE_ID='srv-SUSTITUIR'

render services --output json
render services instances "$SERVICE_ID" --output json
render deploys list "$SERVICE_ID" --output json
render logs --resources "$SERVICE_ID" --level error --limit 100 --output json
render logs --resources "$SERVICE_ID" --tail
```

`--resources` es obligatorio para logs en modo no interactivo. Los logs de la propia app deben evitar tokens, cookies, cuerpos de peticiones, suscripciones push y contenido personal. Consultar logs no implica permiso para publicar su salida íntegra.

### Cambios operativos

**Estos comandos sí modifican el servicio y requieren autorización:**

```sh
render deploys create "$SERVICE_ID" --wait
render deploys create "$SERVICE_ID" --commit COMMIT_REMOTO_APROBADO --wait
render restart "$SERVICE_ID"
```

`--wait` devuelve error si falla el despliegue. Desplegar un commit concreto no desactiva por sí mismo los autodeploys. `--confirm` omite confirmaciones; no es un modo de simulación. Tampoco asumir que `--output json` vuelve una operación de escritura inocua o exige una confirmación adicional.

Para altas y cambios existen `render services create` y `render services update`. Permiten indicar repositorio/imagen, runtime, comandos, plan y, según la operación, región, health check o cron. **No se incluye una orden de alta lista para ejecutar** porque faltan aprobar la topología y los recursos, y preparar el empaquetado de producción de la app local. Para recursos gestionados por Blueprint, preferir modificar su YAML: el siguiente sync puede sobrescribir cambios hechos por CLI.

### Operaciones por REST API

Base: `https://api.render.com`. Requiere una API key gestionada por el usuario. Estos son contratos publicados, no llamadas realizadas:

| Método y ruta | Uso / precaución |
| --- | --- |
| `GET /v1/metrics/cpu?resource=SERVICE_ID` | CPU; el parámetro antiguo `service` está deprecado. Admite rango temporal y resolución mínima de 30 segundos. |
| `GET /v1/blueprints/{blueprintId}/syncs` | Consultar sincronizaciones, no dispararlas. |
| `GET /v1/disks/{diskId}/snapshots` | Listar snapshots disponibles. |
| `POST /v1/cron-jobs/{cronJobId}/runs` | Ejecutar el cron ahora. **Cancela cualquier ejecución activa.** |
| `POST /v1/services/{serviceId}/rollback` | Reutilizar un deploy anterior, indicando su `deployId`. No revierte datos ni desactiva autodeploys. |
| `POST /v1/disks/{diskId}/snapshots/restore` | Restaurar mediante `snapshotKey`. Sobrescribe datos y puede redesplegar el servicio. |

Un cliente autenticado —por ejemplo, una herramienta Python o `curl` configurado de forma segura— permite usar estas operaciones desde terminal. No incrustar tokens en la URL, argumentos de ejemplo, Git o logs. No leer el archivo privado de la CLI para recuperar credenciales. No reintentar automáticamente escrituras destructivas tras una respuesta ambigua.

Fuentes: [API], [OpenAPI], [API CPU], [API cron], [API snapshots], [rollback]. Los límites del plan y permisos siguen aplicándose aunque la operación se haga por API.

## 5. Blueprints frente a Terraform

**Recomendación:** utilizar un futuro `render.yaml` como definición de infraestructura, sin Terraform inicialmente. Render recomienda Blueprints cuando toda la infraestructura está en su plataforma; su proveedor oficial de Terraform sirve si después se gestionan también recursos externos.

Qué contendría ese YAML para el registro propuesto: web service, runtime, comandos de build/arranque, región, plan explícito, disco, health check y referencias de configuración, sin cron. La programación de tareas solo se añadiría si se aprueba para otra necesidad. No se ha creado ese archivo.

Flujo operativo razonable:

1. Editar y revisar el YAML localmente, sin secretos.
2. Cuando exista el archivo y esté autorizada la conexión, ejecutar `render blueprints validate ./render.yaml --output json`. La validación incluye esquema y posibles conflictos del workspace; no confundirla con una prueba offline ni con un `apply`.
3. Revisar los cambios de recursos y su coste antes de publicar/sincronizar.
4. Crear y aprobar el Blueprint inicialmente en el panel.
5. Elegir explícitamente la política de automatización antes de futuros pushes.

### Dos automatizaciones distintas

- **Auto Sync del Blueprint:** puede aplicar cambios de infraestructura tras un push. Se puede desactivar y usar Manual Sync.
- **Autodeploy de cada servicio:** despliega cambios del código de su rama. En YAML se controla con `autoDeployTrigger` (`commit`, `checksPass` u `off`).

Desactivar una no equivale a desactivar la otra. Un `git push` puede tener efectos de producción si cualquiera de ellas está conectada; no se autorizarán pushes implícitamente.

### Reglas que evitan sorpresas

- `render blueprints validate` no despliega. No se ha encontrado un `render blueprints apply` en la referencia CLI consultada.
- No gestionar el mismo recurso desde varios Blueprints ni mezclar Blueprint y Terraform como fuentes de verdad.
- Un sync puede sobrescribir cambios manuales en campos controlados por el YAML.
- Eliminar una definición del YAML no elimina el recurso. Borrar un recurso sin quitarlo del YAML puede hacer que se recree al sincronizar.
- Declarar planes y tamaño de disco explícitamente, en lugar de aceptar defaults que pueden aumentar el coste.
- Para secretos, `sync: false` permite introducir valores en el panel al crear el Blueprint; **no vuelve a solicitarlos en actualizaciones**. Los secretos nuevos se gestionan aparte, no con valores en claro dentro del YAML.

Fuentes: [Blueprints], [referencia Blueprint], [referencia CLI], [Terraform].

## 6. Programación del módulo de notificaciones

Un cron es un mecanismo de ejecución, no una relación entre módulos. Los recordatorios se programan con su propia información; no necesitan consultar frentes ni checks. Incluso un aviso cuyo texto sea «repasar mis checks» sigue siendo un recordatorio independiente.

Los cron jobs usan expresiones cron en **UTC**. La zona horaria de los avisos debe definirse: un cron fijo en UTC no conserva por sí solo la misma hora local al cambiar el horario de verano. Para el módulo de registro está acordada la zona `Europe/Madrid`, compartida por web y pi/MCP. Esa regla de su calendario no fija automáticamente la zona ni los horarios del módulo de notificaciones, que siguen pendientes.

**Opción a evaluar para recordatorios:** un programador periódico revisa las reglas pendientes del módulo de notificaciones y ejecuta las que correspondan. No requiere necesariamente un cron de Render por cada recordatorio. La frecuencia, ejecución de tareas, almacenamiento del estado y política ante retrasos/fallos se decidirán con el MVP.

- Si los datos de notificaciones se guardan en SQLite en un disco de un web service, un cron separado no puede montar ni leer ese disco. Puede invocar una operación autenticada del módulo que sí acceda a sus datos, o habrá que elegir otra distribución del almacenamiento. No debe depender del historial de actividad.
- La llamada puede usar la red privada si ambos servicios están en el mismo workspace y región. Aun así necesita autorización y límites de ejecución.
- Render garantiza una ejecución activa por cron; una ejecución programada espera a que termine la anterior. La ejecución manual cancela la que esté activa.
- La tarea debe terminar: cron se factura por tiempo y Render lo detiene después de 12 horas.
- Un fallo real del procesamiento o del envío no debe transformarse en un éxito del proceso. Los avisos de fallo de Render dependen del resultado de la tarea.
- Probar reintentos y reinicios para evitar avisos duplicados; una respuesta incierta no demuestra ni éxito ni ausencia de envío.
- No depender del portátil encendido ni de un temporizador abierto en Safari. Una eventual tarea con IA necesitaría su propia integración de ejecución; no hereda una conversación abierta en pi.

La capacidad de programar ejecuciones **no valida el acceso a correo o Teams ni el procesamiento de sus datos**. Fuentes, permisos, políticas aplicables, proveedor de IA, conservación y coste quedan pendientes del MVP; no se han conectado ni probado.

Aceptar un mensaje por parte del servicio Web Push **no demuestra que el iPhone lo haya mostrado**: conexión, permisos y Focus también influyen. Hace falta una prueba en el dispositivo.

Fuentes: [cron], [red privada], [avisos], [Web Push en iPhone].

## 7. Observabilidad: qué viene incluido

### Recomendación inicial: Render nativo, sin Grafana

| Capacidad | Workspace Hobby | Notas |
| --- | --- | --- |
| Gráficas de CPU y memoria del web service | Sí | Para detectar consumo y falta de memoria. |
| Uso y actividad del disco | Sí, con almacenamiento persistente | Vigilar espacio disponible. |
| Volumen HTTP y códigos de estado | Sí, métricas básicas | Algunos filtros avanzados requieren Pro. Solo tráfico público. |
| Percentiles de latencia HTTP de Render | No | Requieren Pro o superior. |
| Logs de aplicación y de despliegues | Sí | Buscables y consultables por CLI/API. |
| Logs HTTP generados por Render | No | Requieren Pro. La app puede emitir sus propios logs de acceso mínimos. |
| Retención de logs y métricas | 7 días | Pro: 14 días; Scale/Enterprise: 30. No sustituye el historial de checks en la base de datos. |
| Avisos por email/Slack de fallos | Sí | Build/deploy, cron, servicio no saludable y disco por encima del 80%, entre otros. |
| Stream nativo de métricas a Grafana/OTel | No | Requiere Pro o superior. |
| Stream de logs a proveedor externo | Sí, a nivel de workspace | Restricciones por protocolo/proveedor; personalización por servicio depende del plan. |

Los health checks permiten a Render detectar y reiniciar instancias no saludables. El backend local incluye una ruta `/health` sin datos privados que comprueba la conexión, revisión y tablas del esquema; aún no se ha probado en Render. Render acepta `2xx`/`3xx` dentro de cinco segundos; no conviene redirigir el health check al login y dar por sano un backend averiado.

**Límites:** estos health checks solo cubren servicios que reciben tráfico, no acreditan que una notificación haya salido. Las métricas HTTP nativas tampoco incluyen las peticiones por red privada. El stream nativo de métricas no cubre cron jobs, one-off jobs ni static sites. Esta observabilidad técnica es distinta del dashboard de actividad y de un posible dashboard agregador futuro.

### Señales propias que aportan más que otra herramienta

Propuesta para los módulos, aún no instrumentada:

- Logs estructurados con módulo, nivel, operación, resultado y duración, sin nombres de actividades, contenido de correos o mensajes, cookies, tokens ni endpoints de suscripción push.
- En notificaciones, última ejecución programada y resultado agregado: enviado, no correspondía o falló. No es una señal para marcar actividad en el otro módulo.
- Última copia consistente completada y última restauración comprobada.
- Errores de autenticación y de persistencia, sin revelar secretos ni contenido del usuario.

Empezaría con avisos de Render de **solo fallos**, evitando mensajes por cada despliegue correcto. Para detectar silencios —por ejemplo, que no se haya ejecutado ningún recordatorio— podría añadirse después una comprobación independiente; el éxito del health check no cubre ese caso.

### Cuándo tendría sentido Grafana

- Se necesita más retención, paneles personalizados o alertas que combinen varias aplicaciones/proveedores.
- Se quiere instrumentación específica y se acepta mantenerla.

Hay rutas distintas, que no deben confundirse:

1. **Métricas de infraestructura de Render → Grafana Cloud:** integración nativa OpenTelemetry; requiere workspace Pro, además de las condiciones/costes de Grafana.
2. **Telemetría instrumentada en la app → proveedor externo:** alternativa que se evaluaría aparte; no es la exportación nativa de Render y añade dependencias, configuración y otro destino de datos.
3. **Prometheus/Grafana autohospedados:** añaden servicios, discos, actualizaciones y copias. No recomendados para la primera etapa del proyecto.

El stream de logs de Render no admite cualquier endpoint HTTP arbitrario: los proveedores HTTPS están enumerados en su documentación; otros usan syslog TLS. No suponer que pegar una URL de Loki u OTLP resuelve la integración.

Fuentes: [métricas], [logs], [avisos], [health checks], [stream de métricas], [stream de logs], [planes].

## 8. Persistencia, copias y recuperación

### SQLite con disco: compromisos antes de desplegar

SQLite está elegido para registro. El disco y los recursos de Render todavía no están aprobados ni creados. No se ha elegido almacenamiento para notificaciones ni una base de datos común entre módulos. Desplegar SQLite con disco implica estos compromisos:

- Solo se conserva lo escrito bajo el punto de montaje.
- El disco lo utiliza una única instancia. La documentación de discos consultada no permite escalar ese servicio a varias instancias.
- **No hay despliegue sin interrupción:** Render detiene la instancia antigua antes de iniciar la nueva con el disco. La pausa es un compromiso a aceptar, no una garantía de alta disponibilidad.
- Build, pre-deploy, cron y one-off jobs no tienen acceso al disco del web service. No poner una migración de SQLite en `preDeployCommand` dando por hecho que verá los datos reales.
- Las migraciones sobre ese archivo necesitarán un procedimiento en el proceso/instancia que monta el disco, con copia previa y control de escrituras. Todavía no está implementado.

### Copias

Render crea snapshots de disco cada 24 horas y los conserva al menos siete días. Restaurar uno revierte todo el disco y pierde las escrituras posteriores. La propia documentación advierte sobre restauraciones de discos usados por bases de datos personalizadas.

**No basar la recuperación de SQLite solo en snapshots.** El plan del README propone una exportación lógica consistente de frentes y checks, sin sesiones ni credenciales, y su restauración comprobada en una base nueva. Requiere una transacción de lectura coherente, no lecturas de tablas independientes que puedan mezclar momentos diferentes. Copiar a ciegas el archivo activo —especialmente con WAL— no es un procedimiento suficiente; una copia física alternativa necesitaría mecanismos adecuados de SQLite.

La frecuencia y retención manuales propuestas están en el README, pendientes de aprobación. Antes de producción debe concretarse el destino privado cifrado fuera del servicio y aceptar el posible intervalo de pérdida. Se puede transferir la exportación ya creada mediante SSH/SFTP; no se ha configurado ni probado ese acceso. No usar un one-off job ni una shell efímera suponiendo que tendrán el disco real.

### Rollback de código no es rollback de datos

- Un rollback de Render reutiliza un artefacto anterior si sigue retenido; **no revierte el disco ni las migraciones**.
- Puede reutilizar configuración y variables del despliegue anterior. Revisar compatibilidad y secretos rotados sin imprimir sus valores.
- El rollback por API no desactiva autodeploys; el realizado desde el panel sí. Evitar que otro despliegue reintroduzca el problema.
- Una restauración de snapshot por API sobrescribe datos y puede causar un deploy. Los `snapshotKey` caducan a las 24 horas; hay que volver a listar para obtener claves vigentes.
- Toda restauración exige una decisión explícita sobre pérdida admisible de datos y comprobación posterior. No es una acción automática de diagnóstico.

Fuentes: [discos], [rollback], [API snapshots], [build pipeline].

## 9. Acceso desde pi y seguridad operativa

La integración de los módulos con pi mediante MCP es una decisión del proyecto, comenzando por registro. Sus capacidades funcionales y el uso de un conector local están acordados en el README. Se propone stdio hacia una API HTTPS con credencial independiente y revocable; el mecanismo de autenticación todavía requiere concreción y aprobación antes de implementarlo. No se ha configurado ni probado con pi. Para otros módulos se definirán contratos y permisos al abordar su alcance, no mediante una autorización global. No se construirá un agente coordinador como requisito de esta etapa.

Para la **web está acordada el alta abierta**, sin Google, correo ni nombre de usuario: cada cuenta privada tiene un único código fijo, generado al crearla dentro de la app. No hay cambio, regeneración ni recuperación, tampoco por administración o desde una sesión abierta. El correo opcional es solo una posibilidad futura, no parte de esta versión. El README documenta su implementación local, aislamiento de datos/reintentos, sesiones, Origin/CSRF y cambio de cuenta entre pestañas. Las migraciones conservan el código previo cuando existe una cuenta antigua, sin asignar datos huérfanos a nuevos registros. No resuelve la autenticación de pi/MCP ni acredita un despliegue. Los límites locales de login/signup son globales: el abuso del registro abierto, el consumo de almacenamiento y HTTPS/cookies requieren validación antes de publicar.

Separar capacidades y permisos:

- **MCP del módulo de registro:** acceso a las operaciones del MVP aprobado para consultar y gestionar frentes, checks e historial, con las mismas reglas que la web. Los cambios requieren peticiones explícitas; no se infiere actividad del contenido de una conversación.
- **MCP del futuro módulo de notificaciones:** acceso a sus propias entradas y reglas, cuyo MVP sigue pendiente. Las eventuales conexiones a correo, Teams u otras fuentes requieren autorización y límites propios. Que pi acceda a ambos módulos no crea una asociación entre recordatorios y frentes.
- **Administración de Render:** crear recursos, desplegar, consultar logs y recuperar datos. No es una función de ninguno de los módulos de producto.

Las credenciales de Render no se reutilizan como autenticación del MCP de registro, de las notificaciones o de sus fuentes, ni se incorporan al navegador. Compartir alojamiento no justifica compartir todos los permisos. La documentación oficial también ofrece un **MCP de Render** para administrar infraestructura, pero no es necesario para la gestión por CLI y no se ha configurado. Conectarlo ampliaría el acceso del asistente y requiere otra autorización.

Antes de conectar fuentes profesionales habrá que verificar permisos y políticas aplicables, decidir qué información sale hacia una IA y qué se conserva. Esta investigación de alojamiento no acredita esa viabilidad ni autoriza el acceso a datos privados.

Reglas operativas:

- El usuario realiza login y gestiona los secretos. No leer archivos de autenticación, imprimir variables secretas ni volcar el entorno completo.
- Preferir IDs explícitos y confirmar workspace/servicio antes de cambios.
- Distinguir consultas de operaciones que crean costes, cambian producción o destruyen datos. La disponibilidad técnica no es autorización.
- No añadir `--confirm` por defecto ni asumir que todos los comandos preguntan antes de actuar.
- No instalar skills/plugins del proveedor ni habilitar servicios externos automáticamente.
- No hacer commits, pushes, despliegues, migraciones o restauraciones sin solicitud/autorización correspondiente.

Fuentes: [CLI], [API], [MCP de Render].

## 10. Qué está verificado y qué falta

### Evidencia obtenida

- Investigación oficial de CLI/API, Blueprints, Python, red, cron, discos, rollback, métricas, logs, avisos, planes y precios. Durante el plan técnico se volvió a consultar la página de precios y se contrastaron las cifras base de web y disco; esto no revalida todas las capacidades o comandos de la guía.
- Contraste previo de rutas REST con el **OpenAPI público**, sin autenticación ni llamadas operativas. La página individual de rollback devolvió HTTP 500 durante la consulta; el contrato se contrastó mediante OpenAPI y la guía de rollbacks.
- Comprobación local renovada el 2026-10-03: la terminal funciona desde `activity-hub` y la CLI de Render sigue ausente en `PATH`. El README registra las versiones y pruebas actuales del backend local.
- Ya hay backend, migración multiusuario, frontend Vite/8bitcn y acceso web con signup abierto y código fijo, probados y revisados localmente. La evidencia actual de aislamiento, sesiones/CSRF, reintentos y dos pestañas está en el README. No se ha abierto ni migrado la base personal, ni creado `render.yaml`, credenciales reales, configuración MCP, cuentas de proveedor o recursos. Las pruebas locales no validan el disco, runtime, coste o restauración de datos en Render.

### Comprobaciones futuras, no ejecutadas

El listado de trabajo está en el README; aquí se conservan las comprobaciones operativas de la investigación. La primera etapa es registro. Las comprobaciones de notificaciones, cron o fuentes externas solo se aplicarán al abordar ese módulo; no son requisitos para terminar el registro.

1. Continuar desde el backend local y su estado en el README, sin reabrir el MVP ni la elección del ORM. Concretar las decisiones pendientes del README antes del paso que dependa de ellas. Más adelante, definir notificaciones y verificar por separado permisos y tratamiento de datos de sus fuentes.
2. Aprobar recursos, presupuesto, región, configuración de acceso alojado y copias para el primer módulo. Confirmar antes de contratar el precio de la propuesta web/disco de 7,25 USD y medir si sus recursos bastan; no incluye cron ni asegura el coste de módulos futuros.
3. Con autorización, instalar la CLI, hacer login y contrastar los comandos con su ayuda real; validar el Blueprint que se prepare y revisar cambios/costes antes de aplicarlo.
4. Comprobar que los checks sobreviven a reinicios y redespliegues, y medir consumo real de los recursos elegidos.
5. Probar rechazo de acceso no autorizado en cada módulo, en MCP y en las operaciones programadas. Para la web de registro, comprobar que códigos incorrectos y sesiones cerradas/caducadas no permiten consultar ni modificar datos, y que una cuenta nunca accede a los de otra. No habrá recuperación ni regeneración de códigos.
6. Probar notificaciones en el iPhone con la PWA cerrada y el Mac apagado; comprobar horario local, permisos, reintentos y no duplicación.
7. Comprobar la independencia funcional: un recordatorio funciona sin frentes y su recepción no registra actividad; marcar un check no cambia recordatorios.
8. Provocar un fallo controlado para verificar logs y aviso de cron, sin utilizar datos reales para pruebas destructivas.
9. Restaurar una copia consistente de datos ficticios y comprobar los datos recuperados de cada módulo que los conserve.

**Siguiente paso disponible:** probar localmente el signup web y el registro, siguiendo el README. Antes de alojarla faltan aprobar recursos/topología, preparar el build conjunto y las copias, y verificar HTTPS/cookies, límites del registro abierto y restauración de datos en el servicio real. No habrá recuperación ni sustitución de códigos de cuenta. Esto no autoriza instalar la CLI de Render, conectar cuentas/fuentes privadas, crear recursos o desplegar.

## Fuentes oficiales

Consulta inicial el 2026-10-02; precios base de web y disco consultados de nuevo durante la planificación del 2026-10-03. Las referencias de CLI y OpenAPI son dinámicas; verificar la versión y esquema vigentes antes de automatizar cambios.

- [CLI] y [referencia CLI]: operaciones, autenticación y flags.
- [API] y [OpenAPI]: contratos REST; [API CPU], [API cron], [API snapshots].
- [Blueprints], [referencia Blueprint] y [Terraform]: configuración reproducible y límites.
- [web services], [versión de Python], [red privada], [cron], [discos], [rollback] y [health checks]: funcionamiento operativo.
- [métricas], [logs], [avisos], [stream de métricas] y [stream de logs]: observabilidad.
- [precios], [planes], [gratis], [tráfico] y [build pipeline]: costes y prestaciones.
- [MCP de Render]: integración administrativa opcional, distinta del MCP de Activity Hub.
- [Web Push en iPhone]: requisitos y permisos de la PWA.

[CLI]: https://render.com/docs/cli
[referencia CLI]: https://render.com/docs/cli-reference
[API]: https://render.com/docs/api
[OpenAPI]: https://api-docs.render.com/openapi/render-public-api-1.json
[API CPU]: https://api-docs.render.com/reference/get-cpu
[API cron]: https://api-docs.render.com/reference/run-cron-job
[API snapshots]: https://api-docs.render.com/reference/restore-snapshot
[Blueprints]: https://render.com/docs/infrastructure-as-code
[referencia Blueprint]: https://render.com/docs/blueprint-spec
[Terraform]: https://render.com/docs/terraform-provider
[web services]: https://render.com/docs/web-services
[versión de Python]: https://render.com/docs/python-version
[red privada]: https://render.com/docs/private-network
[cron]: https://render.com/docs/cronjobs
[discos]: https://render.com/docs/disks
[rollback]: https://render.com/docs/rollbacks
[health checks]: https://render.com/docs/health-checks
[métricas]: https://render.com/docs/service-metrics
[logs]: https://render.com/docs/logging
[avisos]: https://render.com/docs/notifications
[stream de métricas]: https://render.com/docs/metrics-streams
[stream de logs]: https://render.com/docs/log-streams
[precios]: https://render.com/pricing
[planes]: https://render.com/docs/platform-features-by-plan
[gratis]: https://render.com/docs/free
[tráfico]: https://render.com/docs/outbound-bandwidth
[build pipeline]: https://render.com/docs/build-pipeline
[MCP de Render]: https://render.com/docs/mcp-server
[Web Push en iPhone]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
