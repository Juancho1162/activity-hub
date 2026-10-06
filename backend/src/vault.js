import { HttpError, invalid, object, isoDay } from './contracts.js';
import { context, frontJSON, uuidSQL, timestampSQL } from './sql.js';

export const VAULT_BYTES = 512 * 1024;
export function vaultInput(value) {
  object(value, ['version', 'day', 'iv', 'ciphertext', 'legacy_revision']);
  if (!Number.isSafeInteger(value.version) || value.version < 0 || value.version >= Number.MAX_SAFE_INTEGER
    || !isoDay(value.day) || typeof value.iv !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(value.iv)
    || typeof value.ciphertext !== 'string'
    || ((value.version === 0 || value.legacy_revision != null) && (!Number.isSafeInteger(value.legacy_revision) || value.legacy_revision < 0))) throw invalid();
  if (value.ciphertext.length > 4 * Math.ceil(VAULT_BYTES / 3)) throw new HttpError(413, 'Vault storage limit reached');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)) throw invalid();
  const bytes = atob(value.ciphertext);
  if (bytes.length > VAULT_BYTES) throw new HttpError(413, 'Vault storage limit reached');
  if (bytes.length < 17 || btoa(bytes) !== value.ciphertext) throw invalid();
  return value;
}

function response(ctx) {
  const { c, nonce } = ctx;
  // No content indexes, plaintext replays or searchable names remain after
  // migration. The legacy export is restricted to this authenticated account.
  ctx.add(`UPDATE ${c} SET response=(SELECT json_object(
    'version',coalesce(v.version,0),'iv',v.iv,'ciphertext',v.ciphertext,
    'legacy_revision',CASE WHEN v.account_id IS NULL THEN (SELECT legacy_revision FROM accounts WHERE id=${c}.account_id) ELSE NULL END,
    'day',${c}.today,'now',${timestampSQL(`${c}.now`)},
    'legacy',CASE WHEN v.account_id IS NOT NULL THEN NULL ELSE json_object(
      'fronts',json((SELECT json_group_array(json(item)) FROM (SELECT ${frontJSON()} AS item FROM fronts f WHERE f.account_id=${c}.account_id ORDER BY f.created_at,f.id))),
      'checks',json((SELECT json_group_array(json_object('front_id',${uuidSQL('ch.front_id')},'day',ch.day)) FROM activity_checks ch JOIN fronts f ON f.id=ch.front_id WHERE f.account_id=${c}.account_id)),
      'replays',json((SELECT json_group_array(json_object('key',r.key,'operation',r.operation,'target',r.target,'payload',json(r.payload),'response',json(r.response))) FROM idempotency_requests r WHERE r.account_id=${c}.account_id))
    ) END) FROM (SELECT 1) LEFT JOIN encrypted_vaults v ON v.account_id=${c}.account_id
  ) WHERE nonce=? AND status=200`, [nonce]);
}

export class Vault {
  constructor(DB, clock, proof) { this.DB = DB; this.clock = clock; this.proof = proof; }
  async get() {
    const ctx = context(this.DB, this.clock, this.proof, { madrid: true });
    ctx.add(`UPDATE ${ctx.c} SET status=503 WHERE nonce=? AND status=200 AND today IS NULL`, [ctx.nonce]);
    response(ctx);
    return ctx.finish();
  }
  async put(value) {
    const ctx = context(this.DB, this.clock, this.proof, { madrid: true });
    const { c, nonce } = ctx;
    ctx.add(`UPDATE ${c} SET status=409 WHERE nonce=? AND status=200 AND
      (today IS NOT ? OR coalesce((SELECT version FROM encrypted_vaults WHERE account_id=${c}.account_id),0)<>?
      OR (?=0 AND (SELECT legacy_revision FROM accounts WHERE id=${c}.account_id) IS NOT ?))`, [nonce, value.day, value.version, value.version, value.legacy_revision ?? null]);
    ctx.add(`INSERT INTO encrypted_vaults(account_id,version,iv,ciphertext,updated_at)
      SELECT account_id,?,?,?,now FROM ${c} WHERE nonce=? AND status=200
      ON CONFLICT(account_id) DO UPDATE SET version=excluded.version,iv=excluded.iv,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at`,
    [value.version + 1, value.iv, value.ciphertext, nonce]);
    // Foreign-key order matters; all removals and ciphertext commit atomically.
    ctx.add(`DELETE FROM idempotency_requests WHERE account_id=? AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [this.proof.account_id, nonce]);
    ctx.add(`DELETE FROM activity_checks WHERE front_id IN (SELECT id FROM fronts WHERE account_id=?) AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [this.proof.account_id, nonce]);
    ctx.add(`DELETE FROM fronts WHERE account_id=? AND (SELECT status FROM ${c} WHERE nonce=?)=200`, [this.proof.account_id, nonce]);
    ctx.add(`UPDATE ${c} SET response=json_object('version',?) WHERE nonce=? AND status=200`, [value.version + 1, nonce]);
    return ctx.finish({ 409: 'Vault changed' });
  }
}
