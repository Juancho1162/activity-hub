# Estado de la presentación

Esta demo está integrada en Activity Hub, en `presentations/product-demo/`.
El estado vivo del proyecto, revisiones y publicación se mantienen en
[docs/STATUS.md de Activity Hub](../../../docs/STATUS.md).

La versión aprobada tiene 5 escenas y 10 beats en castellano. Conserva la
composición compacta, fuente 8-bit y plantita del deck original `285f7fc`.
El QR dirige al acceso privado en `/app/`. La web sirve su build en `/presentacion/`.

Para verificar cambios desde esta carpeta:

```sh
npm run build
npm run verify
```

Revisar `artifacts/verify/contact.png` y las capturas relevantes antes de cerrar
una modificación. Los artefactos generados se ignoran en Git.
