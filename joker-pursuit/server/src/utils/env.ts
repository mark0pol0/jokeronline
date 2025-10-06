import fs from 'fs';

/**
 * Minimal environment loader that mirrors dotenv-style parsing so we can
 * support local development without introducing an additional dependency.
 */
export function loadEnvFile(envPath: string) {
  if (!envPath || !fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');

  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const [key, ...rest] = trimmed.split('=');

    if (!key) {
      return;
    }

    const value = rest.join('=').trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}
