<p align="center">
  <img src="frontend/public/plant-logo.svg" width="96" height="96" alt="Plantita humanoide 8-bit de Activity Hub" />
</p>

<h1 align="center">Activity Hub</h1>

<p align="center">Tu registro de actividad, sencillo y privado.</p>

<p align="center">
  <a href="https://activity-hub.software-juancho-prego-gundin.workers.dev">Conocer Activity Hub</a> ·
  <a href="https://activity-hub.software-juancho-prego-gundin.workers.dev/app/">Abrir la aplicación</a> ·
  <a href="docs/STATUS.md">Estado del proyecto</a> ·
  <a href="CHANGELOG.md">Historial de cambios</a>
</p>

Activity Hub te ayuda a ver en qué estás trabajando y cómo evoluciona tu actividad. Organiza tus proyectos, estudios o aficiones en **frentes** y marca los días en los que trabajas en cada uno.

## Qué puedes hacer

- Crear frentes con nombre, enlace opcional y estado: abierto, standby o archivado.
- Registrar actividad de hoy o corregir días pasados con un check por frente y día.
- Consultar porcentajes y calendarios de cualquier período, con fechas visibles.
- Mover frentes a la Papelera, recuperarlos o eliminarlos para siempre con confirmación.
- Usar la misma web en móvil y ordenador, en castellano o inglés y con tema claro u oscuro.

Los porcentajes describen los días registrados dentro del período; no son una puntuación ni un objetivo. Un día vacío solo significa que no se ha registrado actividad.

## Empezar a usarla

1. Abre la [web](https://activity-hub.software-juancho-prego-gundin.workers.dev), pulsa **Empezar** y después **Crear cuenta**.
2. Completa la verificación y guarda el código privado en tu gestor de contraseñas. Confirma que lo has guardado para entrar.
3. Crea tu primer frente y marca su actividad desde **Registro**. Consulta su evolución en **Dashboard**.

Para volver a entrar, utiliza ese mismo código. **No hay recuperación: perder el código supone perder el acceso a los datos.** Cada cuenta empieza vacía y es independiente. Las fechas del registro se interpretan en `Europe/Madrid`.

## Privacidad

El contenido de tus frentes y tu actividad se cifra en el navegador antes de enviarse a Cloudflare D1. La clave de descifrado permanece en memoria de la pestaña; recargar exige introducir de nuevo el código. El servidor conserva metadatos de cuenta y sesión y bloques cifrados.

Esta protección impide leer el contenido directamente desde D1 o sus copias. Una web modificada deliberadamente para capturar el código podría comprometerlo. El navegador puede guardar tu código en su gestor de contraseñas si lo autorizas. [Detalles y límites](docs/APP.md#privacidad-y-acceso).

## Web y material de presentación

La portada `/` explica la aplicación y permanece pública aunque ya tengas cuenta.
Guarda `/app/` para acceder directamente. La web se centra en explicar el producto
y empezar a usarlo; no incluye una presentación adicional.

Las slides se conservan como material independiente en
[presentations/product-demo/](presentations/product-demo/README.md), fuera del
build y despliegue de la web. Su README explica cómo abrirlas o editarlas localmente.

## Desarrollo local

Necesitas **Node 26** y npm. Desde la raíz:

```sh
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run migrate
npm run dev
```

Abre **http://127.0.0.1:8787** para la landing, **http://127.0.0.1:8787/app/** para el acceso. La D1 local está separada de producción; las migraciones son explícitas y no importan cuentas ni historial. Tras modificar el frontend, reinicia `npm run dev` para recompilarlo.

React/TypeScript y Vite en el frontend; JavaScript, Cloudflare Workers y D1 en el backend. La plantita 8-bit es un SVG local, con animación que puedes pausar y respeto por movimiento reducido.

Antes de publicar código, el [workflow de desarrollo](backend/README.md#flujo-de-cambio-pruebas-y-publicación) exige rama, pruebas y revisión antes de integrar la PR en `main`: Cloudflare Builds compila y despliega automáticamente cada push a esa rama. El build remoto no ejecuta la batería de pruebas. `npm run verify` reúne las comprobaciones locales; los recorridos de navegador usan Firefox/Brave y perfiles temporales en macOS, y las pruebas diferenciales requieren la [referencia Python](experiments/python-sqlite/README.md). Para trabajar con las slides conservadas, sigue su README; sus dependencias y verificaciones son independientes.

## Documentación

- [Producto y reglas](docs/APP.md): comportamiento, privacidad, contratos y diseño futuro de Información/LLM y modelos mentales.
- [Estado del proyecto](docs/STATUS.md): capacidades publicadas, verificación vigente y trabajo pendiente.
- [Historial de cambios](CHANGELOG.md): cambios y publicaciones anteriores.
- [Backend y publicación](backend/README.md): comandos, entornos, migraciones y workflow de GitHub/Cloudflare.
- [Referencia Python](experiments/python-sqlite/README.md) y laboratorios [cyberpunk](experiments/cyberpunk-ui/README.md), [artístico](experiments/art-ui/README.md) y [8-bit](experiments/8bit-twist/README.md): implementaciones y pruebas conservadas en `experiments/`.
- [Créditos y licencias de terceros](frontend/THIRD_PARTY_NOTICES.md).

Correo, wiki mantenida por IA, chat, resúmenes y modelos mentales forman parte del diseño futuro. El producto disponible hoy es el registro de actividad; el [estado](docs/STATUS.md) distingue lo publicado de lo pendiente.
