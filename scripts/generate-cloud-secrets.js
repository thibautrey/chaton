#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.trim();
    const nextValue = inlineValue ?? argv[index + 1];
    const value = inlineValue ?? (nextValue && !nextValue.startsWith('--') ? nextValue : 'true');

    options[key] = value;

    if (inlineValue == null && nextValue && !nextValue.startsWith('--')) {
      index += 1;
    }
  }

  return options;
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function yamlQuote(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function usage() {
  console.log(`Usage: node scripts/generate-cloud-secrets.js [options]

Options:
  --output <path>           Output file path
  --namespace <name>        Kubernetes namespace (default: chatons-cloud)
  --name <name>             Secret name (default: chatons-cloud-secrets)
  --postgres-host <host>    Postgres host (default: postgres.chatons-cloud.svc.cluster.local)
  --postgres-port <port>    Postgres port (default: 5432)
  --postgres-db <name>      Postgres database (default: chatons)
  --postgres-user <name>    Postgres user (default: chatons)
  --redis-url <url>         Redis URL (default: redis://redis.chatons-cloud.svc.cluster.local:6379)
  --public-url <url>        Public cloud API URL (used for OIDC issuer fallback)
  --web-url <url>           Browser portal URL (default: --public-url)
  --oidc-client-id <id>     OIDC client id (default: chatons-desktop)
  --smtp-host <host>        SMTP host
  --smtp-port <port>        SMTP port (default: 587)
  --smtp-secure <bool>      SMTP secure flag (default: false)
  --smtp-user <user>        SMTP username
  --smtp-from <value>       SMTP from header (default: Chatons Cloud <no-reply@chatons.ai>)
  --stdout                  Print to stdout instead of writing a file

Example:
  npm run secrets:cloud -- --output k8s/base/chatons-cloud-secrets.yaml --public-url https://api.chatons.ai --web-url https://cloud.chatons.ai --smtp-host smtp.resend.com --smtp-user resend`);
}

function buildManifest(options) {
  const namespace = options.namespace || 'chatons-cloud';
  const name = options.name || 'chatons-cloud-secrets';
  const postgresHost = options['postgres-host'] || 'postgres.chatons-cloud.svc.cluster.local';
  const postgresPort = options['postgres-port'] || '5432';
  const postgresDb = options['postgres-db'] || 'chatons';
  const postgresUser = options['postgres-user'] || 'chatons';
  const postgresPassword = randomSecret(24);
  const redisUrl = options['redis-url'] || 'redis://redis.chatons-cloud.svc.cluster.local:6379';
  const publicUrl = options['public-url'] || 'https://cloud.chatons.ai';
  const webUrl = options['web-url'] || publicUrl;
  const oidcClientId = options['oidc-client-id'] || 'chatons-desktop';
  const oidcClientSecret = randomSecret(24);
  const smtpHost = options['smtp-host'] || 'smtp.example.com';
  const smtpPort = options['smtp-port'] || '587';
  const smtpSecure = options['smtp-secure'] || 'false';
  const smtpUser = options['smtp-user'] || 'no-reply@chatons.ai';
  const smtpPass = randomSecret(18);
  const smtpFrom = options['smtp-from'] || 'Chatons Cloud <no-reply@chatons.ai>';

  const databaseUrl = `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${postgresHost}:${postgresPort}/${postgresDb}`;

  const stringData = {
    POSTGRES_PASSWORD: postgresPassword,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    CHATONS_INTERNAL_SERVICE_TOKEN: randomSecret(32),
    OIDC_CLIENT_ID: oidcClientId,
    OIDC_CLIENT_SECRET: oidcClientSecret,
    OIDC_ISSUER_URL: publicUrl,
    CHATONS_CLOUD_WEB_URL: webUrl,
    JWT_SIGNING_KEY: randomSecret(32),
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_SECURE: smtpSecure,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    SMTP_FROM: smtpFrom,
  };

  const lines = [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    'type: Opaque',
    'stringData:',
    ...Object.entries(stringData).map(([key, value]) => `  ${key}: ${yamlQuote(value)}`),
    '',
  ];

  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help === 'true') {
    usage();
    process.exit(0);
  }

  const manifest = buildManifest(options);

  if (options.stdout === 'true') {
    process.stdout.write(manifest);
    return;
  }

  const outputPath = path.resolve(process.cwd(), options.output || 'k8s/base/secrets.generated.yaml');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, manifest, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
