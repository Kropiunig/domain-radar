import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const password = process.env.RADAR_PASSWORD;
if (!password) {
  console.error('RADAR_PASSWORD environment variable is required');
  process.exit(1);
}

function encrypt(data) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Web Crypto API expects tag appended to ciphertext
  const ciphertextWithTag = Buffer.concat([encrypted, tag]);

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: ciphertextWithTag.toString('base64'),
  };
}

// Encrypt found.json
try {
  const found = JSON.parse(readFileSync(join(root, 'data', 'found.json'), 'utf8'));
  const encrypted = encrypt(found);
  mkdirSync(join(root, 'docs', 'data'), { recursive: true });
  writeFileSync(join(root, 'docs', 'data', 'results.enc.json'), JSON.stringify(encrypted));
  console.log(`Encrypted ${found.length} found domains`);
} catch (e) {
  console.error('Failed to encrypt found.json:', e.message);
}

// Encrypt status.json
try {
  const status = JSON.parse(readFileSync(join(root, 'data', 'status.json'), 'utf8'));
  const encrypted = encrypt(status);
  writeFileSync(join(root, 'docs', 'data', 'status.enc.json'), JSON.stringify(encrypted));
  console.log('Encrypted status.json');
} catch (e) {
  console.error('Failed to encrypt status.json:', e.message);
}
