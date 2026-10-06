import {
  MIN_DAY, SIMULATED_TODAY, TIME_ZONE, STATE_LABELS,
  freshSample, isDemoDay, periodDays, summarize, selectFronts, setCheck, saveFront,
} from './sample.mjs';

const $ = (id) => document.getElementById(id);
const concepts = {
  surrealismo: 'Un cuaderno de lo improbable: asimetría, portales y formas suspendidas.',
  impresionismo: 'Un jardín de instantes: luz, pinceladas y tarjetas sobre un lienzo claro.',
  renacimiento: 'Un libro de registro: proporción, grabado y una composición editorial.',
};
const query = new URLSearchParams(window.location.search);
const model = {
  fronts: freshSample(), look: Object.hasOwn(concepts, query.get('look')) ? query.get('look') : 'surrealismo',
  view: ['daily', 'dashboard'].includes(query.get('view')) ? query.get('view') : 'daily',
  day: SIMULATED_TODAY, period: 28, state: 'open', search: '',
};
const rowNodes = new Map();
const calendarOpen = new Set();
const shortDate = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', timeZone: TIME_ZONE });
const fullDate = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const percent = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const formatDay = (day, long = false) => (long ? fullDate : shortDate).format(new Date(`${day}T12:00:00Z`));
let editorId = null;
let editorOpener = null;
let referenceOpener = null;

// User-provided names/references only enter textContent, input values or safe attributes.
// No HTML-string renderer, external links, storage, requests or live clock.
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}
function iconButton(name, label) {
  const button = node('button', 'icon-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(name));
  return button;
}
function updateURL() {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('look', model.look);
  url.searchParams.set('view', model.view);
  window.history.replaceState(null, '', url); // Only visual choices, never activity or input.
}
function chooseLook(look) {
  if (!Object.hasOwn(concepts, look)) return;
  model.look = look;
  document.body.dataset.look = look;
  document.querySelectorAll('[data-look-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lookChoice === look));
  });
  $('look-concept').textContent = concepts[look];
  updateURL(); // CSS-only layout switch: keep records, checkbox nodes and disclosures.
}
function showNotice(message) {
  $('demo-notice').hidden = false;
  $('notice-text').textContent = `${message} Solo en esta maqueta; no guardado en la app.`;
}
function showError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}
function chooseView(view) {
  if (!['daily', 'dashboard'].includes(view)) return;
  model.view = view;
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view-choice]').forEach((button) => {
    if (button.dataset.viewChoice === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const title = node('span', 'heading-dot', '.');
  title.setAttribute('aria-hidden', 'true');
  $('page-title').replaceChildren(document.createTextNode(view === 'daily' ? 'Registro diario' : 'Dashboard'), title);
  $('page-kicker').textContent = view === 'daily' ? 'CUADERNO DE ACTIVIDAD' : 'EL PASO DE LOS DÍAS';
  $('page-description').textContent = view === 'daily'
    ? 'Un check por frente y día. Tú decides qué registrar.'
    : 'Frecuencia, no objetivos. Despliega cada frente para leer sus días.';
  $('daily-controls').hidden = view !== 'daily';
  $('period-controls').hidden = view !== 'dashboard';
  $('order-caption').textContent = view === 'daily' ? 'Orden de creación' : 'Días registrados ↓ · empates por creación';
  updateURL();
  renderRows();
}
function chooseDay(day) {
  model.day = day; // Retain invalid input as invalid, never silently use the previous date.
  $('demo-day').value = day;
  renderRows();
}
function shiftSelectedDay(amount) {
  if (!isDemoDay(model.day)) return;
  const day = new Date(Date.parse(`${model.day}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
  if (isDemoDay(day)) chooseDay(day);
}
function updateDateControls() {
  const valid = isDemoDay(model.day);
  $('demo-day').setAttribute('aria-invalid', String(!valid));
  $('previous-day').disabled = !valid || model.day === MIN_DAY;
  $('next-day').disabled = !valid || model.day === SIMULATED_TODAY;
  showError('day-error', model.view === 'daily' && !valid ? 'Elige un día válido: 07/09–04/10 de 2026. No se registra nada sin fecha válida.' : '');
}
function updateCounts(fronts, days) {
  $('result-count').textContent = `${fronts.length} ${fronts.length === 1 ? 'frente' : 'frentes'}`;
  if (model.view === 'daily') {
    $('context-metric-label').textContent = 'REGISTROS DE ESTE DÍA';
    $('context-metric-value').textContent = String(fronts.filter((front) => front.marks.includes(model.day)).length);
    $('context-metric-detail').textContent = `de ${fronts.length} frentes visibles`;
    $('context-metric-note').textContent = 'Según los checks que has marcado.';
  } else {
    $('context-metric-label').textContent = 'DÍAS DEL PERÍODO';
    $('context-metric-value').textContent = String(days.length);
    $('context-metric-detail').textContent = 'ambos extremos incluidos';
    $('context-metric-note').textContent = 'El último registro se consulta en todo el historial.';
  }
}
function tileDescription(day, marked) {
  return `${formatDay(day, true)}: ${marked ? 'actividad registrada' : 'sin actividad registrada'}`;
}
function makeRow(front, days) {
  const article = node('article', 'front-row');
  article.dataset.frontId = front.id;
  const main = node('div', 'row-main');
  const checkArea = node('label', 'check-control');
  const checkbox = node('input');
  checkbox.type = 'checkbox';
  checkbox.id = `check-${front.id}`;
  checkbox.setAttribute('aria-label', `Registrar actividad de ${front.name}, ${formatDay(isDemoDay(model.day) ? model.day : SIMULATED_TODAY, true)}`);
  checkArea.append(checkbox);
  checkArea.hidden = model.view !== 'daily';
  checkbox.addEventListener('change', () => changeCheck(front.id, checkbox));

  const identity = node('div', 'front-identity');
  const name = node('h2', 'front-name', front.name);
  name.id = `name-${front.id}`;
  article.setAttribute('aria-labelledby', name.id);
  const meta = node('div', 'front-meta');
  const number = node('span', 'row-number', String(front.created).padStart(2, '0'));
  number.setAttribute('aria-hidden', 'true');
  const badge = node('span', 'state-badge', STATE_LABELS[front.state]);
  badge.dataset.state = front.state;
  meta.append(number, badge);
  identity.append(name, meta);
  const status = node('p', 'daily-status');
  status.id = `status-${front.id}`;
  checkbox.setAttribute('aria-describedby', status.id);
  status.hidden = model.view !== 'daily';

  const coverage = node('div', 'coverage');
  coverage.hidden = model.view !== 'dashboard';
  const coverageValue = node('output', 'coverage-number');
  const count = node('p', 'period-count');
  const meter = node('meter', 'coverage-meter');
  meter.min = 0;
  meter.max = 1;
  meter.setAttribute('aria-hidden', 'true');
  coverage.append(coverageValue, count, meter);

  const last = node('dl', 'global-last');
  last.hidden = model.view !== 'dashboard';
  const lastLabel = node('dt', '', 'Último registro global');
  const lastValue = node('time');
  const lastDefinition = node('dd');
  lastDefinition.append(lastValue);
  last.append(lastLabel, lastDefinition);
  const actions = node('div', 'front-actions');
  const referenceSlot = node('span', 'reference-slot'); // Always 44 px, no empty tab stop.
  if (front.reference) {
    const button = iconButton('reference', `Ver referencia simulada de ${front.name}`);
    button.classList.add('reference-button');
    button.addEventListener('click', () => openReference(front.id, button));
    referenceSlot.append(button);
  } else referenceSlot.setAttribute('aria-hidden', 'true');
  const editButton = iconButton('edit', `Editar ${front.name}`);
  editButton.classList.add('edit-button');
  editButton.addEventListener('click', () => openEditor(front.id, editButton));
  actions.append(referenceSlot, editButton);
  main.append(checkArea, identity, status, coverage, last, actions);

  const details = node('details', 'calendar-details');
  details.hidden = model.view !== 'dashboard';
  const summary = node('summary');
  summary.append(node('span', '', `Ver los ${days.length} días`), icon('right'));
  const calendar = node('div', 'calendar-content');
  const range = node('p', 'calendar-range', `${formatDay(days[0])} — ${formatDay(days.at(-1))} 2026 · Europe/Madrid`);
  const legend = node('div', 'calendar-legend');
  const registered = node('span', 'legend-registered', 'Actividad registrada');
  const empty = node('span', 'legend-empty', 'Sin actividad registrada');
  legend.append(registered, empty);
  const grid = node('ul', 'calendar-grid');
  grid.setAttribute('aria-label', `Todos los días del período de ${front.name}`);
  const tiles = new Map();
  for (const day of days) {
    const tile = node('span', 'calendar-tile', day.slice(-2));
    tile.setAttribute('role', 'img');
    tile.dataset.date = day;
    const li = node('li');
    li.append(tile);
    grid.append(li);
    tiles.set(day, tile);
  }
  calendar.append(range, legend, grid);
  details.append(summary, calendar);
  details.open = calendarOpen.has(front.id);
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    if (details.open) calendarOpen.add(front.id); else calendarOpen.delete(front.id);
  });
  article.append(main, details);
  rowNodes.set(front.id, { article, checkbox, status, coverageValue, count, meter, lastValue, tiles, editButton });
  patchRow(front, days);
  return article;
}
function patchRow(front, days) {
  const row = rowNodes.get(front.id);
  if (!row) return;
  const marked = front.marks.includes(model.day);
  row.checkbox.checked = marked;
  row.article.dataset.marked = String(marked);
  row.status.textContent = marked ? 'Actividad registrada' : 'Sin actividad registrada';
  const stats = summarize(front, days);
  const percentage = percent.format(stats.percentage);
  row.coverageValue.textContent = `${percentage} %`;
  row.coverageValue.setAttribute('aria-label', `${percentage} por ciento de los ${stats.total} días del período`);
  row.count.textContent = `${stats.count} de ${stats.total} días registrados`;
  row.meter.value = stats.total ? stats.count / stats.total : 0;
  row.lastValue.textContent = stats.last ? formatDay(stats.last) + ' 2026' : 'Sin registros';
  if (stats.last) row.lastValue.setAttribute('datetime', stats.last);
  else row.lastValue.removeAttribute('datetime');
  for (const [day, tile] of row.tiles) {
    const checked = front.marks.includes(day);
    tile.classList.toggle('is-marked', checked);
    const description = tileDescription(day, checked);
    tile.setAttribute('aria-label', description);
    tile.title = description;
  }
}
function renderRows() {
  updateDateControls();
  rowNodes.clear();
  let fronts = [];
  let days = [];
  let invalid = '';
  try {
    days = periodDays(model.period);
    $('period-range').textContent = `${formatDay(days[0])} — ${formatDay(days.at(-1))} 2026 · ambos incluidos`;
    showError('period-error', '');
    $('demo-period').setAttribute('aria-invalid', 'false');
    if (model.view === 'daily' && !isDemoDay(model.day)) invalid = 'No hay una fecha válida seleccionada. Elige un día para ver sus checks.';
    else fronts = selectFronts(model.fronts, model);
  } catch (error) {
    invalid = error.message;
    if (error.field === 'period') {
      showError('period-error', error.message);
      $('demo-period').setAttribute('aria-invalid', 'true');
    }
  }
  updateCounts(fronts, days);
  $('front-list').replaceChildren(...fronts.map((front) => makeRow(front, days)));
  $('empty-result').hidden = fronts.length > 0;
  $('empty-result').textContent = invalid || 'No hay frentes con estos filtros. Prueba otro nombre o estado, o añade un frente de muestra.';
}
function changeCheck(id, checkbox) {
  // Only patch the mounted row and text: never rebuild, sort or refocus the daily list.
  // Fixed hit areas/status height and an out-of-flow notice avoid shifting the viewport.
  try {
    model.fronts = setCheck(model.fronts, id, model.day, checkbox.checked);
    const front = model.fronts.find((entry) => entry.id === id);
    const days = periodDays(model.period);
    patchRow(front, days);
    updateCounts(selectFronts(model.fronts, model), days);
    showNotice(`${checkbox.checked ? 'Actividad marcada' : 'Registro quitado'} el ${formatDay(model.day)} de 2026.`);
  } catch (error) {
    const front = model.fronts.find((entry) => entry.id === id);
    checkbox.checked = !!front?.marks.includes(model.day);
    showNotice(`No se ha cambiado el check. ${error.message}`);
  }
}
function clearEditorError() {
  showError('editor-error', '');
  for (const id of ['front-name', 'front-reference', 'front-state']) {
    $(id).removeAttribute('aria-invalid');
    $(id).removeAttribute('aria-errormessage');
  }
}
function openEditor(id, opener) {
  const front = id === null ? null : model.fronts.find((entry) => entry.id === id);
  if (id !== null && !front) { showNotice('Ese frente no está en la muestra. Vuelve a seleccionarlo.'); return; }
  editorId = id;
  editorOpener = opener;
  clearEditorError();
  $('front-name').value = front?.name ?? '';
  $('front-reference').value = front?.reference ?? '';
  $('front-state').value = front?.state ?? 'open';
  $('editor-title').textContent = front ? 'Editar frente ficticio' : 'Nuevo frente ficticio';
  $('front-editor').showModal();
  $('front-name').focus();
}
function closeEditor() { $('front-editor').close(); }
function returnEditorFocus() {
  const target = editorOpener?.isConnected ? editorOpener : rowNodes.get(editorId)?.editButton ?? $('new-front');
  target.focus({ preventScroll: true });
  editorId = null;
  editorOpener = null;
  clearEditorError();
}
function submitEditor(event) {
  event.preventDefault(); // No native form navigation, even if validation fails.
  if (!$('front-editor').open) return;
  clearEditorError();
  try {
    model.fronts = saveFront(model.fronts, editorId, {
      name: $('front-name').value, reference: $('front-reference').value, state: $('front-state').value,
    });
    const edited = editorId !== null;
    renderRows();
    closeEditor();
    showNotice(edited ? 'Frente de muestra actualizado; historial conservado.' : 'Frente ficticio añadido, sin registros.');
  } catch (error) {
    showError('editor-error', error.message);
    const field = { name: 'front-name', reference: 'front-reference', state: 'front-state' }[error.field];
    if (field) {
      $(field).setAttribute('aria-invalid', 'true');
      $(field).setAttribute('aria-errormessage', 'editor-error');
      $(field).focus();
    }
  }
}
function openReference(id, opener) {
  const front = model.fronts.find((entry) => entry.id === id);
  if (!front?.reference) return;
  referenceOpener = opener;
  $('reference-front-name').textContent = front.name;
  $('reference-url').textContent = front.reference;
  $('reference-preview').showModal();
}
function resetDemo() {
  model.fronts = freshSample();
  model.day = SIMULATED_TODAY;
  model.period = 28;
  model.state = 'open';
  model.search = '';
  calendarOpen.clear();
  $('demo-day').value = model.day;
  $('demo-period').value = '28';
  $('state-filter').value = 'open';
  $('front-search').value = '';
  renderRows();
  showNotice('Muestra reiniciada. Se mantienen la propuesta y la vista elegidas.');
}

document.querySelectorAll('[data-look-choice]').forEach((button) => button.addEventListener('click', () => chooseLook(button.dataset.lookChoice)));
document.querySelectorAll('[data-view-choice]').forEach((button) => button.addEventListener('click', () => chooseView(button.dataset.viewChoice)));
$('front-search').addEventListener('input', (event) => { model.search = event.target.value; renderRows(); });
$('state-filter').addEventListener('change', (event) => { model.state = event.target.value; renderRows(); });
$('demo-day').addEventListener('input', (event) => chooseDay(event.target.value));
$('demo-period').addEventListener('change', (event) => { model.period = Number(event.target.value); calendarOpen.clear(); renderRows(); });
$('previous-day').addEventListener('click', () => shiftSelectedDay(-1));
$('next-day').addEventListener('click', () => shiftSelectedDay(1));
$('simulated-today').addEventListener('click', () => chooseDay(SIMULATED_TODAY));
$('new-front').addEventListener('click', (event) => openEditor(null, event.currentTarget));
$('front-form').addEventListener('submit', submitEditor);
$('close-editor').addEventListener('click', closeEditor);
$('cancel-editor').addEventListener('click', closeEditor);
$('front-editor').addEventListener('close', returnEditorFocus); // Native Escape/cancel, focus trap and return focus.
for (const id of ['close-reference', 'accept-reference']) $(id).addEventListener('click', () => $('reference-preview').close());
$('reference-preview').addEventListener('close', () => { referenceOpener?.focus({ preventScroll: true }); referenceOpener = null; });
$('reset-demo').addEventListener('click', resetDemo);
$('dismiss-notice').addEventListener('click', () => { $('demo-notice').hidden = true; });
chooseLook(model.look);
chooseView(model.view);
