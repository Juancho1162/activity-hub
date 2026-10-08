# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Cloudflare Builds está conectado a [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub): cada push a `main`, incluso de documentación, compila y publica. Configuración: raíz `backend`, Node 26, entorno `production`, sin previews. El build remoto no ejecuta la batería de pruebas ni migraciones. Sin GitHub Actions ni protección de main. La referencia Python y los laboratorios siguen en `experiments/`; no sirven la aplicación publicada.

La portada `/` presenta el producto y permanece pública siempre; `/app/` abre el
acceso privado. La landing reutiliza identidad, temas e idiomas de la app. Sus
capturas muestran la app real con datos ficticios, en ES/EN y claro/oscuro; no
consulta cuentas ni actividad. Hay un único «Empezar» y «Ya tengo cuenta» junto al
texto principal, sin acceso duplicado en cabecera ni bloque final de llamada a la acción. Las slides quedan
como material independiente en `presentations/product-demo/`, sin enlaces ni build
público. `/presentacion` y sus subrutas redirigen a la landing.

Cambio local pendiente de publicar: enlace «Código fuente»/«Source code» al
repositorio público en la cabecera de la landing, adaptable a móvil. El proyecto
no tiene licencia general declarada; la MIT de la presentación corresponde a
Beatdeck y los avisos del frontend recogen licencias de terceros.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Enlace al código fuente verificado localmente, 2026-10-08.**
`npm run build`, `npm --prefix frontend test` (264 pruebas) y
`node frontend/tests/public-pages.mjs` pasan. Recorrido público en Brave a
1366/390/320 px, temas claro/oscuro e idiomas ES/EN; capturas revisadas en la
sesión principal. Sin revisión independiente ni publicación. No se ha ejecutado
`npm run verify` completo para este cambio de cabecera.

**Landing simplificada y capturas reales verificadas, 2026-10-08.**
`npm run verify` pasa: 37 pruebas backend, 264 frontend, tipos/build y dry-run,
recorridos de cifrado y UI en Firefox, autocompletado y geometría en Brave.
El recorrido público comprueba los dos enlaces de acceso sin duplicados, captura
real según tema/idioma, 1366/390/320 px, preferencias, plantita/movimiento reducido,
redirecciones y ausencia de consultas privadas. Capturas de escritorio y móvil
revisadas; revisión en la sesión principal, sin revisor independiente.

`node frontend/scripts/capture-landing.mjs` genera las cuatro imágenes desde la
app real con cuentas locales desechables, cuatro frentes y dos checks; no usa
cuentas de producción. No cambian API, autenticación, datos ni dependencias.
La publicación automática y su comprobación remota se registran en la [PR #15](https://github.com/Juancho1162/activity-hub/pull/15) para no encadenar builds solo al actualizar el commit documentado.

La evidencia anterior se conserva en [CHANGELOG](../CHANGELOG.md). Safari/iPhone
físico, coste bajo carga y restauración de D1 siguen pendientes.

## Siguiente paso

Para la siguiente mejora, verificar y revisar antes de integrar la PR: el merge
en `main` activa producción. Comprobar el build remoto y ejecutar el smoke después.
