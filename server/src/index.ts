import { createAppServer } from './server.js';
import { DEFAULT_STORAGE_POLICY } from './uploadStorage.js';

const PORT = Number(process.env.PORT ?? 3001);

/** A positive number from the environment, or the fallback. */
function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Everything below is unset in dev; a deployment sets it (see
// deploy/docker-compose.yml and docs/engineering/deployment.md).
const { http } = createAppServer({
  clientDist: process.env.CLIENT_DIST || undefined,
  uploadsDir: process.env.UPLOADS_DIR || undefined,
  corsOrigin: process.env.CORS_ORIGIN || undefined,
  trustProxy: process.env.TRUST_PROXY || undefined,
  uploadPolicy: {
    ...DEFAULT_STORAGE_POLICY,
    maxBytes: numberFromEnv('UPLOADS_MAX_MB', DEFAULT_STORAGE_POLICY.maxBytes / 2 ** 20) * 2 ** 20,
    maxAgeMs:
      numberFromEnv('UPLOADS_MAX_AGE_HOURS', DEFAULT_STORAGE_POLICY.maxAgeMs / 3_600_000) *
      3_600_000,
  },
});

http.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

// Docker stops a container with SIGTERM: close cleanly instead of being
// killed ten seconds later.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal}, shutting down`);
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
