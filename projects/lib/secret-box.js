/**
 * Encryption at rest for credentials the operator types into the platform.
 *
 * projects/data/ is a tracked directory, so a plaintext token written there would end
 * up in the repository. Everything here writes ciphertext only, and the key lives
 * outside the tracked tree.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_FILE = '.secret-key';
const KEY_ENV_VARS = [
  'PLATFORM_SECRET_KEY',
  'GIT_TOKEN_SECRET',
  'AGENT_HMAC_SECRET',
  'PLATFORM_SERVICE_TOKEN',
];

function envKeyMaterial() {
  for (const name of KEY_ENV_VARS) {
    const value = String(process.env[name] || '').trim();
    if (value) return { material: value, source: `env:${name}` };
  }
  return null;
}

/**
 * Falls back to a 0600 key file beside the data dir when no env secret is configured.
 * Weaker than a real KMS, but it keeps the key out of the tracked JSON and out of git.
 */
function fileKeyMaterial(dataDir) {
  const keyPath = path.join(dataDir, KEY_FILE);
  try {
    const existing = fs.readFileSync(keyPath, 'utf8').trim();
    if (existing) return { material: existing, source: 'file' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const generated = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(keyPath, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  return { material: generated, source: 'file' };
}

function resolveKey(dataDir) {
  const resolved = envKeyMaterial() || fileKeyMaterial(dataDir);
  return {
    key: crypto.scryptSync(resolved.material, 'yourlab-platform-secret-box', 32),
    source: resolved.source,
  };
}

function keySource(dataDir) {
  const fromEnv = envKeyMaterial();
  if (fromEnv) return fromEnv.source;
  return fs.existsSync(path.join(dataDir, KEY_FILE)) ? 'file' : 'none';
}

function encryptSecret(dataDir, plaintext) {
  const value = String(plaintext ?? '');
  if (!value) return null;
  const { key } = resolveKey(dataDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
    // Lets the UI prove which credential is stored without revealing it.
    fingerprint: crypto.createHash('sha256').update(value).digest('hex').slice(0, 12),
  };
}

function decryptSecret(dataDir, box) {
  if (!box || typeof box !== 'object' || !box.data) return '';
  const { key } = resolveKey(dataDir);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(box.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(box.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    // Wrong key, or the file was copied from another machine. Never leak the cause.
    throw new Error('Nao foi possivel decifrar a credencial guardada. A chave mudou?');
  }
}

/** Last 4 characters only, for showing which token is stored. */
function maskSecret(plaintext) {
  const value = String(plaintext ?? '');
  if (!value) return '';
  return `${'•'.repeat(Math.min(8, Math.max(4, value.length - 4)))}${value.slice(-4)}`;
}

module.exports = {
  KEY_ENV_VARS,
  KEY_FILE,
  decryptSecret,
  encryptSecret,
  keySource,
  maskSecret,
};
