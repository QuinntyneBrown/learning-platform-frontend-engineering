const DEFAULT_URL = '/catalog';

/**
 * Only a path inside this app. Without the check, a crafted link such as
 * `/login?returnUrl=https://evil.example` would turn a real sign-in into a phishing redirect.
 * `//evil.example` and `/\evil.example` are protocol-relative URLs to another host, too.
 */
export function safeReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return DEFAULT_URL;
  }
  return url;
}
