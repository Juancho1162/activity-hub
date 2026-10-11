# Tres versiones locales de Activity Hub

Experimento solicitado el 2026-10-11, basado en `origin/main` / `05eb58a`.
Referencia funcional: [producto y reglas](../../docs/APP.md). No modifica el
frontend principal, API ni configuración de publicación.

**Pregunta:** ¿qué aportan tres composiciones distintas al registro diario,
la corrección de varios días y la lectura del historial? React y CSS con las
dependencias y fuentes locales existentes.

| Versión | Estética | Experimento funcional |
| --- | --- | --- |
| Jardín | Crema, salvia, tarjetas, plantita | Semana seleccionable y modo enfoque |
| Órbita | Oscuro y lavanda | Matriz semanal editable y resumen |
| Cuaderno | Papel, serif y terracota | Calendario mensual y filtro sin registro |

**Dirección elegida por el usuario: Jardín.** Refinada con tarjetas más legibles,
última fecha registrada, historial de 14 días con acceso al detalle, una columna
en móvil y muestra interactiva en la portada. «Ver historial» abre el calendario
mensual del frente: cada día pasado se puede marcar/desmarcar sin cambiar la
fecha de la vista principal. El mes actual usa desde el día 1 hasta hoy como
período; los meses pasados usan el mes completo. El intervalo aparece con año.
Se conservan la paleta, plantita, navegación y datos locales existentes.

Cada versión incluye portada, creación/edición de frentes, estados,
búsqueda, perspectiva de 7/14/30 días e historial navegable de 14 días.
Un check por frente/día, hoy en Madrid, sin escritura en fechas futuras;
los porcentajes incluyen todos los días del período y no son puntuaciones.
Cambiar de estado conserva los checks. Reiniciar pide confirmación.

## Ejecutar

Node **26**, npm y las dependencias del frontend. Desde la raíz:

```sh
npm --prefix frontend ci
node experiments/local-lab/run.mjs
```

- Galería: <http://127.0.0.1:5174/>
- Jardín: <http://127.0.0.1:5174/?v=jardin>
- Órbita: <http://127.0.0.1:5174/?v=orbita>
- Cuaderno: <http://127.0.0.1:5174/?v=cuaderno>
- Añadir `&view=portada` abre la portada de cada versión.
- Portada original: <http://127.0.0.1:5173/>. Comparación solo del frontend;
  `/app/` necesita el backend del desarrollo normal, que aquí no se inicia.

Ambos puertos deben estar libres. Ctrl+C detiene los dos servidores.
En este Mac, si el shell selecciona otro Node, anteponer
`PATH=/opt/homebrew/opt/node@26/bin:$PATH` al comando.

## Verificación

```sh
node --test experiments/local-lab/src/model.test.mjs
node experiments/local-lab/run.mjs build
# Con los servidores encendidos; requiere Brave instalado en macOS.
node experiments/local-lab/browser-check.mjs
npm --prefix frontend test
npm run build
```

2026-10-11: 8 pruebas del modelo, 264 del frontend original y ambos builds
correctos. Brave con perfil temporal a 1440, 390 y 320 px: marcar/desmarcar,
recargar, crear/editar/cambiar estado, buscar, períodos, historial, enfoque,
filtro sin registro, reset confirmado y portadas. Sin desbordamiento horizontal
de la página; la matriz se desplaza dentro de su contenedor. Sin errores de
consola ni peticiones a API, autenticación o servidores externos en las demos.
Capturas en `test-results/`, ignoradas por Git. Regresiones adicionales: nombres
de 100 caracteres en historial móvil, carga de más de 200 frentes y fechas
cercanas al año 0001. El selector comienza el 0001-02-01 para que sus ventanas
de hasta 30 días no desborden el límite inferior del calendario.
La iteración Jardín añade comprobaciones del calendario mensual, febrero
bisiesto, persistencia y aislamiento por frente, foco y Escape, navegación de
meses sin escrituras, nombres largos en el detalle móvil y consistencia entre
portada interactiva y app. Las otras versiones conservan sus datos. Revisión independiente aprobada,
sin hallazgos pendientes en esta iteración.

## Alcance y conclusión

**Viables como demostraciones locales interactivas.** La preferencia estética
y la utilidad frente a la app actual quedan para la evaluación del usuario.
No se ha medido una mejora de productividad.

Datos ficticios **sin cifrar**, en claves `activity-lab-v1-*` independientes por
versión. Solo para probar. No sincroniza pestañas simultáneas ni dispositivos;
si el navegador bloquea el almacenamiento se avisa y funciona en memoria.
No incluye login/cifrado, Papelera, inglés ni selector de tema por versión.
No se probaron Safari/iPhone físico ni Firefox para este experimento.
No hay nuevas dependencias, commits, push, merge ni despliegue.

El punto de parada es comparar estas tres propuestas. Incorporar una elección
al producto requiere otro cambio con integración y pruebas completas.
