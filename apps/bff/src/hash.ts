import { createHash } from 'node:crypto';

/** SHA-256 of `text`, base64url-encoded: short, and safe in URLs, cookies and headers. */
export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('base64url');
}
