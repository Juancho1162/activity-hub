import { HttpError, unavailable } from './contracts.js';
import { madridSQL } from './time.js';

// Refer to EVERY model column on EVERY database request. Preparing this query
// fails closed for a missing table/column even when today's route doesn't use it.
const SCHEMA_PROBE = `SELECT a.id,a.code_verifier,a.auth_verifier,a.legacy_revision,a.created_at,a.legacy_updated_at,
 f.id,f.account_id,f.name,f.reference,f.state,f.created_at,f.updated_at,
 ch.front_id,ch.day,r.account_id,r.key,r.operation,r.target,r.payload,r.response,r.created_at,
 s.token_verifier,s.account_id,s.csrf_token,s.created_at,s.expires_at,
 t.action,t.window_started_at,t.attempts,c.nonce,c.now,c.account_id,c.today,c.status,c.response,
 v.account_id,v.version,v.iv,v.ciphertext,v.updated_at
 FROM accounts a,fronts f,activity_checks ch,idempotency_requests r,web_sessions s,action_throttle t,worker_batch_context c,encrypted_vaults v LIMIT 0`;
export const READY = `(SELECT count(*) FROM alembic_version)=1 AND (SELECT version_num FROM alembic_version)='0003'
 AND (SELECT count(*) FROM worker_schema)=1 AND (SELECT version FROM worker_schema)='0001'
 AND EXISTS (SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='accounts_code_immutable' AND tbl_name='accounts')`;
export function statement(DB, sql, bindings = []) { return DB.prepare(sql).bind(...bindings); }
export async function batch(DB, statements) {
  try { return await DB.batch([statement(DB, SCHEMA_PROBE), ...statements]); }
  catch { throw unavailable(); } // SQL/parameters/trigger messages never escape or get logged.
}
export async function health(DB) {
  const rows = await batch(DB, [statement(DB, `SELECT (${READY}) AS ready`)]);
  if (!rows.at(-1).results[0]?.ready) throw unavailable();
}
export function uuidSQL(column) {
  return `substr(${column},1,8)||'-'||substr(${column},9,4)||'-'||substr(${column},13,4)||'-'||substr(${column},17,4)||'-'||substr(${column},21,12)`;
}
export function timestampSQL(column) {
  return `replace(CASE WHEN instr(${column},'.')=0 OR substr(${column},21)='000000' THEN substr(${column},1,19) ELSE ${column} END,' ','T')||'Z'`;
}
export function frontJSON(alias = 'f') {
  return `json_object('id',${uuidSQL(`${alias}.id`)},'name',${alias}.name,'reference',${alias}.reference,'state',${alias}.state,'created_at',${timestampSQL(`${alias}.created_at`)},'updated_at',${timestampSQL(`${alias}.updated_at`)})`;
}
export function sessionJSON(alias = 's') {
  return `json_object('authenticated',json('true'),'account_id',${uuidSQL(`${alias}.account_id`)},'csrf_token',${alias}.csrf_token,'expires_at',${timestampSQL(`${alias}.expires_at`)})`;
}

// D1 batch has no JS callback/BEGIN IMMEDIATE. Instead the first SQL statement
// captures database time and revalidates a proof in a nonce-scoped scratch row.
// Every subsequent lookup/mutation/replay is conditional on that row. The last
// SELECT returns its decision and the last DELETE removes it, in the SAME batch.
// Any SQL failure (including replay insertion) rolls back the ENTIRE batch.
// No await/JS decisions, stale account snapshot, or in-memory mutex in between.
export function context(DB, clock, proof = null, { madrid = false, signupVerifier = undefined } = {}) {
  const nonce = crypto.randomUUID();
  const moment = clock();
  const zone = madrid ? madridSQL(moment.hint) : { sql: 'NULL', bindings: [] };
  let permission = '200';
  let proofBindings = [];
  if (proof) {
    permission = `CASE WHEN EXISTS (SELECT 1 FROM web_sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.token_verifier=? AND s.account_id=? AND s.csrf_token=? AND s.expires_at=? AND s.expires_at>clock.now) THEN 200 ELSE 401 END`;
    proofBindings = [proof.token_verifier, proof.account_id, proof.csrf_token, proof.expires_at];
  } else if (signupVerifier !== undefined) {
    permission = `CASE WHEN EXISTS (SELECT 1 FROM web_sessions WHERE token_verifier=? AND expires_at>clock.now) THEN 409 ELSE 200 END`;
    proofBindings = [signupVerifier];
  }
  const initial = statement(DB, `WITH clock AS MATERIALIZED (SELECT ${moment.sql} AS now)
    INSERT INTO worker_batch_context(nonce,now,account_id,today,status)
    SELECT ?,clock.now,?,${zone.sql},CASE WHEN (${READY}) THEN ${permission} ELSE 503 END FROM clock`,
  [...moment.bindings, nonce, proof?.account_id || null, ...zone.bindings, ...proofBindings]);
  const c = 'worker_batch_context';
  return {
    nonce, c,
    statements: [initial],
    add(sql, bindings = []) { this.statements.push(statement(DB, sql, bindings)); },
    async finish(details = {}) {
      const rows = await batch(DB, [...this.statements,
        statement(DB, `SELECT status,response FROM ${c} WHERE nonce=?`, [nonce]),
        statement(DB, `DELETE FROM ${c} WHERE nonce=?`, [nonce]),
      ]);
      const result = rows.at(-2).results[0];
      if (!result) throw unavailable();
      if (result.status !== 200) {
        const detail = details[result.status] || ({ 401: 'Authentication required', 404: 'Front not found', 409: 'Idempotency key already used for a different request', 422: 'Activity cannot be recorded for a future day', 503: 'Service unavailable' })[result.status];
        let headers = {};
        if (result.status === 429) {
          try { headers = { 'Retry-After': String(JSON.parse(result.response).retry) }; } catch { throw unavailable(); }
        }
        throw new HttpError(result.status, detail || 'Service unavailable', headers);
      }
      try { return result.response === null ? null : JSON.parse(result.response); }
      catch { throw unavailable(); }
    },
  };
}
