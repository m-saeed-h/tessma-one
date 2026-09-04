import * as crypto from 'crypto';

// SEC-DAT-03: "Application-level encryption for the highest-sensitivity
// fields — bank account details, payment credentials, national identifiers —
// so that a database compromise alone does not disclose them." AES-256-GCM:
// authenticated encryption, so tampering with a stored value is detected on
// decrypt, not silently accepted.
//
// FIELD_ENCRYPTION_KEY is a 32-byte key, base64-encoded, distinct from
// JWT_SECRET (a leaked JWT secret should not also unlock encrypted bank
// details). The dev default below is exactly that — a default for local
// dev/CI, not a production key — matching how JWT_SECRET is already handled.
const KEY = Buffer.from(
  process.env.FIELD_ENCRYPTION_KEY ?? 'ZGV2LW9ubHktZmllbGQtZW5jcnlwdGlvbi1rZXkhISE=',
  'base64',
);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv.authTag.ciphertext, each base64 — self-contained, no separate column needed.
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptField(stored: string): string {
  const [ivB64, authTagB64, dataB64] = stored.split('.');
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error('Malformed encrypted field value');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Displayed back to a user who already has permission to see that a supplier
// has bank details on file, without re-exposing the full number — the last 4
// digits are enough to confirm "yes, this is the account I expect."
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s/g, '');
  return digits.length <= 4 ? '••••' : `••••${digits.slice(-4)}`;
}
