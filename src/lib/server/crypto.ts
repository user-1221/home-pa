/**
 * Token Encryption Utilities
 *
 * Provides application-level encryption for sensitive data (OAuth tokens)
 * using AES-256-GCM. Tokens are encrypted before storing in the database
 * and decrypted when needed for API calls.
 *
 * Security notes:
 * - Uses AES-256-GCM (authenticated encryption with associated data)
 * - Each encryption generates a unique IV (nonce)
 * - Auth tag prevents tampering
 * - Key should be stored in environment variable, never in code
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Returns null if not configured (encryption disabled in dev).
 */
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    return null;
  }

  // Key can be provided as:
  // 1. 64-char hex string (32 bytes) - used directly
  // 2. Any other string - derived via scrypt
  if (/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return Buffer.from(keyHex, "hex");
  }

  // Derive key from passphrase using scrypt (for easier dev setup)
  const salt = Buffer.from("home-pa-token-encryption", "utf-8");
  return scryptSync(keyHex, salt, 32);
}

/**
 * Encrypt a token string.
 * Returns the encrypted value as a base64 string (IV + ciphertext + authTag).
 * If encryption is not configured, returns the plaintext unchanged.
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    // Encryption not configured - return plaintext (dev mode)
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12) + encrypted + authTag (16), all as base64
  const combined = Buffer.concat([iv, encrypted, authTag]);

  // Prefix with "enc:" to identify encrypted values
  return `enc:${combined.toString("base64")}`;
}

/**
 * Decrypt a token string.
 * Accepts base64 string produced by encryptToken().
 * If the value is not encrypted (no "enc:" prefix), returns as-is.
 */
export function decryptToken(ciphertext: string): string {
  // Check if this is an encrypted value
  if (!ciphertext.startsWith("enc:")) {
    // Not encrypted (legacy data or dev mode) - return as-is
    return ciphertext;
  }

  const key = getEncryptionKey();
  if (!key) {
    // Encryption not configured but data is encrypted - error
    throw new Error(
      "TOKEN_ENCRYPTION_KEY not configured but encrypted data found",
    );
  }

  const combined = Buffer.from(ciphertext.slice(4), "base64");

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}
