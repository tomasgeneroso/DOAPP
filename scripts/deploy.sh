#!/usr/bin/env bash
#
# Manual production deploy — the same steps the CI workflow runs, in one place
# that lives in the repo instead of in someone's shell history.
#
#   sudo bash /var/www/doapp/scripts/deploy.sh
#
# Why this exists: the CI job (.github/workflows/ci-cd.yml) is the normal path,
# but when it is not running there was no written procedure, and deploys were
# improvised — which is how the server ended up with two checkouts, a backend
# running from one and nginx serving the other, drifting for weeks without
# anyone able to tell.
#
# It is deliberately noisy and refuses to run when something looks wrong: a
# deploy that silently does nothing is worse than one that stops and says why.

set -euo pipefail

DEPLOY_DIR="/var/www/doapp"          # canonical checkout: CI deploys here, PM2 runs here
STALE_DIR="/var/www/doapparg"        # old checkout kept around; nginx used to serve it
PM2_APP="doapp"
NGINX_SITES="/etc/nginx/sites-enabled"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '   \033[33m!!\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[31mABORTA:\033[0m %s\n\n' "$*" >&2; exit 1; }

# ── Preconditions ────────────────────────────────────────────────────────────
say "Comprobando el entorno"

[ -d "$DEPLOY_DIR" ] || die "No existe $DEPLOY_DIR"
cd "$DEPLOY_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "$DEPLOY_DIR no es un repositorio git. El CI hace 'git fetch' acá, así que si no lo es, algo se rompió en el servidor."
ok "$DEPLOY_DIR es un repositorio git"

# The whole point of the guard: nginx must serve the directory we are about to
# build into. Serving a different checkout is the failure that hid for weeks.
if [ -d "$NGINX_SITES" ]; then
  if grep -rqs "${STALE_DIR}/dist/spa" "$NGINX_SITES"; then
    warn "nginx todavía apunta a ${STALE_DIR}/dist/spa — ese checkout NO se actualiza acá."
    warn "Corregilo con:"
    warn "  sudo sed -i 's#${STALE_DIR}/dist/spa#${DEPLOY_DIR}/dist/spa#g' ${NGINX_SITES}/*"
    warn "  sudo nginx -t && sudo systemctl reload nginx"
    die "El front quedaría congelado en la versión vieja aunque este deploy termine bien."
  fi
  grep -rqs "${DEPLOY_DIR}/dist/spa" "$NGINX_SITES" \
    && ok "nginx sirve ${DEPLOY_DIR}/dist/spa" \
    || warn "No encontré ninguna raíz de nginx apuntando a ${DEPLOY_DIR}/dist/spa — revisá a mano."
fi

BEFORE="$(git rev-parse --short HEAD)"
say "Commit actual: $BEFORE"

# ── Deploy ───────────────────────────────────────────────────────────────────
say "Trayendo el código"
git fetch origin
git reset --hard origin/master
AFTER="$(git rev-parse --short HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  warn "No hubo cambios de código ($AFTER). Sigo igual: puede haber cambiado el .env o hacer falta reconstruir."
else
  ok "$BEFORE → $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/     /'
fi

say "Instalando dependencias"
npm install --legacy-peer-deps

say "Compilando el frontend"
npm run build:client
[ -d "${DEPLOY_DIR}/dist/spa" ] || die "No se generó dist/spa; nginx no tendría qué servir."
ok "dist/spa generado"

say "Aplicando migraciones"
NODE_ENV=production npx sequelize-cli db:migrate

# ── Restart ──────────────────────────────────────────────────────────────────
# --update-env because PM2 caches the environment captured at first start; a
# process running for weeks will not pick up new .env values without it.
say "Reiniciando $PM2_APP"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null 2>&1 || true

# ── Verify ───────────────────────────────────────────────────────────────────
say "Verificando"
sleep 5
pm2 describe "$PM2_APP" | grep -E "status|uptime|restarts" | sed 's/^/   /' || true

HEALTH="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health 2>/dev/null || echo 000)"
if [ "$HEALTH" = "200" ]; then
  ok "El backend responde (health 200)"
else
  warn "health devolvió $HEALTH — mirá: pm2 logs $PM2_APP --lines 50 --timestamp --nostream"
fi

say "Desplegado $AFTER"
echo "   Comprobá el front con una recarga forzada, y el backend con:"
echo "     pm2 logs $PM2_APP --lines 50 --timestamp --nostream"
echo
