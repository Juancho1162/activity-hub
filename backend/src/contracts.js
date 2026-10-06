export class HttpError extends Error {
  constructor(status, detail, headers = {}) { super(detail); this.status = status; this.headers = headers; }
}
export const unavailable = () => new HttpError(503, 'Service unavailable');
export const invalid = () => new HttpError(422, 'Invalid request');
const states = ['open', 'standby', 'archived'];
const own = (object, key) => Object.hasOwn(object, key);
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid();
  return value;
}
export function name(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw invalid();
  // Python str.strip, not JS trim (which trims FEFF but misses 001c-001f/0085).
  value = value.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, '');
  if ([...value].length < 1 || [...value].length > 200) throw invalid();
  return value;
}
export function reference(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || [...value].length > 2048) throw invalid();
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || [...url.href].length > 2048) throw invalid();
    return url.href;
  } catch { throw invalid(); }
}
export function frontInput(value, patch = false) {
  object(value, ['name', 'reference', 'state']);
  if (patch && Object.keys(value).length === 0) throw invalid();
  const out = patch ? {} : { name: name(value.name), reference: null, state: 'open' };
  if (own(value, 'name')) out.name = name(value.name);
  if (own(value, 'reference')) out.reference = reference(value.reference);
  if (own(value, 'state')) {
    if (!states.includes(value.state)) throw invalid();
    out.state = value.state;
  }
  return out;
}
export function isoDay(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.slice(0, 4) === '0000') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function checkInput(value) {
  object(value, ['day', 'marked']);
  if (!(value.day === 'today' || value.day === 'yesterday' || isoDay(value.day)) || typeof value.marked !== 'boolean') throw invalid();
  return { day: value.day, marked: value.marked };
}
export function uuidHex(value) {
  if (typeof value !== 'string') throw invalid();
  value = value.replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1');
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value)) throw invalid();
  return value.replaceAll('-', '').toLowerCase();
}
export function uuidText(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function integer(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  // Pydantic's query integer parser accepts e.g. +1, 01, 1_0 and 1.00.
  const normalized = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
  if (!/^[+-]?[0-9]+(?:_[0-9]+)*(?:\.0+)?$/.test(normalized)) throw invalid();
  const result = Number(normalized.replaceAll('_', ''));
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw invalid();
  return result;
}
export function queryInput(params, kind) {
  const history = kind === 'history';
  const window = kind !== 'fronts';
  const allowed = ['limit', 'offset', ...(!history ? ['states', 'search'] : []),
    ...(window ? ['start', 'end', 'front_id'] : []), ...(kind === 'dashboard' ? ['order'] : [])];
  if ([...params.keys()].some(key => !allowed.includes(key))) throw invalid();
  const last = key => params.getAll(key).at(-1);
  const result = {
    limit: integer(last('limit'), history ? 100 : 50, 1, history ? 1000 : 100),
    offset: integer(last('offset'), 0, 0, 100000),
  };
  if (!history) {
    result.states = params.getAll('states');
    if (result.states.length > 3 || result.states.some(state => !states.includes(state))) throw invalid();
    result.search = params.has('search') ? name(last('search')) : null;
  }
  if (window) {
    result.start = last('start'); result.end = last('end');
    if (!isoDay(result.start) || !isoDay(result.end) || result.end < result.start
      || (Date.parse(result.end) - Date.parse(result.start)) / 86400000 + 1 > 366) throw invalid();
    result.front_id = params.has('front_id') ? uuidHex(last('front_id')) : null;
  }
  if (kind === 'dashboard') {
    result.order = last('order') ?? 'created';
    if (!['created', 'activity_desc'].includes(result.order)) throw invalid();
  }
  return result;
}
export function canonicalPayload(value) {
  // Match Python json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True).
  const sorted = Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  return JSON.stringify(sorted).replace(/[\u007f-\uffff]/g, unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export async function input(request, auth = false, maxBytes = auth ? 1024 : 16384) {
  const type = request.headers.get('Content-Type');
  // Fetch coalesces duplicate Content-Type lines. A comma outside a quoted
  // parameter remains a list even when the first media type has a charset.
  let quoted = false;
  let escaped = false;
  let listed = false;
  for (const symbol of type || '') {
    if (escaped) { escaped = false; continue; }
    if (quoted && symbol === '\\') escaped = true;
    else if (symbol === '"') quoted = !quoted;
    else if (!quoted && symbol === ',') listed = true;
  }
  const media = type?.split(';', 1)[0].trim().toLowerCase();
  if (auth && (listed || media !== 'application/json')) throw new HttpError(415, 'JSON required');
  // The installed FastAPI uses strict_content_type=True: an absent header
  // also fails validation. Keep application/json and application/*+json.
  if (!auth && !(media === 'application/json' || /^application\/[^\s/]+\+json$/.test(media || ''))) throw invalid();
  // Bound every body by actual streamed bytes, never by Content-Length.
  const reader = request.body?.getReader();
  const chunks = [];
  let length = 0;
  try {
    if (reader) for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Request too large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(auth ? 400 : 422, 'Invalid request');
  } finally { reader?.releaseLock(); }
}
