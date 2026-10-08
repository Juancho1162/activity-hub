# Referencia secundaria: Python + SQLite

Esta es la implementación anterior de Activity Hub. JavaScript + Workers/D1 es la principal; la [especificación](../../docs/APP.md) y el [estado de trabajo](../../docs/STATUS.md) están separados del README de presentación. Python se conserva para comparación, pruebas de equivalencia y consulta, sin arrancarse desde el comando principal.

## Qué se conserva

`activity_hub/`, las tres migraciones Alembic, los 102 tests, `dev.py`, `alembic.ini`, `pyproject.toml` y `requirements.lock` se trasladaron desde la raíz. Las reglas de dominio, acceso, consultas y replays no se reescribieron. Los cambios de Python se limitan a rutas de herramientas/datos y al intérprete utilizado por sus tests de subprocess.

- FastAPI 0.142.2, Pydantic 2.13.5, SQLAlchemy 2.1.3, Alembic 1.20.0 y Uvicorn 0.54.0; resolución original conservada.
- Python 3.14 de la `.venv/` de la raíz se mantiene donde estaba, para no romper sus ejecutables. No se reinstaló ni es necesario para usar la app principal.
- El frontend sigue siendo el oficial, `../../frontend/`. El lanzador secundario arranca Vite directamente y especifica su puerto API; no invoca el nuevo `npm run dev` principal.
- El destino SQLite predeterminado sigue siendo **`data/activity.sqlite3` de la raíz del workspace**, y las rutas relativas de `ACTIVITY_HUB_DB_PATH` conservan ese mismo anclaje. No se movió, abrió ni migró esa base durante el traslado.
- `admin.py` sigue siendo un aviso no operativo: no crea, rota ni recupera códigos.

## Ejecutar las pruebas de referencia

Desde la raíz del workspace:

```sh
.venv/bin/python -B -W error -m unittest discover -s experiments/python-sqlite/tests -t experiments/python-sqlite
```

**Resultado tras el traslado: 102 pruebas pasan**, incluidas las siete del lanzador, subprocesos Alembic, cuentas, sesiones, datos/reintentos por cuenta, rollback/concurrencia y fechas Madrid. Los tests crean sus propias bases y puertos temporales; no acceden a la SQLite habitual. El backend JavaScript importa esta referencia solo en sus fixtures diferenciales y de medición.

## Arranque secundario explícito

Desde la raíz, solo si se desea ejecutar la versión Python:

```sh
./experiments/python-sqlite/dev.py
```

Web en `http://127.0.0.1:5173`, API en `127.0.0.1:8000`; `Ctrl+C` detiene ambos. Conserva los overrides `ACTIVITY_HUB_API_PORT` y `ACTIVITY_HUB_WEB_PORT`, con validación de puertos y sin detener procesos ajenos. La base debe tener su esquema preparado; el arranque no migra ni genera códigos.

Para una **base ficticia nueva**, usar una ruta absoluta propia y migrar desde esta carpeta:

```sh
cd experiments/python-sqlite
ACTIVITY_HUB_DB_PATH=/tmp/activity-hub-python-demo.sqlite3 ../../.venv/bin/python -m alembic upgrade head
ACTIVITY_HUB_DB_PATH=/tmp/activity-hub-python-demo.sqlite3 ./dev.py
```

Son recetas optativas; no se ejecutaron sobre la base del usuario. Las migraciones históricas mantienen su función: `0003` conserva el verificador del propietario anterior y sus datos, revoca sesiones del protocolo antiguo y no asigna filas legacy a nuevos registros. No hay downgrade destructivo automático.

Python y D1 tienen cuentas e historiales independientes. En loopback sus cookies tienen el mismo nombre y host: para comparar ambas versiones simultáneamente, usar perfiles de navegador separados evita que un login sustituya la cookie de la otra. La promoción no implementa sincronización ni una transferencia de datos.

## Documentación histórica

[RENDER.md](RENDER.md) conserva la investigación anterior de alojamiento, precios, discos, CLI y recuperación. Sus fechas y límites originales se mantienen; no es la configuración principal ni un despliegue ejecutado. Las decisiones actuales de producto se consultan en [APP.md](../../docs/APP.md); el estado y trabajo futuro, en [STATUS.md](../../docs/STATUS.md).
