# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `fbcea9e`, [PR #8](https://github.com/Juancho1162/activity-hub/pull/8), versión `e38b4c39-1a8a-480a-b4e5-df65c45c3d8e`. El código y la documentación están en [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), que GitHub muestra actualmente como público. Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

Publicado y verificado: oscuro cálido alineado con la paleta clara y la plantita, logo de 96 px en acceso y 64 px en navegación junto al nombre, y favicon simplificado con URL versionada. El README presenta la aplicación; APP conserva las reglas, este documento mantiene el estado y CHANGELOG registra las publicaciones anteriores.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Oscuro cálido y marca ampliada verificados y publicados, 2026-10-08.** `npm run release:prepare` pasa con 36 pruebas backend y 263 frontend, tipos/build, dry-run y los recorridos Firefox/Brave. Se mantienen 108 pares de contraste ≥4,5:1 y cuatro bordes ≥3:1. Capturas revisadas en acceso claro/oscuro, dashboard y editor a 1366/390/320 px; la plantita y el nombre quedan alineados sin solapamientos. El favicon se revisa a 16/32/64/128 px en ambos fondos. Autocompletado, idiomas, pausa y movimiento reducido siguen funcionando. Tick dibujado en el primer frame (4/5/4 ms). Revisión en la sesión principal, sin revisión independiente.

Artefacto `build-ed388471-ff7b-49ed-9a43-aaf4ca08fc21`, huella ejecutable `d7b9b139cf4331b16376aa4cb5f50b09ca2a82bc7bb8a9e0dbc13d12d975298c`, hash `2cedfed0f9540c26a70ca514431d408b8f4a162e7ce8dd43b4a224299d05ec6c`. Se verifican 66 enlaces/anclas locales y la conservación literal de los registros anteriores; detalle de publicaciones en [CHANGELOG](../CHANGELOG.md).

`npm run release:deploy` publicó desde main limpio. Web/CSP, salud, 401/no-store y rechazo sin CAPTCHA pasan; los ocho archivos públicos coinciden byte por byte con el artefacto. Brave contra producción comprueba paleta cálida, favicon servido con URL nueva, logo de 96 px junto al nombre, pausa/reanudación, frames del SVG y movimiento reducido sin parpadeo; idiomas, autocompletado/foco, layout a 320/390/1366 px y preferencias tras recarga pasan. No se han creado cuentas ni actividad. GitHub confirma cero workflows, main sin protección y ninguna revisión/CI en la PR.

Las pruebas no acreditan dispositivos físicos, comodidad visual durante uso prolongado, coste alojado ni recuperación de D1.

## Siguiente paso

El incremento solicitado está terminado. Para la siguiente mejora, seguir el workflow de ramas, pruebas, revisión, PR y despliegue verificado. Mantener aquí el estado actual, CHANGELOG para el historial y el README como presentación y guía.
