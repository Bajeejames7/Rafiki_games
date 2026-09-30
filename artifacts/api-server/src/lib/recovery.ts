import { createHmac, randomBytes, randomInt } from "node:crypto";

// Password recovery without email.
//
// Teachers: an admin issues a one-time 6-digit reset code from the admin
// panel. It is stored bcrypt-hashed and expires after RESET_CODE_TTL.
//
// Admins: they can also link an authenticator app (Google Authenticator,
// Microsoft Authenticator, ...) by scanning a QR code once. The app then
// shows standard TOTP codes (RFC 6238: HMAC-SHA1, 30 s steps, 6 digits).

export const RESET_CODE_TTL = 15 * 60 * 1000;

export function newResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str.replace(/[\s=]/g, "").toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpUri(secret: string, username: string): string {
  const issuer = "Rafiki Games";
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, "0");
}

// Returns the time step the code matched (allowing one step of clock drift
// either way), or null. Steps at or before lastStep are rejected so a code
// that was already used cannot be replayed.
export function verifyTotp(secret: string, code: string, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 30_000);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (hotp(key, step) === code) return step;
  }
  return null;
}

// Recovery codes are only 6 digits, so failed guesses are limited per
// username (not per IP, which an attacker can change): 5 per hour.
const RECOVER_WINDOW = 60 * 60 * 1000;
const RECOVER_MAX = 5;
const recoverFailures = new Map<string, { count: number; first: number }>();

export function recoverBlocked(username: string): boolean {
  const entry = recoverFailures.get(username);
  if (!entry) return false;
  if (Date.now() - entry.first > RECOVER_WINDOW) {
    recoverFailures.delete(username);
    return false;
  }
  return entry.count >= RECOVER_MAX;
}

export function recordRecoverFailure(username: string): void {
  const entry = recoverFailures.get(username);
  if (!entry || Date.now() - entry.first > RECOVER_WINDOW) {
    recoverFailures.set(username, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearRecoverFailures(username: string): void {
  recoverFailures.delete(username);
}
