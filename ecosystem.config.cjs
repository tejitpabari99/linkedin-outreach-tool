const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  } catch (e) { /* ignore */ }
  return env;
}

module.exports = {
  apps: [{
    name: 'linkedin-outreach',
    script: 'build/index.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production', ...loadEnvFile('.env') }
  }]
};
