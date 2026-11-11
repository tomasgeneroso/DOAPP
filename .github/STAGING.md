# Staging — cómo dejarlo funcionando (una sola vez)

**Qué es:** una copia del sitio, privada, en `staging.doapparg.com`, para probar
cambios en un servidor real **antes** de tocar el sitio de verdad. Si algo se
rompe, se rompe en staging y nadie se entera.

El workflow ya está listo (`.github/workflows/staging.yml`) — solo se activa a mano
(botón **Run workflow** en GitHub → Actions) o pusheando a una rama `staging`.
Falta la preparación de una vez en el servidor.

Se usa la **misma VPS** que producción (no hace falta pagar otro servidor). La app
de staging corre en el puerto **3002** y con su propia base de datos.

## Pasos (una sola vez, en el VPS por SSH)

```bash
# 1. Copia del código para staging
sudo mkdir -p /var/www/doapp-staging
sudo chown $USER:$USER /var/www/doapp-staging
git clone https://github.com/tomasgeneroso/DOAPP.git /var/www/doapp-staging
cd /var/www/doapp-staging

# 2. Base de datos de staging (separada de la real)
sudo -u postgres createdb doapp_staging

# 3. Config: copiá el .env de prod y cambiá la base + puerto
cp /var/www/doapp/.env .env
#   editá .env — la base de staging se dice en DOS lugares y tienen que ser la misma:
#     DB_NAME=doapp_staging  DB_USER=<usuario de staging>  DB_PASSWORD=<su clave>   (los lee la app)
#     DATABASE_URL=postgres://<usuario>:<clave>@localhost:5432/doapp_staging         (la leen las migraciones)
#     APP_ENV=staging  PORT=3002  RLS_ACTIVO=true  (si estás probando RLS)
#   Si DB_NAME queda en "doapp" (la real), la app NO arranca: server/config/guardaDeStaging.ts.
nano .env

# 4. Dependencias + build + migraciones + arranque
npm install --legacy-peer-deps
npm run build:client
NODE_ENV=production npx sequelize-cli db:migrate
pm2 start ecosystem.staging.config.cjs
pm2 save
```

## nginx para staging.doapparg.com

Creá `/etc/nginx/sites-enabled/doapp-staging` (copiá el de prod y cambiá 3 cosas:
`server_name`, `root`, y el puerto del backend a `3002`). Mínimo:

```nginx
server {
    server_name staging.doapparg.com;
    root /var/www/doapp-staging/dist/spa;
    index index.html;
    client_max_body_size 50M;

    location /api      { proxy_pass http://localhost:3002; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection 'upgrade'; }
    location /socket.io { proxy_pass http://localhost:3002; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; }
    location / { try_files $uri $uri/ /index.html; }

    listen 443 ssl;
    ssl_certificate     /etc/letsencrypt/live/doapparg.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/doapparg.com/privkey.pem;
}
```

Después: `sudo nginx -t && sudo systemctl reload nginx`.

## DNS / Cloudflare

Agregá en Cloudflare un registro para `staging` (subdominio) apuntando a la misma
IP/túnel que `doapparg.com`. Idealmente protegelo con Cloudflare Access o una
contraseña para que no sea público.

## Paridad con producción (desde 2026-11-09)

Staging tiene que recorrer **el mismo camino** que producción: si no, lo que se prueba ahí no prueba nada («en staging andaba»). Por eso:

- **Mismas puertas antes de desplegar** que `ci-cd.yml`: tipos del servidor, orden de hooks de React, secretos en el código, migraciones desde cero y build. Además corre las pruebas de lógica como *informe* (no bloquea todavía).
- **Mismo guion en el servidor**: guarda el commit anterior, mueve el código, instala, construye, migra, para y arranca el proceso de cero, espera hasta 3 minutos que levante, confirma 60 segundos de estabilidad y, si algo falla, **vuelve solo al commit anterior** (las migraciones no se deshacen).
- **Misma configuración de PM2**: `ecosystem.staging.config.cjs` es la de producción con otro nombre, carpeta, puerto, registros y `APP_ENV=staging`.
- Lo vigila `tests/paridadDeStaging.test.ts` (parte de `npm test`): **falla si los dos se separan**. Un cambio de comandos se hace en `ci-cd.yml` y en `staging.yml`.

**Qué NO se iguala (a propósito):** los secretos y los datos. Staging usa **claves de prueba** (Mercado Pago `TEST-…`, correo de prueba) y su propia base `doapp_staging`. Nunca se copian las claves ni los datos de producción a staging: hay datos personales de personas reales, y un pago o un correo de prueba no pueden llegar a nadie de verdad.

### Chequear la paridad (en el servidor, solo lee)

```bash
cd /var/www/doapp-staging
npx tsx server/scripts/paridadDeEntornos.ts
```

Compara **nombres** de variables de los dos `.env` (nunca los valores), el commit de cada carpeta y las migraciones aplicadas en cada base. Dice qué le falta a staging (por ejemplo una variable nueva que producción ya tiene) y qué corregir. Se corre solo al final de cada deploy de staging. Si falta una variable, agregala al `.env` de staging con un valor **de prueba**.

## Cómo se usa el día a día

1. En GitHub → **Actions** → "Deploy to Staging" → **Run workflow** (elegí la rama), o pusheá a una rama `staging`.
2. Se despliega a `staging.doapparg.com`. Probalo.
3. Mirá la última parte del deploy («Paridad con producción»): no tiene que quedar nada por corregir.
4. Si está OK, recién ahí mergeás/pusheás a `master` (eso dispara el deploy a prod) o promovés desde staging.

> Mientras no hagas esta preparación, el deploy de staging lo avisa y termina sin fallar —
> no afecta en nada al deploy de producción.
