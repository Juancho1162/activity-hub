# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Último código publicado: `63df8df`, [PR #12](https://github.com/Juancho1162/activity-hub/pull/12), versión `0b3dcfe3-1b1a-47f4-b353-24935ebf68b2`. El código y la documentación están en [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub), que GitHub muestra actualmente como público. Sin GitHub Actions, protección de main ni despliegue automático. La referencia Python y los laboratorios visuales siguen en `experiments/`; no sirven la aplicación publicada.

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

**Retirada de la presentación verificada y publicada, 2026-10-08.**
`npm run release:prepare` pasa con 37 pruebas backend y 264 frontend, tipos/build,
recorridos de cifrado y UI en Firefox, autocompletado y geometría en Brave, y dry-run.
La regresión HTTP falló antes del cambio y pasa después. El recorrido público
comprueba ausencia de enlaces a slides, redirección de URL antigua con beat,
ES/EN, claro/oscuro, preferencias tras recarga y anchos 1366/390/320. Conserva
plantita, pausa, movimiento reducido y CTA al acceso. Capturas revisadas.
Revisión en la sesión principal, sin revisión independiente para este ajuste acotado.

Artefacto `build-126c58c8-13e6-4d37-af2e-375c61b8db19`, huella ejecutable
`51aea5eaa7417b1db8a8ce64caec4b826f644fa82e72e54950ce8c4a78b6740b`, hash
`6981eae84d1cf451cdbaeda014cf4b98a60406de72f81e806998f88f71d6c36a`.
No hay cambios de API, autenticación, cifrado, migraciones o dependencias.
La presentación conserva su código y verificación independiente, fuera de la
publicación web; no se modificó su diseño ni motor.

`npm run release:deploy` publicó desde main limpio. El smoke comprueba landing,
acceso/CSP, redirecciones antiguas, salud, 401/no-store y rechazo de alta sin CAPTCHA.
Los 12 archivos públicos coinciden byte por byte con el artefacto. Brave contra
producción pasa ES/EN, claro/oscuro a 1366/390/320 px, preferencias tras recarga,
ausencia de peticiones privadas en la landing y recorrido acceso → landing.
Las URLs antiguas, incluidos recursos y enlace con beat, vuelven a la portada.
Captura remota revisada. No se crearon cuentas ni actividad; el recorrido de
navegador bloqueó todas las escrituras.

GitHub confirma PR #12 integrada, sin checks de CI ni revisiones remotas.
La evidencia anterior se conserva en [CHANGELOG](../CHANGELOG.md). Las pruebas no
acreditan Safari/iPhone físico, comodidad durante uso prolongado, coste alojado
ni recuperación de D1. Registro posterior de documentación sin otro despliegue.

## Siguiente paso

El incremento solicitado está terminado. Para la siguiente mejora, mantener el
workflow de rama, pruebas, revisión, PR y despliegue verificado.
