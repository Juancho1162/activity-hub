# Estado de Activity Hub

Última actualización: 2026-10-11. [Producto y reglas](APP.md) · [Historial de cambios](../CHANGELOG.md) · [Operación y publicación](../backend/README.md#flujo-de-cambio-pruebas-y-publicación).

## Ahora

**Solo Jardín en la web (en curso):** petición posterior a la PR #22. Se retira
el selector de diseño de portada, acceso y cuenta; `appearance=classic` deja de
activar la interfaz anterior. El código y la comparación experimental local se
conservan. Sin cambios de autenticación, datos o backend de producción.
Pendientes: verificación completa, revisión e integración/publicación.
Comprobar enlaces antiguos y ausencia de selector en el artefacto normal; las
regresiones de la interfaz anterior usan explícitamente el bundle experimental.

La siguiente evidencia corresponde a la publicación anterior:

**Jardín verificado para publicación:** portada y app por defecto en el build
estándar, con selector «Anterior» que conserva sesión y datos. Iconos cifrados,
semana, enfoque, mes editable y guía descartable. Las cuentas nuevas reciben
cuatro ejemplos sin actividad, cifrados y guardados junto con el alta; sobreviven
a recargar antes de entrar. Las cuentas anteriores no reciben ejemplos. Se
conservan los runners y bases locales. Sin migraciones ni dependencias nuevas.

`npm run verify` pasa: 42 pruebas backend, 306 frontend, tipos/build e integración
y UI Firefox/Brave. El runner experimental también pasa y el modelo de la galería
suma 8 pruebas correctas. `npm run release:prepare` valida y congela el artefacto.
Revisión independiente PASS sin hallazgos pendientes. Integración y publicación
autorizadas; la [PR #22](https://github.com/Juancho1162/activity-hub/pull/22)
recoge el commit, build automático, versión activa y smoke remoto, sin otra
publicación solo para actualizar esta evidencia.

Premortem del lanzamiento: (1) que el build remoto siga sirviendo la UI antigua →
probar los entrypoints estándar; (2) alta parcial o recarga pierda ejemplos →
transacción cuenta/cifrado y pruebas de recarga/fallos; (3) cuentas existentes o
concurrencia pierdan datos → contratos antiguos, CAS e integración con dos
cuentas/pestañas; (4) controles locales o secretos lleguen a assets/Git → revisar
artefacto y archivos incluidos; (5) merge no equivalga a despliegue correcto →
seguir el commit en Cloudflare y ejecutar smoke remoto. Sin doble despliegue manual.

Los siguientes apartados conservan la evidencia de las etapas locales anteriores;
la promoción de arriba sustituye su restricción de publicación y su límite de
ejemplos en memoria.

**Portada Jardín, solo local (verificado):** `/` en 8791 muestra «Dale espacio a
lo que crece», la planta, muestra interactiva y tres pasos del experimento elegido.
«Empezar» y «Ya tengo cuenta» abren la app real Jardín. Portada anterior disponible
con `?appearance=classic` y el selector; build normal conserva su entrada.
Ejemplos solo en memoria, sin autenticación ni datos privados. Build experimental,
`browser-check.mjs` y `npm --prefix frontend run build` (tipos y Vite) correctos.
Smoke Worker/D1/Brave desechables verifica teclado/reinicio, CTA sin alta automática,
cero peticiones privadas con/sin cookie y cuenta cifrada intacta después de usar
la muestra. ES/EN, ambos temas y 1440/768/390/320 px sin desbordamiento; capturas
revisadas. También pasan los recorridos anteriores de app, iconos y bienvenida.
Revisión independiente PASS sin hallazgos. La batería general anterior no se ha
repetido para este incremento de portada aislado. Sin publicación ni cambios en
la base local persistente; Safari/iPhone físico sigue pendiente.

**Bienvenida Jardín, solo local (verificado):** las altas nuevas empiezan con
Leer, Proyecto A, Proyecto B y Aprender algo, abiertos, editables, con iconos y
sin actividad marcada. Guía de tres pasos con «No volver a mostrar»; cerrarla o
terminarla guarda el descarte cifrado. «Guía rápida» permite volver a consultarla.
Las cuentas existentes y el alta del build normal conservan su comportamiento.
Solo un signup confirmado permite inicializar ejemplos: un único commit cifrado
con CAS evita duplicados y nunca los repone tras borrarlos. El descarte usa el
bloqueo/reintento existente y combina cambios concurrentes sin sobrescribirlos.
Pruebas nuevas RED/GREEN; `npm run verify` final correcto: 37 pruebas backend,
303 frontend, tipos/build/dry-run e integración/UI Firefox y Brave. Smoke Jardín
con Worker/D1 desechables correcto: ejemplos sin checks, cierre con respuesta
perdida, reintento, recarga/reentrada, guía manual, eliminación de ejemplos y
funciones anteriores. Capturas revisadas a 1440/390/320 px, ES/EN y ambos temas.
Revisión independiente aprobada tras resolver la recuperación de una lectura
fallida al reautenticar con la guía abierta; regresión y recorrido real correctos.
Límite del ensayo: recargar entre el alta y la primera inicialización pierde
la elegibilidad en memoria; la cuenta permanece válida y vacía. No se añaden
identificadores/códigos a almacenamiento del navegador ni cambios en backend.

**Iconos por frente, solo local (verificado):** catálogo de 12 iconos en
Nuevo/Editar frente de Jardín, elegido por el usuario. Se muestran en registro,
dashboard, papelera e historial mensual y se guardan en el documento cifrado.
Campo opcional compatible con frentes anteriores; editar sin cambiar el icono
lo conserva, también desde la interfaz clásica. Claves futuras desconocidas
usan una planta visual y conservan su valor. Sin cambios de esquema D1 ni datos
de producción. Cinco pruebas nuevas fallaron antes de implementar; 47 pruebas
focalizadas y smoke Brave cifrado correctos, incluido selector a 320/390 px,
restauración y entrada de nuevo. `npm run verify` completo correcto: 37 pruebas
backend, 278 frontend, tipos/build/dry-run e integración/UI Firefox y Brave.
Revisión independiente del incremento aprobada, sin hallazgos. Disponible en
`http://localhost:8791/app/?appearance=garden`; sin publicación.

**Jardín con funciones reales, solo local (verificado):** el usuario autoriza
integrar la presentación elegida manteniendo la anterior. El [nuevo runner](../experiments/jardin-real/README.md)
sirve ambas en `http://localhost:8791/app/`, con selector de diseño y una única
sesión/cuenta local. Reutiliza acceso, cifrado, CRUD, dashboard, papelera,
restauración, borrado confirmado, ES/EN y temas; añade semana, enfoque e historial
mensual editable. Base persistente independiente e inicialmente vacía; sin acceso
a producción ni importación de cuentas. Los prototipos y sus datos siguen intactos.
`npm run verify` completo correcto: 37 pruebas backend, 273 frontend,
tipos/build/dry-run e integración/UI Firefox y Brave. Smoke experimental con
Worker y D1 reales desechables correcto: misma cuenta/IDs/checks entre diseños,
corrección mensual visible en dashboard anterior, enlaces, papelera/restauración,
borrado confirmado, cierre/entrada, cifrado y ausencia de nombres/código en las
peticiones. Capturas revisadas a 1440/390/320 px, ES/EN y ambos temas. Revisión
independiente aprobada, sin hallazgos. Safari/iPhone físico pendiente.
Premortem aplicado: evitar dos
gestores de escritura, impedir cambios contra snapshots de otro mes, conservar
solicitudes inciertas y ocultar contenido al perder acceso; pruebas específicas
cubren esos casos. No publicar ni eliminar la interfaz anterior.

**Laboratorio local solicitado, 2026-10-11:** [Jardín, Órbita y Cuaderno](../experiments/local-lab/README.md)
exploran tres estéticas con portada y registro interactivo: enfoque diario,
matriz semanal y calendario/diario. Galería en `http://127.0.0.1:5174/`, portada
de main en `http://127.0.0.1:5173/`; datos ficticios independientes por versión.
Trabajo aislado en `experiments/local-lab/`, basado en `origin/main` `05eb58a`.
8 pruebas del modelo, 264 del frontend original, ambos builds y smoke Brave
a 1440/390/320 px correctos. Revisión independiente aprobada tras corregir
fechas extremas, carga de más de 200 frentes y nombres largos en móvil.
El usuario elige **Jardín**: refinadas las tarjetas, registro móvil en una columna,
historial mensual editable por frente y muestra interactiva en portada.
Calendario, persistencia, febrero bisiesto, foco, nombres largos y aislamiento
entre versiones comprobados en Brave. Revisión independiente de esta iteración
aprobada, sin hallazgos; conserva los datos guardados y la identidad elegida.
Ninguna propuesta se promueve a producción automáticamente. Sin cambios en API, dependencias o despliegue.

«Crear cuenta» tiene el mismo ancho, alto y tamaño de texto que «Entrar»,
conservando su color. Prueba local aceptada; geometría/color comprobados en Brave
a 320, 390 y 1366 px, ES/EN y ambos temas. `npm run verify` pasa: 37 pruebas
backend, 264 frontend, tipos/build/dry-run e integración/UI Firefox/Brave.
Diff revisado en la sesión principal, sin hallazgos. Integración y publicación
autorizadas; la [PR #21](https://github.com/Juancho1162/activity-hub/pull/21)
registra el build y la comprobación remota. Ajuste de CSS, sin cambios de comportamiento.

Workers Logs y trazas habilitados en la configuración de `production`, con logs
de invocación y persistencia de ambos en el panel; observabilidad local deshabilitada.
`npm run verify` pasa el 2026-10-09: 37 pruebas backend, 264 frontend,
tipos/build/dry-run e integración/UI Firefox/Brave. Diff revisado en la sesión
principal, sin hallazgos. Integración y publicación autorizadas; el resultado
del build automático, la configuración activa y el smoke remoto se registran en
la [PR #20](https://github.com/Juancho1162/activity-hub/pull/20) para evitar otro despliegue solo por documentación.

La [web](https://activity-hub.software-juancho-prego-gundin.workers.dev) permite registrar actividad por frente y día, consultar porcentajes/calendarios por período y gestionar una Papelera recuperable con borrado permanente confirmado. Interfaz 8-bit con plantita humanoide animada y pausa accesible, adaptable a móvil, castellano/inglés con detección del navegador, tema claro y oscuro cálido con verde hoja y terracota. Código fijo por cuenta y contenido cifrado en el navegador, CAPTCHA, máximo inicial de 100 cuentas y límites de uso.

Cloudflare Builds está conectado a [Juancho1162/activity-hub](https://github.com/Juancho1162/activity-hub): cada push a `main`, incluso de documentación, compila y publica. Configuración: raíz `backend`, Node 26, entorno `production`, sin previews. El build remoto no ejecuta la batería de pruebas ni migraciones. Sin GitHub Actions ni protección de main.

La portada `/` presenta el producto y permanece pública siempre; `/app/` abre el
acceso privado. La landing reutiliza identidad, temas e idiomas de la app. Sus
capturas muestran la app real con datos ficticios, en ES/EN y claro/oscuro; no
consulta cuentas ni actividad. Hay un único «Empezar» y «Ya tengo cuenta» junto al
texto principal, sin acceso duplicado en cabecera ni bloque final de llamada a la acción. Las slides y los experimentos anteriores se retiraron del repositorio; permanecen en el
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

La tipografía de landing y aplicación ha sido aceptada tras la prueba local:
Chakra Petch en textos/controles y Press Start 2P en marca/títulos principales.
Fuentes locales con licencia y capturas de ejemplo actualizadas. La integración
con los cambios actuales de `main` está verificada y revisada en la
[PR #18](https://github.com/Juancho1162/activity-hub/pull/18). Merge y publicación
autorizados; la evidencia del despliegue automático se registra en esa PR.

Fondo liso y brotes botánicos en los bordes de la captura de portada y la barra
lateral de escritorio, aceptados tras la prueba local. Las cuatro capturas públicas
se han regenerado sin barras de scroll; el generador las oculta solo en su navegador
de captura y comprueba que no ocupen espacio. La aplicación conserva su desplazamiento.
Integración y publicación autorizadas; la [PR #19](https://github.com/Juancho1162/activity-hub/pull/19) recoge el resultado
del build automático y las comprobaciones remotas.

## Trabajo

- [ ] MCP de Activity Hub: concretar autenticación antes de implementar el conector de pi; distinto del MCP de administración de Cloudflare disponible para desarrollo.
- [ ] Capacidad/coste bajo carga, copia externa y restauración: pendientes de validar.
- [ ] Safari/iPhone físico: pendiente.
- [ ] Información/LLM y notificaciones: diseño conservado en [APP.md](APP.md#6-ampliación-de-información-y-aprendizaje--diseño-aplazado), desarrollo aplazado. Modelos mentales siguen separados.

## Verificación vigente

**Promoción Jardín, 2026-10-11.** Verificación completa de producción correcta:
42 backend y 306 frontend; Firefox prueba dos cuentas/pestañas, cifrado,
concurrencia, respuestas perdidas, cierre y recarga. Brave comprueba portada,
selector, tutorial, iconos, recuperación de sesión, historial y funciones previas;
ES/EN, claro/oscuro y móvil/escritorio. La nueva regresión reproduce la pérdida de
ejemplos antes del arreglo y pasa después; también se prueba rollback real del
batch, colisiones, CAPTCHA y límites. El smoke del build normal verifica el vault
antes del primer login y recarga expresamente desde la pantalla del código.
El harness acepta el aviso de salida esperado; dos selectores nuevos se corrigieron
para usar el texto «Registro» y toda la batería se repitió con éxito.
Revisión independiente de fuentes/tests completa y capturas revisadas. Assets y
archivos Git sin controles locales, códigos, claves ni bases de prueba. El
resultado de publicación y pruebas remotas queda en la PR #22 enlazada arriba.

La siguiente evidencia corresponde a etapas anteriores:

**Integración Jardín local, 2026-10-11.** `node experiments/jardin-real/run.mjs check`
y `npm run verify` pasan. 37 pruebas backend y 273 frontend; suite existente de
integración/UI más smoke cifrado de Jardín. Las primeras 7 pruebas de Jardín
fallaron por comportamiento ausente antes de implementarlo; dos pruebas de
aislamiento/sesión se añadieron después. El smoke inicial detectó un handle D1
caducado al actualizar la configuración del fixture; corregida la prueba y
repetido el recorrido completo con éxito. Revisión independiente PASS sin
hallazgos. Servidor local `/health` y ambas presentaciones responden; la galería
5174 sigue disponible. Sin cambios de esquema, dependencias, cuentas de
producción, commits, push o publicación.

**Fondo y detalles botánicos verificados, 2026-10-09.** `npm run verify` pasa:
37 pruebas backend, 264 frontend, tipos/build/dry-run, integración cifrada Firefox
y UI Firefox/Brave en ES/EN, ambos temas y móvil/escritorio. `npm run release:prepare`
valida el artefacto y el destino con dry-run. Cuatro capturas regeneradas con datos
ficticios y comprobación de ausencia de barras. Revisión del diff y capturas en
la sesión principal, sin hallazgos ni revisión independiente adicional. Sin cambios
en API, datos, migraciones o dependencias. La evidencia de publicación se registra
en la [PR #19](https://github.com/Juancho1162/activity-hub/pull/19) para evitar otro
despliegue provocado solo por documentación.

**Tipografía de landing y aplicación verificada, 2026-10-08.** Prueba local
aceptada por el usuario. `npm run verify` pasa sobre el cambio conciliado con
`main`: 37 pruebas backend, 264 frontend, tipos/build/dry-run, integración
cifrada Firefox y UI Firefox/Brave en ES/EN, claro/oscuro y móvil/escritorio.
`npm run release:prepare` valida el artefacto y el destino de producción con
dry-run. Revisión independiente sin hallazgos; capturas revisadas y evidencia
documental final comprobada en la sesión principal. Sin cambios en API,
esquema, datos o paquetes. El build, versión activa y smoke posteriores al
merge se registran en la [PR #18](https://github.com/Juancho1162/activity-hub/pull/18).


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

Seguir el resultado de integración y despliegue en la [PR #22](https://github.com/Juancho1162/activity-hub/pull/22).
No queda desarrollo pendiente de Jardín. Los runners locales y sus datos siguen
disponibles; la interfaz anterior se conserva con el selector de diseño.
Las mejoras futuras y límites de verificación siguen en «Trabajo».
