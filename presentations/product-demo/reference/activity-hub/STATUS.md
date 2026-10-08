# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro Nord. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `8c9435c`, [PR #4](https://github.com/Juancho1162/activity-hub/pull/4), Worker `a3d0a0ab-f6e4-432e-b0f3-e45be037f58e`. El código y la documentación están en el repositorio privado [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub). Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

En curso: plantita animada y reorganización documental en `feature/plant-brand-and-readme`; todavía no publicado. No modifica datos, cuentas ni las reglas del registro.

## Trabajo

- [ ] Verificar el nuevo logo y la documentación: pausado/teclado, movimiento reducido, enlaces, capturas y navegación a anchos móviles y de escritorio.
- [ ] Integrar la PR y publicar el artefacto verificado; comprobar la web y actualizar este estado y el historial.
- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

Publicación Nord/selector del 2026-10-08: `npm run release:prepare` pasó con 36 pruebas backend y 261 frontend, tipos/build, dry-run, ambos recorridos Firefox y Brave. 108 pares de contraste de texto/icono/superficie ≥4,5:1 y cuatro bordes de controles ≥3:1. Comprobaciones remotas de web/CSP, salud, 401/no-store y alta sin CAPTCHA correctas. Los seis archivos públicos coincidían con el artefacto; Brave contra producción comprobó idiomas, autocompletado/foco, tema, layout y recarga. Datos y perfiles de prueba temporales.

La verificación del logo nuevo está pendiente. Las pruebas locales no acreditan dispositivos físicos, comodidad visual durante uso prolongado, coste alojado ni recuperación de D1.

## Siguiente paso

Completar las comprobaciones de la plantita y publicar mediante el workflow existente. En futuros cambios, actualizar este estado y añadir al historial solo la evidencia relevante; mantener el README como presentación y guía.
