# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro Nord. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `8c9435c`, [PR #4](https://github.com/Juancho1162/activity-hub/pull/4), Worker `a3d0a0ab-f6e4-432e-b0f3-e45be037f58e`. El código y la documentación están en [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), que GitHub muestra actualmente como público. Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

En curso: plantita animada y reorganización documental en `feature/plant-brand-and-readme`; todavía no publicado. No modifica datos, cuentas ni las reglas del registro.

## Trabajo

- [x] Verificar el nuevo logo y la documentación: pausado/teclado, movimiento reducido, enlaces, capturas y navegación a anchos móviles y de escritorio.
- [ ] Integrar la PR y publicar el artefacto verificado; comprobar la web y actualizar este estado y el historial.
- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Plantita y reorganización verificadas localmente, 2026-10-08.** `npm run release:prepare` pasa con 36 pruebas backend y 263 frontend, tipos/build, dry-run, ambos recorridos Firefox y Brave. La pausa funciona por teclado y conserva el estado al cambiar de idioma. Brave comprueba que el SVG servido cambia de frame y que movimiento reducido detiene movimiento y parpadeo; pausar/reanudar conserva el campo y autocompletado. Se mantienen 108 pares de contraste ≥4,5:1 y cuatro bordes ≥3:1. Capturas revisadas en acceso claro y dashboard oscuro a 1366/390/320 px. Revisión en la sesión principal, sin revisión independiente.

La regresión que prohibía cualquier imagen se adaptó para admitir exclusivamente el logo local; sigue rechazando imágenes inyectadas desde los nombres de frentes. Pasan la suite y la revisión de enlaces/conservación de documentación. Artefacto `build-993eb676-a7fc-4e93-bee0-152cd47cabd4`, huella ejecutable `fa796115438a100a07c9c5e91f209714fe8846bae883d95cf5397690dc074946`, hash `4f03505b2eee6097f526a7f19533a752f9826631e1b6aef3b3625c489cf55c40`.

Pendiente publicar y comprobar este artefacto contra producción. Las pruebas locales no acreditan dispositivos físicos, comodidad visual durante uso prolongado, coste alojado ni recuperación de D1.

## Siguiente paso

Completar las comprobaciones de la plantita y publicar mediante el workflow existente. En futuros cambios, actualizar este estado y añadir al historial solo la evidencia relevante; mantener el README como presentación y guía.
