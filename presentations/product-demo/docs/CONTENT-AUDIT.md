# Activity Hub — contenido y diseño

Demo de producto breve: problema, uso y valor. El usuario pidió claridad y concisión
(en lugar de 8 minutos) y estética como la propia app. Objetivo editorial: 2–3 minutos,
5 escenas y 10 beats, incluido standby; duración pendiente de ensayo.

## Fuentes

Copias de trabajo del 2026-10-08 en `reference/activity-hub/`: README, APP y STATUS.
Origen: `/Users/juanchoprego/nomeborres/matrix/personal/activity-hub`, rama
`feature/plant-brand-and-readme`, HEAD `8b8943442d1d5c5291e25662b50dc0622b726a20`,
con cambios locales. El estado identifica `8c9435c` como último código publicado.
No se ha cambiado ese proyecto ni comprobado su producción durante esta tarea.

Referencia visual: `design/index.css`, `design/charm.css`, `design/plant-logo.svg`.
Se reutilizan la paleta clara cálida, el verde musgo, el acento óxido, la tipografía
Press Start 2P, los marcos pixelados y la plantita de la versión local actual.
La plantita figura como pendiente de publicar en STATUS; no se afirma que esté
ya en producción. Su copia en `deck/assets/` es estática para que cada beat sea
reproducible y no distraiga; el original se conserva sin cambios en `reference/`.
Fuente original local y licencia OFL en `deck/assets/`; avisos originales en
`reference/activity-hub/design/THIRD_PARTY_NOTICES.md`. No se copian componentes de UI.

## Contenido → beats

| Fuente | Contenido | Beats | Tratamiento |
| --- | --- | --- | --- |
| README: introducción | Qué es y para qué sirve | 1.2 | Título y descripción, sin promesas nuevas |
| APP §2: frentes | Proyectos, estudios y aficiones; tres estados decididos por el usuario | 2.1–2.2 | Ejemplos ilustrativos, no datos de una cuenta |
| APP §2: registro | Un check por frente y día; corregir días pasados; Europe/Madrid | 3.1–3.2 | Demo visual simplificada del registro, rotulada como ejemplo |
| APP §2: dashboard; README: introducción | 4 días de 10 → 40 %; cada marca representa un día registrado | 4.1–4.2 | Ejemplo numérico de la especificación; calendario ilustrativo 1–10 octubre 2026. La explicación de los días vacíos queda en las notas, para responder si preguntan. |
| README: privacidad/acceso | Cifrado en navegador; código fijo sin recuperación | 5.1 | Resumen visible; límites del cifrado en notas |
| README: URL publicada | Probar Activity Hub | 5.2 | QR generado localmente; visitar la app sí requiere internet |

No hay capturas de cuentas, credenciales o datos personales. Guitarra, un curso y
un proyecto son ejemplos de las categorías de APP, no actividad real. Los días
marcados son ilustrativos: solo el cómputo 4/10 → 40 % viene de la especificación.
Las representaciones de Registro y Dashboard son esquemas con el estilo de la app,
no capturas ni réplicas interactivas completas.

Se omiten de pantalla el roadmap, arquitectura detallada, laboratorios, operaciones,
Papelera y opciones de idioma/tema para mantener la explicación breve. Las notas
recuerdan que pi/MCP e IA siguen pendientes, y que existen gestión de estados,
Papelera, móvil, castellano/inglés y temas. La presentación no pretende cubrir
cada regla de APP. No se inventan métricas de uso, testimonios, ahorro ni fechas.

## Decisiones y pendientes

- Enfoque y estética confirmados por el usuario; se elige la variante clara de la app.
- Toda la tipografía visible de las slides usa Press Start 2P, la fuente 8-bit
  local de la app, por petición del usuario. Tamaños e interlineados adaptados
  para títulos, textos, estados, fechas y porcentajes; sin negritas sintéticas.
- Plantita de la cabecera ajustada a 70 px de diseño por petición del usuario;
  todas las ilustraciones participan en la escala general.
- En la pantalla de espera, plantita y frase se centran sobre el mismo eje.
- Composición general al 75 % sobre el centro del escenario, con más margen;
  títulos, frases de apoyo y progreso centrados. Se conserva la fuente 8-bit.
  La reducción de títulos se aplica proporcionalmente al resto del contenido,
  incluidos tarjetas, iconos, espacios y cabecera. Los títulos conservan sus
  tamaños de diseño originales para evitar reducirlos dos veces.
  La plantita de cabecera mantiene 70 px de diseño (52,5 px tras esta escala).
- Tarjetas de actividades compactadas en las escenas Organiza y Registra,
  conservando sus centros y el resto de la composición ya aprobada.
- Ponente, evento y fecha sin confirmar: omitidos en pantalla.
- QR tomado de la URL publicada del producto, actualizado a `/app/` al integrar
  la landing según `docs/APP.md` de Activity Hub. El contenido y diseño de las
  slides aprobadas se conservan.
- Beatdeck en codexdev/pi/pidev permite crear slides; no instala el MCP del producto.
- Motor upstream sin modificaciones. Sin publicar web, crear cuentas ni modificar datos.
