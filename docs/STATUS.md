# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro Nord. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `c2c6fac`, [PR #6](https://github.com/Juancho1162/activity-hub/pull/6), Worker `32a7f030-272a-488e-a149-738ecaa6068f`. El código y la documentación están en [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), que GitHub muestra actualmente como público. Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

Verificados localmente: oscuro cálido alineado con la paleta clara y la plantita, logo junto al nombre en acceso/navegación y favicon simplificado. Pendientes integración y despliegue; la publicación vigente sigue siendo la anterior. El README presenta la aplicación; APP conserva las reglas, este documento mantiene el estado y CHANGELOG registra las publicaciones anteriores.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Oscuro cálido y marca ampliada verificados localmente, 2026-10-08; publicación pendiente.** `npm run release:prepare` pasa con 36 pruebas backend y 263 frontend, tipos/build, dry-run y los recorridos Firefox/Brave. Se mantienen 108 pares de contraste ≥4,5:1 y cuatro bordes ≥3:1. Capturas revisadas en acceso claro/oscuro, dashboard y editor a 1366/390/320 px; la plantita y el nombre quedan alineados sin solapamientos. El favicon se revisa a 16/32/64/128 px en ambos fondos. Autocompletado, idiomas, pausa y movimiento reducido siguen funcionando. Tick dibujado en el primer frame (4/5/4 ms). Revisión en la sesión principal, sin revisión independiente.

Artefacto `build-ed388471-ff7b-49ed-9a43-aaf4ca08fc21`, huella ejecutable `d7b9b139cf4331b16376aa4cb5f50b09ca2a82bc7bb8a9e0dbc13d12d975298c`, hash `2cedfed0f9540c26a70ca514431d408b8f4a162e7ce8dd43b4a224299d05ec6c`. Se verifican 66 enlaces/anclas locales y la conservación literal de los registros anteriores. La versión remota anterior conserva su verificación en [CHANGELOG](../CHANGELOG.md); las comprobaciones remotas del nuevo artefacto siguen pendientes.

Las pruebas locales no acreditan dispositivos físicos, comodidad visual durante uso prolongado, coste alojado ni recuperación de D1.

## Siguiente paso

Integrar la PR del oscuro cálido y la marca ampliada, publicar desde main limpio y comprobar la web remota; registrar la revisión y versión publicada aquí y en CHANGELOG. Mantener el README como presentación y guía.
