import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Frozen outputs from the retired Python implementation, recorded and checked
// against the Worker before removing the experiments. No Python runtime needed.
export function recordedReference(action, args) {
  let source = readFileSync(new URL(`./fixtures/legacy/${action}.json`, import.meta.url), 'utf8');
  if (action === 'replays') {
    source = source.replaceAll('11111111-1111-1111-1111-111111111111', args.account_id)
      .replaceAll('11111111111111111111111111111111', args.account_id.replaceAll('-', ''));
  }
  const recorded = JSON.parse(source);
  assert.deepEqual(args, recorded.input, 'Recorded contract inputs must match the test cases');
  return recorded.result;
}
