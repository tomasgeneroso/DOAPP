/**
 * PM2 Configuration for DOAPP
 * Used for production deployment on Hostinger VPS
 */
module.exports = {
  apps: [{
    name: 'doapp',
    script: 'npx',
    args: 'tsx server/index.ts',
    cwd: '/var/www/doapp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Logs
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/pm2/doapp-error.log',
    out_file: '/var/log/pm2/doapp-out.log',
    merge_logs: true,
    // Restart settings
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
