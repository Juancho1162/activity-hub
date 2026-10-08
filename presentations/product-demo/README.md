# Activity Hub · demo de producto

Presentación breve en castellano: **5 escenas, 10 beats (incluida la espera inicial)**.
Problema, uso y valor, con la paleta clara, tipografía 8-bit y plantita de Activity Hub.
Pensada para unos 2–3 minutos; el ritmo lo marca cada clic.

Estas slides se conservan en `presentations/product-demo/` como material
independiente. No están enlazadas, compiladas ni publicadas por la web de Activity
Hub. La landing explica el producto; el acceso privado está en `/app/`.
El QR conduce al acceso publicado. Se conserva el diseño aprobado del deck
original (`285f7fc`) y el motor Beatdeck sin cambios.

Los comandos siguientes se ejecutan desde esta carpeta. Sus dependencias son
opcionales para desarrollar o publicar la aplicación.

```sh
npm ci                 # solo al instalar de nuevo; necesita internet
npm run present        # compila y abre http://127.0.0.1:4173
```

**→** avanza · **←** retrocede · **P** abre las notas del presentador · **O** muestra
el índice · **F** pantalla completa · **B** apaga la imagen · **1–5** salta a una escena.
La URL conserva la posición: `#3.2` muestra el check marcado.

## Editar con codexdev, pi o pidev

Desde esta carpeta abre cualquiera de tus agentes:

```sh
codexdev
# o bien:
pi
# o tu perfil de ingeniería:
pidev
```

En Codex puedes invocar `$building-a-beatdeck`. En pi/pidev:
`/skill:building-a-beatdeck`. También puedes pedirlo en lenguaje natural:

> Ajusta esta demo de Activity Hub. Mantenla breve y con la estética de la app.
> Usa reference/activity-hub como fuente y verifica todos los beats.

La skill upstream está instalada en `~/.agents/skills/building-a-beatdeck` y
Pi/pidev tienen enlaces a esa misma copia en sus respectivas carpetas `skills/`.
Codexdev la descubre mediante la raíz estándar de Codex; no necesita cambios en
su lanzador. La skill estará disponible en el siguiente turno de Codex; si tu
sesión de pi ya estaba abierta, usa `/reload` o abre una nueva.
También queda una copia en `skills/building-a-beatdeck/` para este proyecto.

Esta integración sirve para **crear y editar presentaciones**. El conector MCP
que permitiría gestionar datos de Activity Hub desde pi sigue pendiente en el producto.

## Contenido y comprobaciones

- `deck/scenes.ts`: guion, notas y fuentes de cada beat.
- `deck/scenes/`: composición de las cinco escenas.
- `deck/deck.css`: estética de Activity Hub; `deck/assets/`: fuente y plantita.
- `deck/deck.config.ts`: título y URL real del QR.
- [Contenido y decisiones](docs/CONTENT-AUDIT.md), [uso en directo](docs/RUNBOOK.md)
  y [estado/verificación](docs/STATUS.md).

```sh
npm run dev            # edición: http://127.0.0.1:5173
npm run build          # tipos, bundle y control de recursos offline
npm run verify         # navegación, imágenes, layout, QR y presentador
npm run shot -- 3.2 4.2 # capturas rápidas; inicia su servidor automáticamente
```

`npm run verify` utiliza Chromium de Playwright (instalado), o Chrome/Edge.
En otro equipo: `npx playwright-core install chromium`. Como alternativa puedes
indicar Brave con `BEATDECK_BROWSER='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`.
Las capturas y el informe quedan en `artifacts/verify/`, ignorados por Git.

La presentación funciona sin conexión una vez instalada y compilada; **visitar
la app desde el QR sí requiere internet**. El calendario y los frentes son ejemplos
ilustrativos, sin conexión a cuentas ni escrituras en Activity Hub. La plantita
procede de la versión local, que las fuentes aún marcan como pendiente de publicar.

Motor y skill: [Beatdeck 0.5.1](https://github.com/borjaperfra/beatdeck), revisión
`329a971303bedd3eeaae7c5216317fafdf2ef6a3`. Motor sin modificaciones. MIT en `LICENSE`;
fuente Press Start 2P con licencia en `deck/assets/OFL.txt`.

Para actualizar el motor en el futuro, revisa primero `npm run upgrade -- --dry-run`.
`npm run upgrade` actualiza el motor de esta presentación, **no la skill global**;
reinstala esa skill por separado si deseas actualizarla. Conserva y revisa la salida
antes de aceptar cambios; después ejecuta `npm install`, build y verify.
