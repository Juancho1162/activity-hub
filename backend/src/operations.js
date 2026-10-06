import { canonicalPayload, unavailable, uuidText } from './contracts.js';
import { context, frontJSON, uuidSQL } from './sql.js';

function requireFront(ctx, front) {
  ctx.add(`UPDATE ${ctx.c} SET status=404 WHERE nonce=? AND status=200 AND NOT EXISTS (SELECT 1 FROM fronts WHERE id=? AND account_id=${ctx.c}.account_id)`, [ctx.nonce, front]);
}
function conflict(ctx, key, operation, target, payload) {
  ctx.add(`UPDATE ${ctx.c} SET status=409 WHERE nonce=? AND status=200 AND EXISTS
    (SELECT 1 FROM idempotency_requests r WHERE r.account_id=${ctx.c}.account_id AND r.key=?
      AND (r.operation<>? OR r.target IS NOT ? OR r.payload<>?))`, [ctx.nonce, key, operation, target, payload]);
}
const fresh = alias => `NOT EXISTS (SELECT 1 FROM idempotency_requests r WHERE r.account_id=${alias}.account_id AND r.key=?)`;
function remember(ctx, key, operation, target, payload) {
  ctx.add(`INSERT INTO idempotency_requests(account_id,key,operation,target,payload,response,created_at)
    SELECT c.account_id,?,?,?,?,c.response,c.now FROM ${ctx.c} c WHERE c.nonce=? AND c.status=200 AND ${fresh('c')}`, [key, operation, target, payload, ctx.nonce, key]);
  ctx.add(`UPDATE ${ctx.c} SET response=(SELECT r.response FROM idempotency_requests r WHERE r.account_id=${ctx.c}.account_id AND r.key=?) WHERE nonce=? AND status=200`, [key, ctx.nonce]);
}
export class Operations {
  constructor(DB, clock, proof) { this.DB = DB; this.clock = clock; this.proof = proof; }
  list(query) { return this.frontPage(query, false); }
  dashboard(query) { return this.frontPage(query, true); }
  async frontPage(query, dashboard) {
    const ctx = context(this.DB, this.clock, this.proof);
    if (query.front_id) requireFront(ctx, query.front_id);
    const filters = [`f.account_id=${ctx.c}.account_id`];
    const bindings = [];
    if (query.states.length) {
      filters.push(`f.state IN (${query.states.map(() => '?').join(',')})`);
      bindings.push(...query.states);
    }
    if (query.search !== null) {
      // SQLite lower() folds ASCII only, matching the reference LIKE behavior.
      // instr() preserves literal %, _ and long searches beyond D1 LIKE's limit.
      filters.push('instr(lower(f.name),lower(?))>0'); bindings.push(query.search);
    }
    if (query.front_id) { filters.push('f.id=?'); bindings.push(query.front_id); }
    const rangeCount = dashboard ? '(SELECT count(*) FROM activity_checks ch WHERE ch.front_id=f.id AND ch.day>=? AND ch.day<=?)' : '0';
    const order = query.order === 'activity_desc' ? 'range_count DESC,created_at,id' : 'created_at,id';
    const item = dashboard ? `json_object('front',${frontJSON()},
      'marked_dates',json((SELECT json_group_array(day) FROM
        (SELECT day FROM activity_checks WHERE front_id=f.id AND day>=? AND day<=? ORDER BY day))),
      'last_registered_day',(SELECT max(day) FROM activity_checks WHERE front_id=f.id),
      'count',f.range_count)` : frontJSON();
    // The page stays in SQL: no expanded list of 100 IDs/parameters, and both
    // total and rows share the authorization snapshot and ordering before LIMIT.
    ctx.add(`UPDATE ${ctx.c} SET response=(
      WITH filtered AS MATERIALIZED (SELECT f.*,${rangeCount} AS range_count FROM fronts f WHERE ${filters.join(' AND ')}),
      page AS MATERIALIZED (SELECT * FROM filtered ORDER BY ${order} LIMIT ? OFFSET ?)
      SELECT json_object('items',json((SELECT json_group_array(json(item)) FROM
        (SELECT ${item} AS item FROM page f ORDER BY ${order}))),
        'total',(SELECT count(*) FROM filtered),'limit',?,'offset',?${dashboard ? ",'start',?,'end',?" : ''})
      ) WHERE nonce=? AND status=200`, [
      ...(dashboard ? [query.start, query.end] : []), ...bindings, query.limit, query.offset,
      ...(dashboard ? [query.start, query.end] : []), query.limit, query.offset,
      ...(dashboard ? [query.start, query.end] : []), ctx.nonce,
    ]);
    return ctx.finish();
  }
  async history(query) {
    const ctx = context(this.DB, this.clock, this.proof);
    if (query.front_id) requireFront(ctx, query.front_id);
    ctx.add(`UPDATE ${ctx.c} SET response=(
      WITH filtered AS MATERIALIZED (
        SELECT ch.front_id,ch.day FROM activity_checks ch JOIN fronts f ON f.id=ch.front_id
        WHERE f.account_id=${ctx.c}.account_id AND ch.day>=? AND ch.day<=?${query.front_id ? ' AND f.id=?' : ''}),
      page AS MATERIALIZED (SELECT * FROM filtered ORDER BY day,front_id LIMIT ? OFFSET ?)
      SELECT json_object('items',json((SELECT json_group_array(json(item)) FROM
        (SELECT json_object('front_id',${uuidSQL('front_id')},'day',day,'marked',json('true')) AS item FROM page ORDER BY day,front_id))),
        'total',(SELECT count(*) FROM filtered),'limit',?,'offset',?,'start',?,'end',?,'front_id',?)
      ) WHERE nonce=? AND status=200`, [query.start, query.end, ...(query.front_id ? [query.front_id] : []),
      query.limit, query.offset, query.limit, query.offset, query.start, query.end,
      query.front_id ? uuidText(query.front_id) : null, ctx.nonce]);
    return ctx.finish();
  }
  async create(data, key) {
    const payload = canonicalPayload(data);
    const ctx = context(this.DB, this.clock, this.proof);
    const { c, nonce } = ctx;
    conflict(ctx, key, 'create_front', null, payload);
    const id = crypto.randomUUID().replaceAll('-', '');
    ctx.add(`INSERT INTO fronts(id,account_id,name,reference,state,created_at,updated_at)
      SELECT ?,c.account_id,?,?,?,c.now,c.now FROM ${c} c WHERE c.nonce=? AND c.status=200 AND ${fresh('c')}`, [id, data.name, data.reference, data.state, nonce, key]);
    ctx.add(`UPDATE ${c} SET response=(SELECT ${frontJSON()} FROM fronts f WHERE f.id=? AND f.account_id=${c}.account_id) WHERE nonce=? AND status=200 AND ${fresh(c)}`, [id, nonce, key]);
    remember(ctx, key, 'create_front', null, payload);
    const result = await ctx.finish();
    if (!result) throw unavailable();
    return result;
  }
  async get(id) {
    const ctx = context(this.DB, this.clock, this.proof);
    requireFront(ctx, id);
    ctx.add(`UPDATE ${ctx.c} SET response=(SELECT ${frontJSON()} FROM fronts f WHERE f.id=? AND f.account_id=${ctx.c}.account_id) WHERE nonce=? AND status=200`, [id, ctx.nonce]);
    const result = await ctx.finish();
    if (!result) throw unavailable();
    return result;
  }
  async patch(id, data) {
    const ctx = context(this.DB, this.clock, this.proof);
    requireFront(ctx, id);
    // Input whitelist supplies identifiers; all activity values are parameters.
    const fields = Object.keys(data);
    ctx.add(`UPDATE fronts SET ${fields.map(field => `${field}=?`).join(',')},updated_at=(SELECT now FROM ${ctx.c} WHERE nonce=?)
      WHERE id=? AND account_id=? AND (SELECT status FROM ${ctx.c} WHERE nonce=?)=200`, [...fields.map(field => data[field]), ctx.nonce, id, this.proof.account_id, ctx.nonce]);
    ctx.add(`UPDATE ${ctx.c} SET response=(SELECT ${frontJSON()} FROM fronts f WHERE f.id=? AND f.account_id=${ctx.c}.account_id) WHERE nonce=? AND status=200`, [id, ctx.nonce]);
    return ctx.finish();
  }
  async check(id, data, key) {
    const payload = canonicalPayload(data);
    const ctx = context(this.DB, this.clock, this.proof, { madrid: true });
    const { c, nonce } = ctx;
    requireFront(ctx, id); // Foreign/missing target is 404 BEFORE key conflict.
    conflict(ctx, key, 'write_check', id, payload);
    const resolved = alias => `CASE ? WHEN 'today' THEN ${alias}.today WHEN 'yesterday' THEN date(${alias}.today,'-1 day') ELSE ? END`;
    // Existing replay is checked BEFORE future-date (or timezone-hint) validation.
    ctx.add(`UPDATE ${c} SET status=503 WHERE nonce=? AND status=200 AND today IS NULL AND ${fresh(c)}`, [nonce, key]);
    ctx.add(`UPDATE ${c} SET status=422 WHERE nonce=? AND status=200 AND (${resolved(c)})>today AND ${fresh(c)}`, [nonce, data.day, data.day, key]);
    if (data.marked) {
      ctx.add(`INSERT INTO activity_checks(front_id,day) SELECT ?,${resolved('c')} FROM ${c} c WHERE c.nonce=? AND c.status=200 AND ${fresh('c')}
        ON CONFLICT(front_id,day) DO NOTHING`, [id, data.day, data.day, nonce, key]);
    } else {
      ctx.add(`DELETE FROM activity_checks WHERE front_id=? AND day=(SELECT ${resolved('c')} FROM ${c} c WHERE c.nonce=? AND c.status=200 AND ${fresh('c')})`, [id, data.day, data.day, nonce, key]);
    }
    ctx.add(`UPDATE ${c} SET response=json_object('front_id',${uuidSQL('?')},'day',${resolved(c)},'marked',json(?)) WHERE nonce=? AND status=200 AND ${fresh(c)}`,
      // uuidSQL repeats its argument five times. These are the same target.
      [id, id, id, id, id, data.day, data.day, data.marked ? 'true' : 'false', nonce, key]);
    remember(ctx, key, 'write_check', id, payload);
    const result = await ctx.finish();
    if (!result) throw unavailable();
    return result;
  }
}
