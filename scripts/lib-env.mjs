import { readFileSync, existsSync } from 'node:fs';

export function loadEnv() {
  const env = { ...process.env };
  const file = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
  if (file) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

export const DEMO = {
  password: 'Demo-Passw0rd!',
  admin: 'admin@demo.test',
  seller: 'seller@demo.test',
  customer: 'customer@demo.test',
};
