module.exports = {
  apps: [{
    name: 'solace',
    script: 'server.js',
    cwd: '/root/ricadmin/solace',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
    },
    restart_delay: 2000,
    max_restarts: 20,
    error_file: 'storage/logs/pm2-error.log',
    out_file: 'storage/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
