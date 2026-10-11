# Runner local de Jardín con la aplicación real

Prueba de la presentación elegida con la autenticación, cifrado y funciones de
Activity Hub. La interfaz anterior sigue disponible. Reutiliza `AuthenticatedApp`,
`App` y un único `useActivity`; no sustituye el almacenamiento por el del prototipo.
Las reglas siguen en [APP.md](../../docs/APP.md). La promoción autorizada incorpora
Jardín al build estándar. Este runner conserva la base aislada y los controles
locales; comparte la portada y los estilos con el frontend principal.

## Arranque

Requiere Node 26, las dependencias de los lockfiles existentes y, para el smoke,
Brave instalado en macOS. No añade dependencias.

```sh
npm --prefix frontend ci
npm --prefix backend ci
node experiments/jardin-real/run.mjs
```

- Portada Jardín: <http://localhost:8791/>
- Portada anterior: <http://localhost:8791/?appearance=classic>
- App Jardín: <http://localhost:8791/app/?appearance=garden>
- App anterior: <http://localhost:8791/app/?appearance=classic>

El selector de diseño cambia la presentación sin desmontar la sesión. Abrir otra
página o recargar requiere introducir de nuevo el código, como en la app actual.
Se usa `localhost` para no compartir la cookie con el servidor habitual en
`127.0.0.1`. Usa exactamente los enlaces anteriores.

El primer arranque crea **una base local vacía**, aplicando las migraciones
existentes exclusivamente a `experiments/jardin-real/.state/local/`. Los siguientes
arranques conservan esa base; guarda el código de tu cuenta local. No se accede a
producción ni se importan sus cuentas. Tampoco se importan ni borran los datos de
los [prototipos visuales](../local-lab/README.md), que siguen disponibles en 5174
cuando se ejecuta su propio runner.

Ctrl+C detiene este servidor. Tras editar el frontend, vuelve a arrancarlo para
recompilar. La configuración generada solo contiene el Worker local, recursos
locales y una carpeta aislada de configuración; no hereda secretos personales.

## Alcance y comprobación

La portada recupera «Dale espacio a lo que crece», la planta y los pasos del
experimento elegido. Sus checks interactivos son ficticios y solo viven en
memoria: no consultan la cuenta ni guardan actividad. «Empezar» y «Ya tengo cuenta»
abren el acceso a la app real en Jardín. Incluye ES/EN, ambos temas y el selector
para comparar con la portada anterior.

Se conservan acceso por código, cifrado, alta/edición de frentes, enlaces,
estados, búsqueda, paginación, checks pasados, dashboard, papelera, restauración,
borrado permanente confirmado, ES/EN y temas. Jardín añade semana, historial
de los últimos 14 días hasta la fecha elegida, enfoque y mes editable por frente.
Al crear o editar puedes elegir entre 12 iconos. Se guardan cifrados y aparecen
en las tarjetas, dashboard, papelera y mes. Los frentes antiguos usan la planta
por defecto; editar desde la interfaz anterior conserva la elección. No se
suben imágenes ni se consultan servicios de iconos externos.
Las altas nuevas desde esta entrada local incluyen frentes de ejemplo abiertos,
editables y sin días marcados: Leer, Proyecto A, Proyecto B y Aprender algo. Una guía
de tres pasos aparece en Jardín: terminarla, cerrarla o pulsar «No volver a mostrar»
guarda su descarte cifrado con la cuenta. «Guía rápida» permite consultarla después
sin reactivarla. Las cuentas existentes, incluso vacías, no reciben ejemplos ni
una guía automática. El alta guarda los ejemplos cifrados en la misma transacción
que crea la cuenta, también en el build estándar: recargar antes de entrar ya no
los pierde. Ejemplos y preferencia sobreviven a recargas y entradas; borrar los
ejemplos no vuelve a crearlos.
El calendario usa la misma gestión de solicitudes, bloquea acciones durante
confirmaciones pendientes y permite reintentar con la identidad original.

```sh
node experiments/jardin-real/run.mjs build
node experiments/jardin-real/run.mjs check
npm run verify
```

`check` compila la variante y usa un Worker real, D1 desechable y perfil Brave
temporal. Comprueba la portada, los enlaces a la app, los checks por teclado y
su reinicio, la comparación con la portada anterior y que la muestra no hace
peticiones privadas ni modifica una cuenta ya existente. Revisa ES/EN y ambos
temas a 1440/768/390/320 px, sin desbordamiento horizontal.
Crea datos en la interfaz anterior, los consulta en Jardín, corrige un
día, verifica el dashboard anterior, edita un enlace, elimina/restaura, confirma
el borrado de un frente desechable y comprueba el acceso de nuevo. Verifica la
elección de iconos al crear/editar y su conservación al restaurar, volver a entrar
y editar desde la interfaz anterior. La bienvenida comprueba cero checks iniciales,
guía sin escrituras de actividad, cierre con respuesta perdida y reintento,
preferencia tras recargar/entrar, reapertura manual y borrado de ejemplos.
Revoca la sesión desechable con la guía abierta y simula una lectura fallida al
reautenticar: el reintento permanece accesible dentro del diálogo.
También revisa el cifrado, ES/EN, ambos
temas, calendario y tamaños de 1440/390/320 px. Las
capturas quedan en `test-results/`, ignoradas por Git. No imprime códigos.

Las pruebas unitarias de `frontend/tests/Garden.test.tsx` cubren carga mensual,
fechas límite, febrero bisiesto, reintentos inciertos, aislamiento de API, enfoque,
borradores e idioma. `AuthenticatedApp.test.tsx` comprueba que cambiar de diseño
conserva la sesión y los frentes. Los resultados finales se registran en
[STATUS.md](../../docs/STATUS.md).

El build normal usa Jardín por defecto y conserva «Anterior» en la cabecera.
Este runner añade únicamente los controles de comparación local. El icono es un
campo opcional del documento cifrado; no hay cambios de esquema D1. El endpoint
de alta acepta opcionalmente el documento inicial cifrado.
El CAPTCHA de producción no se ejecuta en el entorno
local, igual que en el desarrollo habitual.

Referencia de las opciones locales: [desarrollo de Workers](https://developers.cloudflare.com/workers/local-development/)
y [configuración de Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/),
contrastadas con la ayuda y el esquema de Wrangler 4.147.0 instalado.
