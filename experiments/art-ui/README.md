# Estudio visual: surrealismo, impresionismo y Renacimiento

Experimento autorizado y aislado de la app y del [laboratorio cyberpunk](../cyberpunk-ui/README.md). La [especificación común](../../README.md) sigue siendo la referencia del producto.

## Pregunta y alcance

¿Podemos traducir tres movimientos artísticos a distribuciones y lenguajes de interfaz distintos, no solo paletas, sin dificultar el registro diario?

| Propuesta | Composición y lenguaje |
| --- | --- |
| **Surrealismo** | Navegación lateral en escritorio, arquitectura imposible, formas oníricas, registro asimétrico y dashboard de tarjetas. Controles estables: nada se mueve para dificultar pulsar. |
| **Impresionismo** | Navegación horizontal, paisaje de pinceladas, luz y superficies orgánicas. Registro en dos columnas en escritorio amplio y dashboard de tarjetas. |
| **Renacimiento** | Folio editorial, grabado arquitectónico al margen, serif y proporciones. Registro pautado y dashboard en forma de libro de cuentas en escritorio. |

Interpretaciones libres, no reproducciones de obras ni reconstrucciones históricas. Cuatro SVG originales y locales, tipografías del sistema y HTML/CSS/JavaScript sin instalaciones ni recursos externos. La ilustración es decorativa: no representa actividad, esfuerzo ni puntuaciones.

La muestra y sus nueve pruebas son copias idénticas de las verificadas en cyberpunk; el controlador y su runner se han adaptado a los nuevos conceptos. No se modifica aquel laboratorio ni se crea un framework compartido para una prueba visual. **No importar la lógica de simulación a la app real.**

## Abrir

Desde otra terminal, sin detener la app ni el laboratorio anterior:

```sh
cd /Users/juanchoprego/nomeborres/matrix/personal/activity-hub
.venv/bin/python -m http.server 5181 --bind 127.0.0.1 --directory experiments/art-ui
```

Abrir **<http://127.0.0.1:5181>**. No está incluido en `npm run dev`. Se sirve solo esta carpeta, no la raíz del proyecto. `Ctrl+C` detiene este servidor; si 5181 está ocupado, escoger otro puerto libre sin matar procesos ajenos.

- [Surrealismo](http://127.0.0.1:5181/?look=surrealismo&view=daily)
- [Impresionismo](http://127.0.0.1:5181/?look=impresionismo&view=daily)
- [Renacimiento](http://127.0.0.1:5181/?look=renacimiento&view=daily)

Cambiar de propuesta conserva la muestra en memoria. Probar **Diario / Dashboard**, filtros, checks, calendarios y editor. Recargar o pulsar reiniciar restaura la muestra. No introducir datos personales.

## Límites deliberados

- Ocho frentes ficticios y un intervalo finito: **07/09/2026–04/10/2026**. «Hoy» es el **04/10/2026 simulado**, en `Europe/Madrid`, no el reloj actual. Períodos inclusivos de 7/14/28 días; ceros y último registro global conservados.
- Estado manual; checks en abierto, standby y archivado sin cambiar el estado. Vacío significa sin actividad registrada. Orden diario por creación; dashboard por conteo del período descendente y creación para desempatar.
- **Solo memoria:** sin cuentas, autenticación, API, SQLite, almacenamiento persistente ni reintentos. La CSP bloquea conexiones y envío de formularios. Los parámetros de URL contienen únicamente propuesta/vista.
- Referencia con espacio propio de 44 px, sin alterar dimensiones del frente. Abre una vista de texto, **no visita la URL**. HTTP(S) y máximo 2048 caracteres antes/después de normalizar; esta muestra además rechaza credenciales incrustadas, sin cambiar el contrato de producción.
- Los cambios se anuncian como «Solo en esta maqueta; no guardado en la app». No equivalen a confirmación de escritura del servidor.
- Sin selección automática de un ganador, integración, cambio de stack, publicación ni eliminación de los experimentos anteriores.

## Verificar

Entorno ejecutado: **macOS, Node 26.0.0, Python 3.14.7 y Firefox 155.0.1 ya instalado**. No hay build ni dependencias de npm. El servidor estático usa la biblioteca estándar de Python; el runner de navegador usa Node/BiDi y `/Applications/Firefox.app/Contents/MacOS/firefox` con perfil y servidor temporales propios. No lee perfiles personales ni descarga navegadores.

Desde la raíz:

```sh
node --test experiments/art-ui/sample.test.mjs
TZ=Pacific/Honolulu node --test experiments/art-ui/sample.test.mjs
node --check experiments/art-ui/sample.mjs
node --check experiments/art-ui/app.mjs
node --check experiments/art-ui/browser-check.mjs
node experiments/art-ui/browser-check.mjs
```

### Evidencia obtenida

- **9 pruebas Node pasan**, también en Honolulu; tres comprobaciones de sintaxis correctas. Se reutiliza la cobertura existente, sin atribuirle TDD nuevo.
- Firefox: **46 capturas**, tres propuestas/dos vistas a **320/390/768/1366/1920 px**, más calendarios, nombres largos y diálogos. Sin desbordamiento en los elementos comprobados; controles visibles de al menos **44 px**. La primera fila diaria completa cabe en el viewport comprobado de **390×844** en las tres propuestas.
- **30 pares concretos de texto/fondo ≥4,5:1**. La prueba detectó 4,46:1 en texto secundario de Renacimiento; se oscureció el token y el pase completo quedó verde. No es una auditoría exhaustiva de accesibilidad.
- Check con Espacio conserva nodo, foco visible y posición; cambiar de propuesta conserva datos/nodos. Calendarios independientes, filtros, fechas finitas, estados, altas sin checks y reinicio comprobados. Diálogos nativos: Escape, foco y retorno al activador.
- **18 combinaciones** de propuesta/vista/ancho comparan dimensiones sin/con referencia y URL larga. El comparador admite menos de **0,001 px** de ruido numérico de `DOMRect` tras scroll, no crecimiento visible de filas/tarjetas.
- Entrada literal segura, URL ejecutable rechazada y referencia normalizada reeditable comprobadas. Sin solicitudes API/auth/externas, persistencia del navegador ni errores JS/CSP observados durante la ejecución.
- SVG parseados como XML; sin scripts, imágenes externas ni manejadores de eventos. Comando de servidor Python y tipos MIME de módulos/SVG verificados en un puerto temporal propio.
- **71 archivos públicos originales permanecen idénticos por hash**, incluidos fuentes/configuración de la app y el laboratorio cyberpunk. Cambios externos limitados al README común y a ignorar `experiments/art-ui/test-results/`. No se repitieron las suites Python/React ni el navegador de la app para esta prueba aislada.

Las capturas y `evidence.json` quedan en `experiments/art-ui/test-results/`, ignorado. Cada ejecución del runner regenera su evidencia y cierra solo sus procesos/perfil temporales. No deja un servidor de muestra arrancado.

**Revisión independiente cerrada: PASS, sin hallazgos accionables.** El revisor inspeccionó el diff, fuentes, runner, estructura/recursos SVG, evidencia y siete capturas; no ejecutó comandos. Las ejecuciones indicadas corresponden a la sesión principal. No se han probado Safari, iPhone físico ni lector de pantalla; no se afirma portabilidad verificada a otros sistemas. Las tipografías nativas pueden cambiar las medidas fuera del entorno comprobado.

## Conclusión y punto de parada

**Viable como comparación visual interactiva**, no como reemplazo listo para producción. Hay tres composiciones distintas y el registro se conserva utilizable en los tamaños comprobados; la preferencia estética pertenece al usuario. Implementación, verificaciones y revisión cerradas; no queda trabajo activo en este bloque. El siguiente paso es comparar/elegir. Cualquier integración en la app requiere una petición posterior explícita y debe preservar su autenticación, escrituras confirmadas e intenciones pendientes.
