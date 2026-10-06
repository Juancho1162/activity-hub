// SQLite, not Worker Date.now(), supplies the authoritative transaction time.
export function databaseClock() {
  return { sql: "strftime('%Y-%m-%d %H:%M:%f000', 'now')", bindings: [], hint: Date.now() };
}
export function utcText(milliseconds) {
  return new Date(milliseconds).toISOString().replace('T', ' ').replace('Z', '000');
}
export function utcOutput(text) {
  const [date, fraction] = text.split('.');
  return date.replace(' ', 'T') + (fraction && /[1-9]/.test(fraction) ? `.${fraction.padEnd(6, '0')}` : '') + 'Z';
}
const madridOffset = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' });
function offsetSeconds(milliseconds) {
  const offset = madridOffset.formatToParts(new Date(milliseconds)).find(part => part.type === 'timeZoneName').value;
  if (offset === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(offset);
  if (!match) throw new Error('Madrid timezone unavailable');
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0));
}
export function madridSQL(hint, column = 'clock.now') {
  // Date.now is ONLY a hint for IANA offset intervals, NEVER the chosen date.
  // Build five UTC days around it (including any Madrid DST transition). SQL
  // selects the interval containing its OWN captured time. Even a queue that
  // crosses midnight/DST resolves at serialization, not at the HTTP gate.
  // If a >2-day queue/clock skew leaves these intervals, fresh checks fail 503
  // without reserving a key. Reads/replays/auth do not need this timezone hint.
  // No guessed SQL 'localtime' zone or hardcoded current Madrid UTC offset.
  const day = 86400000;
  const start = Math.floor(hint / day) * day - 2 * day;
  const end = start + 5 * day;
  const intervals = [];
  let left = start;
  let offset = offsetSeconds(left);
  for (let sample = start + 12 * 3600000; sample <= end; sample += 12 * 3600000) {
    const next = offsetSeconds(sample);
    if (next !== offset) {
      let low = sample - 12 * 3600000;
      let high = sample;
      // IANA transitions occur at a whole second. Search in integer seconds.
      while (high - low > 1000) {
        const mid = Math.floor((low + high) / 2000) * 1000;
        if (offsetSeconds(mid) === offset) low = mid; else high = mid;
      }
      intervals.push([left, high, offset]);
      left = high;
      offset = next;
    }
  }
  intervals.push([left, end, offset]);
  return {
    sql: `CASE ${intervals.map(() => `WHEN ${column} >= ? AND ${column} < ? THEN date(${column}, ?)`).join(' ')} END`,
    bindings: intervals.flatMap(([begin, finish, seconds]) => [utcText(begin), utcText(finish), `${seconds} seconds`]),
  };
}
