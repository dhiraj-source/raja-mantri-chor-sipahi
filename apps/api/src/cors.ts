/**
 * Kaun se browser origins API ko call kar sakte hain.
 * Dev: localhost aur ghar/office ke private network IPs (phone se test ke liye), sirf web dev port par.
 * Extra origins (deploy ke liye) CORS_ORIGINS env me comma se alag karke.
 */
const WEB_PORT = 5173;
const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export function isAllowedOrigin(origin: string | undefined, extraOrigins: readonly string[] = []): boolean {
  if (!origin) return true; // same-origin / curl: browser ka CORS yahan laagu hi nahi
  if (extraOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && Number(url.port) === WEB_PORT && PRIVATE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export function parseExtraOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
