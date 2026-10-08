# Laboratorio visual cyberpunk

Experimento autorizado y separado de la app. La [especificación](../../docs/APP.md) y el [estado común](../../docs/STATUS.md) siguen siendo la referencia del producto. **No es otra cuenta, otro backend ni un rediseño ya integrado.**

## Pregunta y alcance

¿Podemos explorar una identidad cyberpunk con distribuciones realmente distintas sin dificultar marcar actividad ni leer nombres, fechas y porcentajes?

| Propuesta | Cambio visual y estructural |
| --- | --- |
| **01 · Neón** | Azul noche, cian y detalles magenta. Lista a la izquierda, contexto/fecha a la derecha en escritorio; dashboard en tarjetas. |
| **02 · Industrial** | Fondo claro, estructura negra y acento lima. Navegación lateral; registro a dos columnas en escritorio amplio y dashboard tabular. |
| **03 · Noir** | Oscuro ahumado, ámbar y lavanda. Navegación horizontal, contenido centrado y frentes en franjas; checks a la derecha. |

La maqueta se aparta del pixel art. El frontend React/shadcn/8bitcn estable permanece intacto. HTML, CSS, JavaScript nativo, SVG propios y fuentes del sistema; **sin instalaciones ni recursos externos**. Una base interactiva compartida permite cambiar de estética sin reiniciar la muestra.

## Abrir el laboratorio

Desde la raíz del proyecto, en otra terminal; no hace falta detener `npm run dev`:

```sh
.venv/bin/python -m http.server 5180 --bind 127.0.0.1 --directory experiments/cyberpunk-ui
```

Abre **<http://127.0.0.1:5180>**. `Ctrl+C` detiene solo este servidor estático. Si el puerto está ocupado, el comando falla: no se mata ni reutiliza otro proceso. No servir la raíz del proyecto. La opción `--directory` se limita al laboratorio.

Enlaces directos, sin actividad ni secretos en la URL:

- [Neón / diario](http://127.0.0.1:5180/?look=neon&view=daily)
- [Industrial / diario](http://127.0.0.1:5180/?look=industrial&view=daily)
- [Noir / diario](http://127.0.0.1:5180/?look=noir&view=daily)

El selector superior compara las propuestas. Cambia a Dashboard para comparar tarjetas y tablas. Prueba marcar, filtrar, desplegar días, editar o añadir un **frente ficticio**. «Reiniciar demo» recupera la muestra inicial; recargar también la reinicia. No introduzcas datos personales.

## Qué se simula y qué no

- Ocho frentes ficticios, con los tres estados, referencias presentes/ausentes, huecos, empates y un frente sin checks. Muestra finita **07/09–04/10/2026**, con «hoy» fijado en **04/10/2026, Europe/Madrid**: no usa el reloj actual. Períodos inclusivos de 7/14/28 días.
- Checks manuales en cualquier estado, sin cambiar ese estado. Un hueco no implica inactividad. Dashboard ordenado por frecuencia del período y último registro **global**; diario por creación. La búsqueda conserva la regla literal/ASCII del producto, sin eliminar acentos.
- Cambios **solo en memoria**. Los avisos dicen «Solo en esta maqueta; no guardado en la app». No hay sesiones, autenticación, `fetch`, almacenamiento local, cookies creadas por el código, service worker, API ni reintentos. No reproduce el protocolo de escrituras confirmadas: **no reutilizar su lógica para integrar el aspecto en la app**.
- El icono de referencia abre un diálogo con la URL como texto. No navega ni descarga material externo. Admite solo HTTP(S) y, por prudencia en esta muestra, rechaza URLs con usuario/contraseña. Esta restricción extra no modifica el contrato de la app.
- Formularios nativos con Escape/retorno de foco, estados de validación, nombres completos y controles de al menos 44 px. Referencia en espacio reservado: añadirla no agranda la tarjeta. Un check actualiza su nodo existente sin recolocar el scroll; abrir/cerrar calendarios no registra actividad.
- El gráfico decorativo de Neón se identifica como ilustrativo: no representa una puntuación, objetivo ni actividad inferida.
- Fuera de alcance: credenciales/flujo de acceso, paginación, sincronización, preferencias claro/oscuro/sistema, incertidumbre de red, React/componentes definitivos, integración, MCP, despliegue o elección final de estética.

## Comprobar

Entorno usado: macOS, Node **26.0.0**, Python **3.14.7**, Firefox instalado en `/Applications/Firefox.app`. No se descargan navegadores. El servidor estático solo necesita Python; no necesita npm ni el backend. La ejecución en otros sistemas/navegadores no está verificada.

Desde la raíz:

```sh
node --test experiments/cyberpunk-ui/sample.test.mjs
TZ=Pacific/Honolulu node --test experiments/cyberpunk-ui/sample.test.mjs
node --check experiments/cyberpunk-ui/app.mjs
node --check experiments/cyberpunk-ui/sample.mjs
node --check experiments/cyberpunk-ui/browser-check.mjs
node experiments/cyberpunk-ui/browser-check.mjs
```

El runner crea su propio servidor estático de loopback, puertos y perfil Firefox temporales; no inicia la app ni abre SQLite. Sirve solo los cinco recursos públicos de la maqueta. Al terminar cierra sus procesos y elimina el perfil. Guarda capturas y `evidence.json` en `test-results/`, ignorado como artefacto generado.

### Evidencia obtenida — 2026-10-05

- **9 pruebas Node pasan**, también en Honolulu: fechas finitas/inclusivas, porcentajes, ceros, último global, orden/empates, búsqueda, checks en los tres estados, reinicio, validación y conservación del historial. Sintaxis de los tres módulos comprobada.
- **Firefox real:** 46 capturas y comprobaciones geométricas en las tres propuestas y ambas vistas, con tamaños **320/390/768/1366/1920 px**, sin desbordamientos comprobados y con controles ≥44 px. Incluye calendarios, diálogos y un nombre largo con texto parecido a HTML, renderizado como texto.
- **30 pares concretos de texto/fondo ≥4,5:1.** No equivale a una auditoría completa de accesibilidad; no se han probado lectores de pantalla, Safari ni iPhone físico.
- Teclado/Espacio conserva el nodo, el foco visible y la posición de la fila; cambiar propuesta conserva los datos. Escape y foco del editor/referencia comprobados. Período nuevo cierra calendarios; los desplegables son independientes.
- **18 combinaciones de propuesta/vista/ancho** comparan el mismo frente sin referencia, con ella y con URL larga: mismas dimensiones. Checks en standby/archivado no cambian estado; crear un frente no marca actividad.
- En el recorrido comprobado: sin peticiones a API/auth/recursos externos, almacenamiento persistente ni errores JS/CSP. Recargar restaura la muestra. También se ejecutó el comando de servidor Python con puerto temporal y se comprobó el MIME de `.mjs`.
- La sesión principal conservó y completó el trabajo parcial del implementador al agotarse su tiempo, terminó estilos y ejecutó estas comprobaciones. No se atribuye test-first a los siete tests recibidos; la discrepancia inicial de búsqueda por acentos sí se reprodujo en rojo antes de corregirse. La revisión independiente señaló un caso límite: una URL Unicode podía superar el límite al normalizarse y bloquear su siguiente edición. Reproducido en rojo y corregido validando también la representación normalizada; regresiones Node y Firefox de rechazo/aceptación y reedición pasan. Seguimiento independiente cerrado con **PASS**, sin hallazgos accionables pendientes. Ambas revisiones fueron de lectura/capturas/código; sus ejecuciones de prueba corresponden a la sesión principal.
- La app estable conserva sus **63 archivos públicos de código/configuración comprobados por hash**; sus 149 tests, tipos y build se volvieron a ejecutar correctamente. No se abrió la base personal ni se cambió su esquema.

## Resultado y punto de parada

**Viable como laboratorio comparativo.** Hay tres propuestas utilizables y comprobadas localmente, no solo imágenes ni cambios de color. Que una estética convenza más sigue pendiente de la valoración del usuario. Ninguna se ha elegido o promovido a la aplicación real.

Siguiente paso: abrirlas, elegir una dirección o una combinación concreta y, solo con una petición explícita posterior, planificar su integración conservando el acceso, las escrituras confirmadas y las reglas del producto. No se inicia Workers/D1 ni se cambia el stack.
