import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateTarget } from '../scripts/release.js';

test('release destination gate rejects wrong accounts/databases, missing limits, plaintext secrets and open previews', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  config.env.production.vars.TURNSTILE_SITEKEY = 'synthetic-public-sitekey';
  assert.equal(validateTarget(config).name, 'activity-hub');
  for (const change of [
    c => { c.env.production.account_id = 'another-account'; },
    c => { c.env.production.d1_databases[0].database_id = 'another-database'; },
    c => { c.env.production.ratelimits = []; },
    c => { c.env.production.vars.TURNSTILE_SITEKEY = ''; },
    c => { c.env.production.vars.TURNSTILE_SECRET = 'must-not-be-versioned'; },
    c => { c.env.production.preview_urls = true; },
  ]) {
    const copy = structuredClone(config);
    change(copy);
    assert.throws(() => validateTarget(copy));
  }
});
