# Jardín: grupos propios y vistas de actividad

Compara formas de reconocer la actividad de un vistazo manteniendo el Jardín.
Reglas aprobadas en [APP](../../docs/APP.md); estado en [STATUS](../../docs/STATUS.md).
Trabajo aislado sobre `origin/main` `51ce31d`, sin modificar el frontend ni backend
publicados. No se promueve ninguna propuesta automáticamente.

## Combinación elegida: grupos propios

[Abrir Jardín combinado](http://127.0.0.1:5175/?v=combinada): dashboard Matriz
y registro Semana, según la elección del usuario. «Tus grupos» permite crear
grupos y editar su nombre/icono; dos grupos con el mismo icono siguen separados
por ID. El editor de frentes permite cambiar de grupo conservando el historial.
Registrar/Deshacer actúan exclusivamente sobre el grupo elegido.

Ejemplos básicos editables: **Personal, Proyectos, Aprendizaje, Salud y
Creatividad**, con 15 frentes y 60 días ficticios, incluidos días sin actividad.
Café no aparece en su selector. Los grupos vacíos son válidos; se pueden llenar
desde el registro. No se incluye eliminación de grupos en este ensayo.

Su estado usa `activity-garden-custom-groups-v1`, separado de las tres propuestas
anteriores. No se importan ni migran sus datos. Los modelos originales y los
recorridos anteriores siguen disponibles; la matriz y controles compartidos se
reutilizan respetando la identidad por ID de los nuevos grupos.

## Tres propuestas originales

| Propuesta | Pregunta que permite probar | Entrada |
| --- | --- | --- |
| Matriz | ¿Se reconocen mejor los patrones cruzando grupos y días y desplegando sus frentes? | <http://127.0.0.1:5175/?v=matriz> |
| Semana | ¿Es más claro leer cada día con sus grupos y entrar a registrar desde él? | <http://127.0.0.1:5175/?v=semana> |
| Panorama | ¿Sirve un mapa del período con resúmenes por grupo para entender el conjunto? | <http://127.0.0.1:5175/?v=panorama> |

[Galería](http://127.0.0.1:5175/) · [Comparación simultánea](http://127.0.0.1:5175/?compare=1).
Las tres usan los mismos 18 ejemplos iniciales, cinco grupos y 60 días ficticios.
Cada una ofrece registro por icono, alta/edición de frentes, selección de fecha,
búsqueda y períodos de 7, 14 y 30 días. Los períodos iniciales son distintos para
mostrar la idea de cada propuesta; se pueden igualar para comparar cifras.

Registrar un grupo añade solo los frentes abiertos pendientes de ese día.
Conserva los registros previos y excluye pausa/archivo. Deshacer retira únicamente
lo añadido por esa operación; una edición posterior o actualización desde otra
pestaña descarta ese Deshacer. Con búsqueda activa, la acción de grupo se desactiva
para evitar registrar frentes ocultos. El registro individual sigue disponible.
Cambiar un icono mueve todo el historial de ese frente a su nuevo grupo.
Los gráficos son de consulta: abren un detalle con acceso al registro del día.
«Días activos» cuenta la unión de días; «Registros» cuenta pares frente/día.
El dashboard incluye historial de todos los estados y aplica los filtros visibles.

## Ejecutar y comprobar

Node **26**, dependencias ya instaladas de `frontend/` (React, Vite y Lucide).
No se añaden dependencias. Desde la raíz del repositorio:

```sh
node experiments/icon-groups/run.mjs
node experiments/icon-groups/run.mjs build
node --test experiments/icon-groups/src/model.test.mjs
node --test experiments/icon-groups/src/custom-model.test.mjs
node experiments/icon-groups/browser-check.mjs
node experiments/icon-groups/custom-browser-check.mjs
```

En este Mac, anteponer `PATH=/opt/homebrew/opt/node@26/bin:$PATH` si Node 26 no es
el predeterminado. El servidor escucha exclusivamente en `127.0.0.1:5175`, con
puerto estricto, y no inicia API ni base de datos. El check de navegador requiere
el servidor activo y Brave instalado en `/Applications/Brave Browser.app`;
usa un perfil desechable y deja capturas en `test-results/` (ignorado, igual que
`dist/`). No usa tu perfil ni tus cuentas. Ctrl+C detiene únicamente este servidor.

## Evidencia y límites

Combinada: 22/22 pruebas del modelo correctas (RED inicial 18 fallos/4 pases),
build correcto y smoke Brave correcto a 1440/768/390/320 px. Verificados grupos
con icono repetido sin mezcla, crear/renombrar/cambiar icono, mover frente con
historial, grupos vacíos, registro/Deshacer por ID, recarga, búsqueda de espacios,
estados, nombres largos, límites de fecha, foco/diálogos y reinicio independiente;
sin peticiones de cuenta ni externas. Capturas revisadas. Las regresiones de las
tres propuestas originales pasan tras extraer los componentes compartidos.
Revisión independiente PASS tras corregir el plegado de filas por ID, con
regresión RED/GREEN para abrir/cerrar por separado dos grupos con el mismo icono.
Ambos recorridos completos y el build final pasan después de esa corrección.

Verificado en macOS con Node 26.0.0: build Vite correcto y 24/24 pruebas del modelo
correctas (RED inicial de 19 fallos por comportamiento ausente; GREEN posterior).
Smoke Brave correcto a 1440/390/320 px: totales, detalle sin escritura, teclado,
registro/Deshacer, fecha pasada y rechazo de futuro, búsqueda, cambio de icono
con historial, pausa/archivo, persistencia, nombres de 200 caracteres, fecha mínima,
reinicio independiente y ausencia de peticiones externas o de cuentas. Capturas
revisadas. También correcto a 768 px y con claves futuras. Revisión independiente
PASS tras corregir la búsqueda formada solo por espacios: regresión RED/GREEN
que mantiene visible un frente de una sola palabra antes del registro en bloque.

Resultado técnico: las tres propuestas son utilizables para comparar el flujo.
El usuario elige dashboard Matriz y registro Semana para la combinación implementada,
con grupos personalizados independientes que pueden repetir icono.
El alcance sigue siendo probar esa combinación local: no es una sustitución completa de la app.

Los ejemplos originales se guardan sin cifrar en `localStorage`, separados por
`activity-icon-groups-v1-matriz`, `activity-icon-groups-v1-semana` y
`activity-icon-groups-v1-panorama`; la combinada usa la clave propia descrita arriba
y tampoco cifra ejemplos. Reiniciar afecta solo a la propuesta abierta.
No hay cuentas reales, sincronización con el servidor, enlaces de frentes, papelera,
traducciones ni tema oscuro. No se ha ensayado Safari o iPhone físico. La señal de
otra pestaña actualiza la demo, pero esto no implementa el control de concurrencia
de la aplicación cifrada. La futura integración deberá reutilizar su escritura
transaccional y sus contratos de datos; no trasladar este almacenamiento de demo.
