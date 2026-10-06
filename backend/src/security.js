import { HttpError, unavailable } from './contracts.js';

async function limit(binding, key, required) {
  if (!binding) { if (required) throw unavailable(); return; }
  let result;
  try { result = await binding.limit({ key }); } catch { throw unavailable(); }
  if (result?.success !== true) throw new HttpError(429, 'Too many requests', { 'Retry-After': '60' });
}
export async function publicGate(request, env, config) {
  if (env.API_ENABLED === 'false') throw unavailable();
  const path = new URL(request.url).pathname;
  if (path === '/auth/signup' && env.REGISTRATION_ENABLED === 'false') throw new HttpError(403, 'Registration closed');
  if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && env.WRITES_ENABLED === 'false') throw new HttpError(503, 'Writes temporarily disabled');
  // Cloudflare overwrites this header at the edge. Never trust X-Forwarded-For
  // or a caller's account ID as the identity of an unauthenticated request.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await limit(env.GLOBAL_RATE_LIMITER, 'activity-hub:dynamic', config.secure);
  await limit(env.IP_RATE_LIMITER, `ip:${ip}`, config.secure);
  if (['/auth/signup', '/auth/login'].includes(path) && request.method === 'POST') {
    await limit(env.AUTH_RATE_LIMITER, `${path}:${ip}`, config.secure);
  }
}
export async function accountGate(env, config, accountId) {
  await limit(env.ACCOUNT_RATE_LIMITER, `account:${accountId}`, config.secure);
}
export function registrationConfig(env, config) {
  const sitekey = typeof env.TURNSTILE_SITEKEY === 'string' && env.TURNSTILE_SITEKEY.trim() ? env.TURNSTILE_SITEKEY : null;
  return {
    sitekey: config.secure ? sitekey : null,
    local: !config.secure,
    registration_enabled: env.REGISTRATION_ENABLED !== 'false' && (!config.secure || Boolean(sitekey && env.TURNSTILE_SECRET)),
  };
}
export async function verifySignup(request, env, config, token, verifier = fetch) {
  if (!config.secure) return; // settings() permits HTTP only on loopback.
  if (!registrationConfig(env, config).registration_enabled) throw new HttpError(403, 'Registration closed');
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) throw new HttpError(403, 'Verification required');
  let result;
  try {
    const response = await verifier('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(request.headers.has('CF-Connecting-IP') ? { remoteip: request.headers.get('CF-Connecting-IP') } : {}) }),
    });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch { throw new HttpError(403, 'Verification required'); }
  if (result?.success !== true || result.action !== 'signup' || result.hostname !== new URL(config.origin).hostname) throw new HttpError(403, 'Verification required');
}
