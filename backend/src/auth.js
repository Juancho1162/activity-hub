import { HttpError, unavailable, uuidText, object } from './contracts.js';
import { batch, statement, context, READY, sessionJSON } from './sql.js';
import { utcOutput } from './time.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const opaque = /^[A-Za-z0-9_-]{43}$/;
export function settings(value) {
  if (typeof value !== 'string' || !/^(https?):\/\/(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::[0-9]+)?$/.test(value)) throw new Error('Invalid web origin configuration');
  const literal = /^(https?):\/\/(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]+))?$/.exec(value);
  if (literal[3] && !(Number(literal[3]) >= 1 && Number(literal[3]) <= 65535)) throw new Error('Invalid web origin configuration');
  if (literal[1] === 'http' && !['localhost', '127.0.0.1', '[::1]'].includes(literal[2].toLowerCase())) throw new Error('HTTPS required');
  if (!literal[2].startsWith('[') && (literal[2].length > 253 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(literal[2]))) throw new Error('Invalid web origin configuration');
  const origin = new URL(value).origin;
  return { origin, secure: origin.startsWith('https:'), cookie: origin.startsWith('https:') ? '__Host-activity_hub_session' : 'activity_hub_session' };
}
export function requireOrigin(request, config) {
  // Fetch combines duplicate header lines with commas, which cannot match.
  if (request.headers.get('Origin') !== config.origin) throw new HttpError(403, 'Request forbidden');
}
function sameToken(a, b) {
  if (!opaque.test(a || '') || !opaque.test(b || '')) return false;
  let different = 0;
  for (let i = 0; i < 43; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
export function privateHeaders(request, config, proof) {
  if (request.headers.get('X-Activity-Account') !== uuidText(proof.account_id)) throw new HttpError(409, 'Account context changed');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    requireOrigin(request, config);
    if (!sameToken(request.headers.get('X-CSRF-Token'), proof.csrf_token)) throw new HttpError(403, 'Request forbidden');
  }
}
export function cookieToken(request, config) {
  const candidates = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${config.cookie}=`));
  return candidates.length === 1 ? candidates[0].slice(config.cookie.length + 1) : null;
}
async function hash(domain, text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`activity-hub:${domain}:v1:${text}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function sessionVerifier(token) { return typeof token === 'string' && opaque.test(token) ? hash('session', token) : null; }
export function normalizeCode(value) {
  if (typeof value !== 'string' || value.length > 128 || /[^\x00-\x7f]/.test(value)) return null;
  value = value.replace(/[ -]/g, '').toUpperCase();
  return value.length === 32 && [...value].every(symbol => alphabet.includes(symbol)) ? value : null;
}
function generatedCode() {
  // 256 is divisible by 32: no modulo bias. Thirty-two independent symbols.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = [...bytes].map(byte => alphabet[byte % 32]).join('');
  return raw.match(/.{4}/g).join('-');
}
function token() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
export function publicSession(proof) {
  return { authenticated: true, account_id: uuidText(proof.account_id), csrf_token: proof.csrf_token, expires_at: utcOutput(proof.expires_at) };
}
export function loginInput(value) {
  try {
    if (value && Object.hasOwn(value, 'credential')) {
      object(value, ['credential']);
      if (!/^[a-f0-9]{64}$/.test(value.credential) || typeof value.credential !== 'string') throw new Error();
      return { credential: value.credential };
    }
    object(value, ['code']);
    if (typeof value.code !== 'string' || [...value.code].length > 128) throw new Error();
    return value.code;
  } catch { throw new HttpError(400, 'Invalid request'); }
}
export function signupInput(value) {
  try {
    if (value && Object.hasOwn(value, 'credential')) {
      object(value, ['credential', 'turnstile_token']);
      if (typeof value.credential !== 'string' || !/^[a-f0-9]{64}$/.test(value.credential)) throw new Error();
      return value;
    }
    object(value, []);
    return {};
  } catch { throw new HttpError(400, 'Invalid request'); }
}
export class Auth {
  constructor(DB, clock) { this.DB = DB; this.clock = clock; }
  async authenticate(raw) {
    const verifier = await sessionVerifier(raw);
    if (!verifier) throw new HttpError(401, 'Authentication required');
    const moment = this.clock();
    const rows = await batch(this.DB, [
      statement(this.DB, `SELECT (${READY}) AS ready`),
      statement(this.DB, `WITH clock AS MATERIALIZED (SELECT ${moment.sql} AS now)
        SELECT s.* FROM web_sessions s JOIN accounts a ON a.id=s.account_id,clock
        WHERE s.token_verifier=? AND s.expires_at>clock.now`, [...moment.bindings, verifier]),
    ]);
    if (!rows.at(-2).results[0]?.ready) throw unavailable();
    const proof = rows.at(-1).results[0];
    if (!proof) throw new HttpError(401, 'Authentication required');
    return proof;
  }
  async reserve(action) {
    const limit = action === 'login' ? 10 : 5;
    const ctx = context(this.DB, this.clock);
    const { c, nonce } = ctx;
    ctx.add(`INSERT INTO action_throttle(action,window_started_at,attempts) SELECT ?,now,0 FROM ${c} WHERE nonce=? AND status=200 ON CONFLICT(action) DO NOTHING`, [action, nonce]);
    ctx.add(`UPDATE ${c} SET status=429 WHERE nonce=? AND status=200 AND EXISTS
      (SELECT 1 FROM action_throttle WHERE action=? AND attempts>=? AND unixepoch(${c}.now,'subsec')<unixepoch(window_started_at,'subsec')+60)`, [nonce, action, limit]);
    ctx.add(`UPDATE action_throttle SET
      attempts=CASE WHEN unixepoch((SELECT now FROM ${c} WHERE nonce=?),'subsec')>=unixepoch(window_started_at,'subsec')+60 THEN 1 ELSE attempts+1 END,
      window_started_at=CASE WHEN unixepoch((SELECT now FROM ${c} WHERE nonce=?),'subsec')>=unixepoch(window_started_at,'subsec')+60 THEN (SELECT now FROM ${c} WHERE nonce=?) ELSE window_started_at END
      WHERE action=? AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [nonce, nonce, nonce, action, nonce]);
    ctx.add(`UPDATE ${c} SET response=(SELECT json_object('retry',max(1,min(60,CAST(unixepoch(window_started_at,'subsec')+60-unixepoch(${c}.now,'subsec')+0.999 AS INTEGER)))) FROM action_throttle WHERE action=?) WHERE nonce=? AND status=429`, [action, nonce]);
    await ctx.finish({ 429: `Too many ${action} attempts` });
  }
  async signupAllowed(prior) {
    const ctx = context(this.DB, this.clock, null, { signupVerifier: await sessionVerifier(prior) });
    await ctx.finish({ 409: 'Sign out before creating an account' });
  }
  async signup(prior, credential, challenge) {
    const priorVerifier = await sessionVerifier(prior);
    const challengeVerifier = challenge ? await hash('signup-challenge', challenge) : null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = credential ? null : generatedCode();
      const verifier = credential ? await hash('browser-auth', credential) : await hash('access-code', normalizeCode(code));
      const id = crypto.randomUUID().replaceAll('-', '');
      const ctx = context(this.DB, this.clock, null, { signupVerifier: priorVerifier });
      const { c, nonce } = ctx;
      ctx.add(`UPDATE ${c} SET status=403 WHERE nonce=? AND status=200 AND (SELECT count(*) FROM accounts)>=100`, [nonce]);
      ctx.add(`INSERT INTO accounts(id,code_verifier,auth_verifier,signup_challenge,created_at) SELECT ?,?,?,?,now FROM ${c} WHERE nonce=? AND status=200
        ON CONFLICT(code_verifier) DO NOTHING ON CONFLICT(signup_challenge) DO NOTHING`, [id, verifier, credential ? verifier : null, challengeVerifier, nonce]);
      ctx.add(`UPDATE ${c} SET response=(SELECT json_object('id',id) FROM accounts WHERE id=?) WHERE nonce=? AND status=200`, [id, nonce]);
      ctx.add(`UPDATE ${c} SET response=json_object('challenge_used',1) WHERE nonce=? AND status=200 AND response IS NULL
        AND EXISTS (SELECT 1 FROM accounts WHERE signup_challenge=?)`, [nonce, challengeVerifier]);
      const result = await ctx.finish({ 403: 'Registration capacity reached', 409: 'Sign out before creating an account' });
      if (result?.challenge_used) throw new HttpError(403, 'Verification required');
      if (result) return { account_id: uuidText(id), ...(code ? { code } : {}) };
      if (credential) throw new HttpError(409, 'Credential already registered');
      // Only a verifier collision retries. Arbitrary storage failures NEVER do.
    }
    throw unavailable();
  }
  async login(code, prior) {
    const credential = typeof code === 'object' ? code.credential : null;
    const normalized = normalizeCode(code);
    const verifier = credential ? await hash('browser-auth', credential) : await hash('access-code', normalized || '');
    const lookup = credential ? '(auth_verifier=? OR (auth_verifier IS NULL AND code_verifier=?))' : '(auth_verifier IS NULL AND code_verifier=?)';
    const lookupBindings = credential ? [verifier, credential] : [verifier];
    const raw = token();
    const csrf = token();
    const rawVerifier = await sessionVerifier(raw);
    const priorVerifier = await sessionVerifier(prior);
    const ctx = context(this.DB, this.clock);
    const { c, nonce } = ctx;
    ctx.add(`UPDATE ${c} SET status=401 WHERE nonce=? AND status=200 AND (NOT ? OR NOT EXISTS (SELECT 1 FROM accounts WHERE ${lookup}))`, [nonce, normalized || credential ? 1 : 0, ...lookupBindings]);
    if (credential) ctx.add(`UPDATE accounts SET code_verifier=?,auth_verifier=? WHERE auth_verifier IS NULL AND code_verifier=? AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [verifier, verifier, credential, nonce]);
    ctx.add(`DELETE FROM web_sessions WHERE expires_at<=(SELECT now FROM ${c} WHERE nonce=?) AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [nonce, nonce]);
    ctx.add(`DELETE FROM web_sessions WHERE token_verifier=? AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [priorVerifier, nonce]);
    ctx.add(`DELETE FROM web_sessions WHERE account_id=(SELECT id FROM accounts WHERE code_verifier=?) AND token_verifier NOT IN
      (SELECT token_verifier FROM web_sessions WHERE account_id=(SELECT id FROM accounts WHERE code_verifier=?) ORDER BY created_at DESC,token_verifier DESC LIMIT 19)
      AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [verifier, verifier, nonce]);
    ctx.add(`INSERT INTO web_sessions(token_verifier,account_id,csrf_token,created_at,expires_at)
      SELECT ?,a.id,?,c.now,strftime('%Y-%m-%d %H:%M:%S',c.now,'+30 days')||substr(c.now,20)
      FROM accounts a,${c} c WHERE c.nonce=? AND c.status=200 AND a.code_verifier=?`, [rawVerifier, csrf, nonce, verifier]);
    ctx.add(`UPDATE ${c} SET response=(SELECT ${sessionJSON()} FROM web_sessions s WHERE s.token_verifier=?) WHERE nonce=? AND status=200`, [rawVerifier, nonce]);
    const response = await ctx.finish({ 401: 'Authentication failed' });
    if (!response) throw unavailable();
    return { raw, response };
  }
  async logout(proof) {
    const ctx = context(this.DB, this.clock, proof);
    ctx.add(`DELETE FROM web_sessions WHERE token_verifier=? AND (SELECT status FROM ${ctx.c} WHERE nonce=?)=200`, [proof.token_verifier, ctx.nonce]);
    await ctx.finish();
  }
}
