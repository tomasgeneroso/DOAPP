#!/usr/bin/env bash
#
# Mueve producción al commit exacto que staging probó.
#
# Se invoca desde la instancia de staging (server/services/deployInfo.ts), que
# ya validó que quien aprieta el botón es el dueño, que puso la contraseña de
# acción, y que el SHA que manda es el que staging está corriendo de verdad.
# Este script no vuelve a preguntar nada: hace, o corta.
#
# La regla que justifica todo el mecanismo: **se promueve un commit, no una
# rama**. Si producción hiciera `git pull origin master`, lo que se probó y lo
# que se publica serían dos artefactos distintos —master puede haber avanzado
# entre una cosa y la otra— y el staging no habría servido para nada.
#
# Uso:  bash scripts/promote-to-prod.sh <sha-de-40-hex>

set -Eeuo pipefail

SHA="${1:-}"
# Dónde vive producción. Se puede pisar desde el .env de staging si algún día
# cambia, pero el valor por defecto es el que hay hoy en el VPS.
PROD_DIR="${PROD_DIR:-/var/www/doapp}"
PROD_PM2="${PROD_PM2:-doapp}"

paso() { printf '\n=== %s\n' "$*"; }
morir() { printf '\nABORTADO: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Comprobaciones antes de tocar nada
# ---------------------------------------------------------------------------

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || morir "El primer argumento tiene que ser un SHA de git de 40 hexadecimales."
[[ -d "$PROD_DIR/.git" ]] || morir "$PROD_DIR no es un repositorio git. No hay forma verificable de moverlo a un commit."

cd "$PROD_DIR"

# El entorno de producción es el que lee de SU .env. Se descartan las variables de configuración que haya
# heredado este proceso (si lo lanzó staging, son las de staging): dotenv NO pisa variables ya definidas, así
# que sin esto las migraciones y el reinicio de pm2 (--update-env) usarían la base, el puerto y las claves de
# staging. deployInfo.ts ya lo lanza con un entorno mínimo; esto cubre que lo lance otra cosa.
for variable in $(compgen -e | grep -E '^(DB_|DATABASE_URL$|DEV_DATABASE_URL$|TEST_DATABASE_URL$|PORT$|APP_ENV$|NODE_ENV$|JWT_|ENCRYPTION_KEY$|MERCADOPAGO_|SMTP_|REDIS_URL$|CLIENT_URL$|SERVER_URL$|CORS_|DIDIT_|WHATSAPP_|GOOGLE_|FACEBOOK_)' || true); do
  unset "$variable"
done

# Lo que producción está corriendo ahora. Es lo que hay que poder deshacer si
# esto sale mal, así que se imprime antes que nada y queda en el registro.
ANTERIOR="$(git rev-parse HEAD)"
paso "Producción está en $ANTERIOR"
paso "Se promueve a         $SHA"

if [[ "$ANTERIOR" == "$SHA" ]]; then
  paso "Producción ya está en ese commit. No hay nada que hacer."
  exit 0
fi

# Cambios sin commitear en producción: alguien editó archivos en el servidor.
# Pisarlos sin avisar es cómo se pierde un arreglo de urgencia que nadie subió.
if [[ -n "$(git status --porcelain)" ]]; then
  paso "Hay cambios sin commitear en $PROD_DIR:"
  git status --short
  morir "Alguien editó archivos directamente en producción. Resolvelo a mano antes de promover."
fi

# ---------------------------------------------------------------------------
# Traer el commit y verificar que existe de verdad
# ---------------------------------------------------------------------------

paso "Trayendo objetos del remoto"
git fetch --quiet origin

git cat-file -e "${SHA}^{commit}" 2>/dev/null || morir "El commit $SHA no existe en el remoto. ¿Está pusheado?"

# ---------------------------------------------------------------------------
# Mover, construir, migrar, reiniciar
# ---------------------------------------------------------------------------

paso "Moviendo el árbol de trabajo"
git checkout --quiet --detach "$SHA"
git rev-parse HEAD

paso "Instalando dependencias"
npm install --legacy-peer-deps --no-audit --no-fund

paso "Construyendo"
npm run build

# Las migraciones van DESPUÉS del build y ANTES del reinicio: si el build falla,
# la base todavía no se tocó y producción sigue sirviendo la versión anterior.
paso "Migraciones"
npx sequelize-cli db:migrate

paso "Reiniciando $PROD_PM2"
pm2 restart "$PROD_PM2" --update-env

# ---------------------------------------------------------------------------
# Verificar que quedó arriba
# ---------------------------------------------------------------------------

paso "Esperando a que responda"
ARRIBA=0
for _ in $(seq 1 30); do
  # 3001: el puerto de producción (ecosystem.config.cjs). Con 5000 el chequeo daba "no responde" después de un
  # deploy bueno, y el mensaje de abajo sugiere volver atrás.
  if curl -fsS --max-time 5 "http://127.0.0.1:${PROD_PORT:-3001}/api/health" >/dev/null 2>&1; then
    ARRIBA=1
    break
  fi
  sleep 2
done

if [[ "$ARRIBA" -ne 1 ]]; then
  paso "No respondió en 60 segundos. Últimas líneas del log:"
  pm2 logs "$PROD_PM2" --lines 40 --nostream || true
  morir "Producción quedó en $SHA pero no responde. Para volver atrás: cd $PROD_DIR && git checkout --detach $ANTERIOR && npm run build && pm2 restart $PROD_PM2"
fi

paso "Listo. Producción en $SHA"
paso "Para volver atrás: cd $PROD_DIR && git checkout --detach $ANTERIOR && npm install --legacy-peer-deps && npm run build && pm2 restart $PROD_PM2"
