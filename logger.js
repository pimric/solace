const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'solace.log');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB rotation

function fmt(level, module, msg, data) {
  const ts = new Date().toISOString();
  const extra = data ? ' ' + JSON.stringify(data) : '';
  return `${ts} [${level}] [${module}] ${msg}${extra}\n`;
}

function rotate() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch {}
}

function write(level, module, msg, data) {
  const line = fmt(level, module, msg, data);
  process.stdout.write(line);
  try {
    rotate();
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

function makeLogger(module) {
  return {
    info:  (msg, data) => write('INFO ', module, msg, data),
    warn:  (msg, data) => write('WARN ', module, msg, data),
    error: (msg, data) => write('ERROR', module, msg, data),
    debug: (msg, data) => write('DEBUG', module, msg, data),
  };
}

module.exports = { makeLogger };
