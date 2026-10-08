# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `9bb1bf0`, [PR #10](https://github.com/Juancho1162/activity-hub/pull/10), versión `bfbbb0bd-a208-4139-9e24-4efb0d68b5ea`. El código y la documentación están en [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), que GitHub muestra actualmente como público. Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

La portada `/` presenta el producto y permanece pública siempre; `/app/` abre el
acceso privado y `/presentacion/` sirve la demo de 5 escenas y 10 beats. La landing
reutiliza identidad, temas e idiomas de la app. Sus ejemplos son ilustrativos y
no consulta cuentas ni actividad. Las slides se mantienen en
`presentations/product-demo/`, con build independiente incluido en cada publicación.

## Trabajo

- [ ] Retirada de slides implementada y verificada; pendiente integrar y publicar.
  Sin enlaces ni build público; código independiente conservado y direcciones
  anteriores redirigidas a la landing. `release:prepare` correcto con 37 pruebas
  backend, 264 frontend y recorridos Firefox/Brave. Revisión en la sesión principal.

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Landing y presentación verificadas y publicadas, 2026-10-08.** `npm run verify`
pasa con 37 pruebas backend y 264 frontend, tipos/build, recorridos de cifrado y
UI en Firefox, autocompletado y geometría en Brave, y los 10 beats de Beatdeck
hacia delante, atrás y desde URL. QR a `/app/`, presentador conectado, cero errores,
diferencias o peticiones remotas en las slides. `npm run release:prepare` correcto.

El recorrido público en Brave verifica landing con cookie, cero peticiones auth/API
y cero escrituras, español/inglés, preferencias tras recarga, claro/oscuro y
anchos 1366/390/320, plantita/pausa/movimiento reducido, CTA al acceso y presentación
con navegación/recarga bajo CSP. La app privada conserva sus recorridos y comprobación
geométrica a 11 anchos entre 320 y 1366 px. Capturas de la landing y hoja de contacto
de las slides revisadas. Revisión independiente con rol reviewer: PASS, sin hallazgos
accionables; inspección estática y visual, sin ejecución propia de pruebas.

Artefacto `build-0f703f4a-c5be-470f-8459-1ab0346cfb53`, huella ejecutable
`2a68935641a84752d9c944c79767662eaf8a08b2b0f3437ac7f5014805997eaa`, hash
`340e8b56cd7c538e09626694e0133b9e713664975a734d71256b36b004828512`.
No hay cambios de API, autenticación, cifrado o migraciones. El motor y dependencias
de Beatdeck conservan el lock de la presentación original; no se añaden librerías
al frontend de la app. `App.tsx` y la lógica privada son idénticos a la base;
el acceso solo añade un enlace seguro a la landing.

La evidencia de la publicación anterior se conserva en [CHANGELOG](../CHANGELOG.md).
`npm run release:deploy` publicó desde main limpio. El smoke comprueba las tres
páginas/CSP, salud, 401/no-store y rechazo de alta sin CAPTCHA. Los 33 archivos
públicos coinciden byte por byte con el artefacto. Brave contra producción pasa
ES/EN, claro/oscuro a 1366/390/320 px, preferencias tras recarga, ausencia de
peticiones privadas en landing/slides y recorrido landing → presentación con
beats/recarga → acceso → landing. Capturas remotas revisadas. No se crearon cuentas
ni actividad; el recorrido de navegador bloqueó todas las escrituras.

GitHub confirma PR #10 integrada, sin checks de CI ni revisiones remotas; la revisión
independiente citada es la del agente local. Las pruebas no acreditan Safari/iPhone
físico, comodidad durante uso prolongado, coste alojado ni recuperación de D1.

## Siguiente paso

El incremento solicitado está terminado. Para la siguiente mejora, mantener el
workflow de rama, pruebas, revisión, PR y despliegue verificado.
