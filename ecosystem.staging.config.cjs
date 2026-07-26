/**
 * PM2 Configuration for DOAPP — STAGING
 * Runs a second copy of the app on port 3002, from /var/www/doapp-staging,
 * against the STAGING database (set STAGING_DATABASE_URL / DATABASE_URL in
 * /var/www/doapp-staging/.env). Deployed by .github/workflows/staging.yml.
 */
module.exports = {
  apps: [{
    name: 'doapp-staging',
    script: 'npx',
    args: 'tsx server/index.ts',
    cwd: '/var/www/doapp-staging',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/pm2/doapp-staging-error.log',
    out_file: '/var/log/pm2/doapp-staging-out.log',
    merge_logs: true,
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
