# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Código funcional publicado: `63df8df`, [PR #12](https://github.com/Juancho1162/activity-hub/pull/12). Cloudflare Builds está conectado a [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub): cada push a `main`, incluso de documentación, compila y publica. Configuración: raíz `backend`, Node 26, entorno `production`, sin previews. El build remoto no ejecuta la batería de pruebas ni migraciones. Sin GitHub Actions ni protección de main. La referencia Python y los laboratorios siguen en `experiments/`; no sirven la aplicación publicada.

La portada `/` presenta el producto y permanece pública siempre; `/app/` abre el
acceso privado. La landing reutiliza identidad, temas e idiomas de la app. Sus
ejemplos son ilustrativos y no consulta cuentas ni actividad. Las slides quedan
como material independiente en `presentations/product-demo/`, sin enlaces ni build
público. `/presentacion` y sus subrutas redirigen a la landing.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Cloudflare Builds verificado contra GitHub, 2026-10-08.**
Build `a9d2db7c-4bbb-4709-a485-e10efecc96b9`, iniciado mediante API para
`main` en `7c631db`, terminado con `success`. Instalación con Node 26.11.1,
tipos/build y publicación correctos; versión `f3172b15-3b2b-4a30-a75b-1ee7f788c82d`
activa al 100 %. No hubo cambios ejecutables frente a `63df8df` ni migraciones.

`npm run release:smoke` pasa contra producción: landing, acceso/CSP,
redirecciones antiguas, salud, rutas privadas con 401/no-store y rechazo de alta
sin CAPTCHA. No se crearon cuentas ni actividad. Revisión de documentación en la
sesión principal, sin revisión independiente. La PR de configuración registra
además el resultado del build por push al integrar esta documentación.

La verificación funcional anterior (37 pruebas backend, 264 frontend y recorridos
Firefox/Brave) se conserva en [CHANGELOG](../CHANGELOG.md); no se repitió para este
cambio solo documental. Cloudflare recompila desde GitHub y no actualiza el
registro local `.release/last-deployment.json`. Safari/iPhone físico, coste bajo
carga y restauración de D1 siguen pendientes.

## Siguiente paso

Para la siguiente mejora, verificar y revisar antes de integrar la PR: el merge
en `main` activa producción. Comprobar el build remoto y ejecutar el smoke después.
