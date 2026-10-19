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
IP/túnel que `doapparg.site`. Idealmente protegelo con Cloudflare Access o una
contraseña para que no sea público.

## Cómo se usa el día a día

1. En GitHub → **Actions** → "Deploy to Staging" → **Run workflow** (elegí la rama).
2. Se despliega a `staging.doapparg.com`. Probalo.
3. Si está OK, recién ahí mergeás/pusheás a `master` (eso dispara el deploy a prod).

> Mientras no hagas esta preparación, el workflow de staging simplemente no se usa —
> no afecta en nada al deploy de producción.
