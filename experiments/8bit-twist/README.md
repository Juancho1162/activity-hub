# 8-bit con encanto — experimento aislado

El usuario prefiere la interfaz estable 8-bit y ha pedido un giro con más gracia, no sustituirla por cyberpunk u otros movimientos artísticos. La [especificación común](../../docs/APP.md) sigue siendo la referencia del producto.

**Propuesta elegida y promoción autorizada:** posteriormente se han trasladado a la app principal los estilos y la ilustración, no la simulación ni sus controles. La corrección de altura del dashboard vive en el CSS base compartido, por lo que mejora también esta comparación. El aspecto aprobado se carga aparte en la entrada principal; «Base» sigue sin esos adornos. Verificación de integración y estado vigentes en el README común.

## Pregunta y propuesta

¿Podemos dar más personalidad a la UI actual sin perder legibilidad, densidad ni continuidad al registrar?

**Con encanto** conserva la paleta musgo/caliza/óxido, los componentes reales shadcn/8bitcn y Press Start 2P local. Añade un pequeño escritorio pixelado original, marco de cartucho en la navegación, sombras con más relieve, esquinas y separadores de papelería, y detalles de sello en los calendarios. En móvil la ilustración se reduce a un pequeño remate de la marca. No hay hero, sonidos, animación continua, puntos, rachas, niveles ni recompensas. Los adornos son estáticos e independientes de los datos.

El selector permite comparar **Base 8-bit / Con encanto** sobre los mismos nodos, checks, filtros y borradores. «Base» usa el CSS real del frontend, con las adaptaciones de muestra indicadas abajo; no es una captura ni una segunda app auténtica. Ambos aspectos tienen tema claro/oscuro/sistema y controles visuales también dentro de los diálogos.

## Abrir

En otra terminal, sin detener la app ni los laboratorios anteriores:

```sh
cd /Users/juanchoprego/nomeborres/matrix/personal/activity-hub
node experiments/8bit-twist/lab.mjs
```

Abrir **<http://127.0.0.1:5182>**. Arranca **Con encanto**. Cambia Aspecto/Tema y prueba Registro, Dashboard, calendarios, checks, filtros y editor. No introduzcas datos personales.

El comando compila con las dependencias **ya instaladas** en `frontend/node_modules` y sirve **solo su `dist/`**, sin API ni proxy. No instala nada, no arranca backend ni abre SQLite. `Ctrl+C` cierra solo este servidor. Si 5182 está ocupado, falla sin matar/reutilizar procesos; elegir otro puerto con `--port 5183`. No está incluido en `npm run dev` y no tiene recarga automática: tras cambiar fuentes, detener y ejecutar de nuevo.

## Alcance, reutilización y límites

- `SampleApp.tsx` es una copia local acotada de `frontend/src/App.tsx`: reutiliza los componentes 8bitcn/shadcn, `useActivity`, fechas y proveedor de temas originales **sin modificarlos**. Se adaptan textos, límites de muestra, referencias solo-texto y controles visuales. La procedencia/licencias de componentes y fuente siguen en [THIRD_PARTY_NOTICES](../../frontend/THIRD_PARTY_NOTICES.md); el arranque copia también `OFL.txt` junto a la fuente.
- `sample.mjs` y sus nueve pruebas son copias byte-idénticas de cyberpunk. `memoryApi.ts` las adapta a la interfaz consumida por el hook: **no es un backend, bypass de acceso ni protocolo de servidor**. No montar ni importar esta simulación en producción.
- Ocho frentes ficticios; intervalo **07/09–04/10/2026**, con **04/10/2026 como hoy simulado en Europe/Madrid**, no el reloj actual. Fechas fuera de la muestra se rechazan. Dashboard inclusivo, orden global antes de paginar, empates por creación, ceros y último registro global. Estados manuales y checks posibles en los tres; crear un frente no marca actividad.
- Datos, referencia, borradores y aspecto **solo en memoria**. Recargar/reiniciar restaura el fixture; Reiniciar es la única acción que remonta la muestra y se bloquea durante escrituras pendientes. El proveedor de temas real guarda únicamente **`activity-hub.theme`** en el origen de este laboratorio, como en la app; no guarda actividad ni secretos.
- Se conserva el bloqueo y refresco del hook, sin éxito optimista ni reintento automático. El aviso visible es **«Solo en esta maqueta; no guardado en la app»**. Los IDs/claves aceptados por el adaptador no acreditan autenticación, idempotencia duradera ni escrituras reales.
- Referencia en ranura fija de **44 px**, independiente de editar/check; abre un diálogo **solo texto**, nunca un enlace navegable. HTTP(S), sin credenciales y hasta 2048 caracteres después de normalizar, restricción explícita de la muestra que no modifica el contrato real.
- Build aislado, sin cargar el Vite principal, proxies, archivos `.env` ni variables `VITE_*`. Servidor GET/HEAD de recursos generados, sin listado de carpetas ni fallback al proyecto; rutas `/api`, `/auth`, código y datos no se sirven. CSP sin conexiones/envío de formularios; los estilos inline permitidos son necesarios para Radix.
- La construcción original del laboratorio no modificó la app, otros experimentos, configuración de pi, dependencias ni datos personales. Su promoción posterior, autorizada por separado, se limita a presentación/arreglo de geometría en la app. Este laboratorio conserva sus propios datos/controlador; sin Git, migraciones ni despliegue.

## Verificación reproducible

Entorno ejecutado: **macOS, Node 26.0.0, Firefox 155.0.1 instalado y TypeScript/Vite/Vitest existentes**. Sin herramientas nuevas. Desde la raíz:

```sh
node --test experiments/8bit-twist/sample.test.mjs
TZ=Pacific/Honolulu node --test experiments/8bit-twist/sample.test.mjs
node frontend/node_modules/vitest/vitest.mjs run --config experiments/8bit-twist/vitest.config.mjs
TZ=Pacific/Honolulu node frontend/node_modules/vitest/vitest.mjs run --config experiments/8bit-twist/vitest.config.mjs
node frontend/node_modules/typescript/bin/tsc --project experiments/8bit-twist/tsconfig.json
node --check experiments/8bit-twist/lab.mjs
node --check experiments/8bit-twist/browser-check.mjs
node experiments/8bit-twist/lab.mjs --build-only
node experiments/8bit-twist/browser-check.mjs
npm --prefix frontend test
```

El runner compila su snapshot y usa servidor de loopback/perfil Firefox **temporales propios**, sin perfiles personales, API ni SQLite. Capturas y `evidence.json` quedan en `test-results/`; `dist/`, `test-results/` y `.cache/` están ignorados. No deja servidores activos. Vite avisa de que `/fonts/press-start-2p.ttf` se resolverá en ejecución: el lanzador copia explícitamente esa fuente local al terminar el build; su respuesta HTTP y carga en Firefox están verificadas.

### Resultados de la prueba original, antes de su promoción

- **9 pruebas Node pasan**, también en Honolulu. **78 pruebas Vitest pasan en 5 archivos**, también en Honolulu: **19 nuevas** de adaptador/interfaz y **59 existentes** de App/Theme/useActivity reutilizadas sin copiarlas. Tipos, sintaxis y build correctos.
- **149 pruebas de la app estable pasan** nuevamente. Se comprobaron por hash **90 archivos públicos originales sin cambios**, incluidos fuentes/configuración y laboratorios anteriores. No se repitieron Python ni el navegador completo de producción para este experimento aislado.
- Firefox: **51 capturas**, Base/Con encanto × claro/oscuro × Registro/Dashboard en **320/390/768/1366/1920 px**, más calendarios, diálogos y nombre largo. Controles comprobados de al menos **44 px**, sin desbordamiento detectado en documento/contenedores medidos.
- **56 pares concretos texto/icono-fondo ≥4,5:1**. No es una auditoría exhaustiva de accesibilidad. Los adornos no cubren texto ni cambian el significado de los checks.
- Espacio conserva nodo, foco visible y viewport al marcar. Aspecto/tema conservan datos, filtros, calendarios abiertos y borrador/diálogo portallado. Escape/retorno de foco y bloqueo de Reiniciar durante escritura cubiertos.
- **24 combinaciones** de aspecto/tema/vista/ancho conservan dimensiones sin referencia, con referencia y con URL larga (tolerancia numérica de `DOMRect` <0,001 px). Nombres/URLs literales, URL ejecutable y normalización excesiva rechazadas; referencia válida normalizada se puede volver a editar.
- Sin solicitudes API/auth/externas ni errores JS/CSP observados. Sin persistencia de actividad: únicamente la preferencia visual permitida. SVG original parseado como XML, sin scripts/recursos externos. Arranque CLI real, fuente/MIME/CSP, rechazo de rutas privadas y puerto ocupado, y cierre SIGINT probados con procesos propios.
- Límite de procedencia de evidencia: el implementador agotó su tiempo con una entrega parcial; la principal conservó/completó fuentes y ejecutó los checks. No se atribuye TDD nuevo a las copias ni se afirma un orden rojo/verde no recibido. Se corrigió el tipo literal demasiado estrecho de la fecha inicial; el runner se ajustó para contar el checkbox real, no también su wrapper, y limpiar correctamente Firefox terminado por señal.

**Revisión independiente cerrada: PASS, sin hallazgos accionables.** El revisor leyó el diff, fuentes/configuración/pruebas, componentes pertinentes, artefactos y siete capturas; no ejecutó comandos. Las ejecuciones de este documento corresponden a la sesión principal. Safari, iPhone físico, lector de pantalla y otros sistemas no están probados. Esto no verifica autenticación ni confirmación HTTP/SQLite, que pertenecen a la app real.

## Conclusión y siguiente paso

**Elegido por el usuario e incorporado como presentación de la app principal.** El laboratorio original quedó implementado, comprobado y revisado; se conserva como referencia interactiva, sin integrar su lógica ficticia. Tras el arreglo compartido de alturas vuelven a pasar 79 pruebas Vitest —19 locales y 60 compartidas—, las 9 Node y el runner Firefox de 51 capturas. El estado/revisión de la integración real se mantiene únicamente en el README común.
