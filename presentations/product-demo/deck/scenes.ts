import type { SceneDef } from 'beatdeck';

export const SCENES: SceneDef[] = [
  { id: '01', title: 'Activity Hub', beats: [
    { name: 'Preparados', ref: 'Decisión de puesta en escena', source: 'Pantalla de espera.', note: 'La primera pulsación empieza la demo. Duración orientativa total: 2–3 minutos.' },
    { name: 'En qué estás metido', ref: 'reference/activity-hub/README.md · introducción', source: 'Activity Hub te ayuda a ver en qué estás trabajando y cómo evoluciona tu actividad.', note: '20 s. Proyectos, cursos, aficiones… Activity Hub reúne los frentes que tienes abiertos y los días en que trabajas en ellos. La plantita y la estética proceden de la versión local actual de la app.' },
  ] },
  { id: '02', title: 'Organiza', beats: [
    { name: 'Crea tus frentes', ref: 'reference/activity-hub/APP.md · §2', source: 'Inventario de frentes con nombre, enlace opcional y estado.', note: '15 s. Un frente es un proyecto, unos estudios o una afición. Estos nombres son ejemplos, no datos personales. Los materiales siguen en sus carpetas y webs.' },
    { name: 'Tú decides su estado', ref: 'reference/activity-hub/APP.md · §2 · estados', source: 'Abierto, standby y archivado. Pasar a standby o archivar no borra actividad registrada.', note: '15 s. Tú eliges qué sigue abierto, qué aparcas y qué cierras. La app no deduce abandono por falta de actividad. También permite Papelera y restauración.' },
  ] },
  { id: '03', title: 'Registra', beats: [
    { name: 'Elige el día', ref: 'reference/activity-hub/APP.md · §2 · registro diario', source: 'Hoy seleccionado por defecto, con posibilidad de elegir una fecha pasada.', note: '10 s. En Registro eliges el día. La fecha mostrada aquí es ilustrativa y permanece fija para que la presentación sea reproducible.' },
    { name: 'Marca un check', ref: 'reference/activity-hub/APP.md · §2 · checks', source: 'Un check por frente y día. Se pueden marcar y desmarcar checks de días pasados.', note: '20 s. Has trabajado en guitarra: marcas su check. Puedes corregir un día pasado o desmarcar un error. Las fechas se interpretan en Europe/Madrid. La demo es un esquema, no modifica ninguna cuenta.' },
  ] },
  { id: '04', title: 'Observa', beats: [
    { name: 'Ve tu actividad', ref: 'reference/activity-hub/APP.md · §2 · dashboard', source: '4 días marcados de 10 seleccionados → 40 %. No es una puntuación ni un objetivo.', note: '20 s. El dashboard muestra días registrados y calendarios. El denominador incluye todos los días del período, ambos extremos incluidos. El 4 de 10 es el ejemplo de la especificación; las fechas y posiciones de los checks son ilustrativas.' },
    { name: 'Reconoce tus días de actividad', ref: 'reference/activity-hub/README.md · Introducción y Qué puedes hacer', source: 'Organiza tus proyectos, estudios o aficiones en frentes y marca los días en los que trabajas en cada uno.', note: '15 s. Cada marca representa un día que has registrado en ese frente. El calendario permite ver cuándo le has dedicado tiempo. Si preguntan por los días vacíos: no tener registro no demuestra que no hubiera actividad. El porcentaje describe los checks, no puntúa el esfuerzo.' },
  ] },
  { id: '05', title: 'Empieza', beats: [
    { name: 'Sencillo y privado', ref: 'reference/activity-hub/README.md · Privacidad y acceso', source: 'El contenido se cifra en el navegador. Una cuenta, un código fijo; no hay recuperación.', note: '20 s. El contenido de frentes y actividad se cifra antes de enviarlo. El servidor conserva metadatos y bloques cifrados. Guarda el código: perderlo supone perder el acceso. Una web modificada maliciosamente podría capturarlo; no prometemos protección absoluta. Recargar pide el código de nuevo.' },
    { name: 'Tu primer frente', ref: 'reference/activity-hub/README.md · Empezar a usarla; STATUS.md', source: 'Abre la web, crea una cuenta, guarda el código y crea tu primer frente.', note: '15 s. Escanea para probarla. La web requiere internet; estas slides no. Hay móvil/escritorio, castellano/inglés y tema claro/oscuro. pi/MCP, correo e IA siguen pendientes: integrar Beatdeck en pi no implementa esas funciones del producto.' },
  ] },
];
