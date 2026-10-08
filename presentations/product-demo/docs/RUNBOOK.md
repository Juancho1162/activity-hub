# Presentar Activity Hub

1. Desde la carpeta del proyecto, ejecuta `npm run present`.
2. Abre `http://127.0.0.1:4173/#1.1`. La plantita es la pantalla de espera.
3. Pulsa **P**; coloca las notas en tu pantalla y la presentación en el proyector.
   Ambas ventanas deben usar el mismo navegador y origen.
4. Pulsa **F** para pantalla completa. Un clic o **→** empieza la demo.

La charla tiene nueve beats de contenido, agrupados en cinco escenas:
qué es → organiza frentes → marca un día → consulta el dashboard → empieza.
Duración propuesta: 2–3 minutos. No hay pasos que avancen solos ni animaciones
ambientales; tú decides cuándo continuar.

| Tecla | Acción |
| --- | --- |
| →, ↓, PageDown o clic | Siguiente beat |
| ←, ↑, PageUp | Beat anterior |
| Espacio | Avanzar en pantalla completa |
| 1–5 | Ir a una escena |
| Home / End | Inicio / final |
| P | Presentador con notas |
| O | Índice de beats |
| F | Pantalla completa |
| B o . | Apagar/recuperar imagen |

Se puede recargar sin perder posición; `#4.2` muestra cómo leer las marcas del calendario.
`?reduced=1#1.1` reduce el movimiento. `?debug=1` activa el panel de diagnóstico;
no lo uses durante la charla. Si el presentador pierde conexión, vuelve a abrirlo
con P; conserva el mismo navegador, host y puerto en ambas ventanas.

El diseño está preparado en 1920×1080; otras proporciones añaden bandas sin
redistribuir la composición. `dist/` contiene la presentación compilada y puede
servirse desde cualquier servidor HTTP estático. No se abre con doble clic en
`dist/index.html`. En este equipo las dependencias ya están instaladas y la
presentación puede arrancar con `npm run preview` sin red.

El QR apunta a la URL publicada que consta en `deck/deck.config.ts`. La app necesita
internet. No introduzcas tu código privado durante una proyección: las slides
usan ejemplos y no necesitan iniciar sesión. Cambiar el contenido o la configuración
requiere compilar de nuevo antes de presentar.
