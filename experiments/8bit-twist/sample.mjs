// Fictional, finite and deliberately independent of the product/API.
export const SIMULATED_TODAY = '2026-10-04';
export const MIN_DAY = '2026-09-07';
export const TIME_ZONE = 'Europe/Madrid';
export const STATE_LABELS = Object.freeze({ open: 'Abierto', standby: 'Standby', archived: 'Archivado' });
const DAY_MS = 86_400_000;

export class SampleError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'SampleError';
    this.field = field;
  }
}

const fixture = [
  { id: 'sample-01', created: 1, name: 'Cartografía sonora del barrio', state: 'open', reference: 'https://example.invalid/cartografia', marks: ['2026-09-07', '2026-09-10', '2026-09-14', '2026-09-18', '2026-09-23', '2026-09-27', '2026-09-29', '2026-10-01', '2026-10-03', '2026-10-04'] },
  { id: 'sample-02', created: 2, name: 'Laboratorio de interfaces y tipografía', state: 'open', reference: 'https://example.invalid/interfaces', marks: ['2026-09-08', '2026-09-12', '2026-09-16', '2026-09-20', '2026-09-24', '2026-09-29', '2026-10-01', '2026-10-03', '2026-10-04'] },
  { id: 'sample-03', created: 3, name: 'Lectura de ficción especulativa', state: 'open', reference: null, marks: ['2026-09-09', '2026-09-13', '2026-09-19', '2026-09-25', '2026-09-28', '2026-09-30', '2026-10-02'] },
  { id: 'sample-04', created: 4, name: 'Huerto de balcón y cuaderno de cultivo', state: 'open', reference: null, marks: ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-30', '2026-10-04'] },
  { id: 'sample-05', created: 5, name: 'Restauración de una radio de sobremesa', state: 'open', reference: null, marks: [] },
  { id: 'sample-06', created: 6, name: 'Archivo de fotografía nocturna', state: 'standby', reference: 'https://example.invalid/fotografia', marks: ['2026-09-07', '2026-09-10', '2026-09-16', '2026-09-20'] },
  { id: 'sample-07', created: 7, name: 'Aprender síntesis modular', state: 'standby', reference: null, marks: ['2026-09-09', '2026-09-15', '2026-09-28', '2026-10-02'] },
  { id: 'sample-08', created: 8, name: 'Ensayo sobre ciudades y memoria', state: 'archived', reference: 'https://example.invalid/ensayo', marks: ['2026-09-07', '2026-09-11', '2026-09-13'] },
];

export function freshSample() {
  return fixture.map((front) => ({ ...front, marks: [...front.marks] }));
}

export function isDemoDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < MIN_DAY || day > SIMULATED_TODAY) return false;
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function requireDay(day) {
  if (!isDemoDay(day)) throw new SampleError('Elige una fecha entre el 07/09 y el 04/10 de 2026 (hoy simulado).', 'day');
}

export function inclusiveDays(start, end) {
  requireDay(start);
  requireDay(end);
  if (start > end) throw new SampleError('El inicio no puede ser posterior al final.', 'day');
  const result = [];
  for (let stamp = Date.parse(`${start}T12:00:00Z`); stamp <= Date.parse(`${end}T12:00:00Z`); stamp += DAY_MS) {
    result.push(new Date(stamp).toISOString().slice(0, 10));
  }
  return result;
}

export function periodDays(length) {
  if (![7, 14, 28].includes(length)) throw new SampleError('El período de muestra debe ser de 7, 14 o 28 días.', 'period');
  const start = new Date(Date.parse(`${SIMULATED_TODAY}T12:00:00Z`) - (length - 1) * DAY_MS).toISOString().slice(0, 10);
  return inclusiveDays(start, SIMULATED_TODAY);
}

export function summarize(front, days) {
  const marks = new Set(front.marks);
  const count = days.filter((day) => marks.has(day)).length;
  return {
    count, total: days.length, percentage: days.length ? count / days.length * 100 : 0,
    last: [...marks].sort().at(-1) ?? null, // Global, not restricted to selected period.
  };
}

function requireState(state, all = false) {
  if (!Object.hasOwn(STATE_LABELS, state) && !(all && state === 'all')) throw new SampleError('Selecciona un estado válido.', 'state');
}

// Match the existing product's literal substring / ASCII case behavior.
const searchable = (text) => text.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const creationOrder = (a, b) => a.created - b.created || a.id.localeCompare(b.id);

export function selectFronts(fronts, { state = 'open', search = '', view = 'daily', period = 28 } = {}) {
  requireState(state, true);
  if (!['daily', 'dashboard'].includes(view)) throw new SampleError('Selecciona una vista válida.', 'view');
  const term = searchable(search);
  const filtered = fronts.filter((front) => (state === 'all' || front.state === state) && searchable(front.name).includes(term));
  if (view === 'daily') return filtered.sort(creationOrder);
  const days = periodDays(period);
  return filtered.sort((a, b) => summarize(b, days).count - summarize(a, days).count || creationOrder(a, b));
}

export function setCheck(fronts, id, day, marked) {
  requireDay(day);
  if (typeof marked !== 'boolean') throw new SampleError('El check debe ser marcado o desmarcado explícitamente.', 'check');
  if (!fronts.some((front) => front.id === id)) throw new SampleError('Ese frente ya no está en la muestra. Vuelve a seleccionarlo.', 'front');
  return fronts.map((front) => {
    if (front.id !== id) return front;
    const marks = new Set(front.marks);
    if (marked) marks.add(day); else marks.delete(day);
    return { ...front, marks: [...marks].sort() };
  });
}

export function safeReference(value) {
  const reference = typeof value === 'string' ? value.trim() : '';
  if (!reference) return null;
  if ([...reference].length > 2048 || !/^https?:\/\//i.test(reference) || /[\u0000-\u0020\u007f]/u.test(reference)) {
    throw new SampleError('Usa una URL HTTP(S) absoluta, sin espacios y de hasta 2048 caracteres.', 'reference');
  }
  let url;
  try { url = new URL(reference); } catch { throw new SampleError('La referencia debe ser una URL HTTP o HTTPS válida.', 'reference'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new SampleError('La referencia debe ser HTTP(S), sin usuario ni contraseña.', 'reference');
  }
  const normalized = url.href;
  if ([...normalized].length > 2048) {
    throw new SampleError('La URL normalizada supera los 2048 caracteres. Acorta la referencia.', 'reference');
  }
  return normalized;
}

export function saveFront(fronts, id, draft) {
  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  if (!name || [...name].length > 200 || name.includes('\0')) throw new SampleError('Escribe un nombre de 1 a 200 caracteres, sin NUL.', 'name');
  requireState(draft.state);
  const reference = safeReference(draft.reference);
  if (id !== null && !fronts.some((front) => front.id === id)) throw new SampleError('Ese frente ya no está en la muestra. Cierra y vuelve a seleccionarlo.', 'front');
  if (id !== null) return fronts.map((front) => front.id === id ? { ...front, name, reference, state: draft.state } : front);
  const created = Math.max(0, ...fronts.map((front) => front.created)) + 1;
  return [...fronts, { id: `sample-${String(created).padStart(2, '0')}`, created, name, reference, state: draft.state, marks: [] }];
}
