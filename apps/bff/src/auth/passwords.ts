import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;
const KEY_LENGTH = 32;

/** Returns "<salt>:<hash>" in hex. Each user gets their own random salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex = '', hashHex = ''] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  // Async scrypt runs on the libuv thread pool, so a login doesn't block other requests.
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  // Constant-time comparison: how long it takes doesn't reveal how many bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A real hash of a password nobody knows. Checking an unknown username against it costs
 * the same scrypt time as a real user, so response timing doesn't reveal which usernames exist.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));
