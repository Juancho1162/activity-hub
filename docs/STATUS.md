# Estado de Activity Hub

Última actualización: 2026-10-08. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Cloudflare Builds está conectado a [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub): cada push a `main`, incluso de documentación, compila y publica. Configuración: raíz `backend`, Node 26, entorno `production`, sin previews. El build remoto no ejecuta la batería de pruebas ni migraciones. Sin GitHub Actions ni protección de main.

La portada `/` presenta el producto y permanece pública siempre; `/app/` abre el
acceso privado. La landing reutiliza identidad, temas e idiomas de la app. Sus
capturas muestran la app real con datos ficticios, en ES/EN y claro/oscuro; no
consulta cuentas ni actividad. Hay un único «Empezar» y «Ya tengo cuenta» junto al
texto principal, sin acceso duplicado en cabecera ni bloque final de llamada a la acción. Las slides y los experimentos se han retirado del repositorio; permanecen en el
historial de Git. `/presentacion` y sus subrutas redirigen a la landing.

El enlace «Código fuente»/«Source code» de la cabecera, la limpieza de
slides/experimentos, el README en inglés y la licencia MIT están verificados en
la [PR #16](https://github.com/Juancho1162/activity-hub/pull/16). Integración y
publicación autorizadas; el resultado del build y del smoke se registra en esa
PR para evitar publicaciones adicionales solo por actualizar esta evidencia.
Se conservan los avisos de terceros.
Las pruebas de contratos usan resultados fijos capturados de Python antes de
retirarlo; ya no requieren ese runtime. La comparación histórica `measure` y
el comando de verificación de slides se han retirado.

El README presenta solo funcionalidades actuales; las ideas futuras siguen en
APP.md. El enlace al código fuente usa el logotipo oficial de GitHub, con licencia
Octicons conservada. Cambio verificado en la [PR #17](https://github.com/Juancho1162/activity-hub/pull/17),
con integración/publicación autorizadas y evidencia remota en esa PR.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**README centrado en el producto e icono GitHub verificados, 2026-10-08.**
`npm run verify` pasa: 37 pruebas backend, 264 frontend, tipos/build y dry-run,
recorridos de cifrado y UI en Firefox, autocompletado y geometría en Brave.
La landing pasa a 1366/390/320 px, en ES/EN y ambos temas. Los siete tests que
usaban Python pasaron antes de retirarlo y después con los mismos casos contra
resultados fijos capturados de la referencia del commit `942de0d`.
Enlaces locales y coherencia de manifiestos/lockfiles comprobados. Revisión
independiente de la limpieza, fixtures, README y licencia sin hallazgos;
actualización final de estado/historial revisada en la sesión principal.
El cambio de icono y README se revisó en la sesión principal, sin revisión
independiente adicional; capturas móviles y enlaces comprobados. La verificación
completa se repitió para la PR #17; su integración y despliegue se registran allí.

`node frontend/scripts/capture-landing.mjs` genera las cuatro imágenes desde la
app real con cuentas locales desechables, cuatro frentes y dos checks; no usa
cuentas de producción. No cambian API, autenticación, datos ni dependencias.
La última publicación anterior y su comprobación remota se registran en la [PR #15](https://github.com/Juancho1162/activity-hub/pull/15) para no encadenar builds solo al actualizar el commit documentado.

La evidencia anterior se conserva en [CHANGELOG](../CHANGELOG.md). Safari/iPhone
físico, coste bajo carga y restauración de D1 siguen pendientes.

## Siguiente paso

Para la siguiente mejora, verificar y revisar antes de integrar la PR: el merge
en `main` activa producción. Comprobar el build remoto y ejecutar el smoke después.
