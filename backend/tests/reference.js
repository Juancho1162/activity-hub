import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root } from './fixture.js';

export function pythonReference(action, args) {
  const result = spawnSync(path.resolve(root, '../.venv/bin/python'), ['-B', path.join(root, 'tests/python_reference.py')], {
    cwd: root, env: process.env, input: JSON.stringify({ action, ...args }), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Temporary Python differential fixture failed');
  return JSON.parse(result.stdout);
}
