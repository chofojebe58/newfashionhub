#!/usr/bin/env node
/**
 * Runs the API and the Vite dev server together with prefixed, colourised
 * output. Zero dependencies — `npm run dev` from the repo root is all you need.
 *
 * Ctrl-C stops both.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { name: 'api', color: '\x1b[36m', cwd: resolve(root, 'backend'), args: ['run', 'dev'] },
  { name: 'web', color: '\x1b[35m', cwd: resolve(root, 'frontend'), args: ['run', 'dev'] },
];

const RESET = '\x1b[0m';
const children = [];
let shuttingDown = false;

function prefix(name, color, chunk) {
  return chunk
    .toString()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `${color}[${name}]${RESET} ${line}`)
    .join('\n');
}

for (const target of targets) {
  const child = spawn('npm', target.args, {
    cwd: target.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(prefix(target.name, target.color, chunk) + '\n'));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix(target.name, target.color, chunk) + '\n'));

  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.stdout.write(`${target.color}[${target.name}]${RESET} exited with code ${code}\n`);
    shutdown(code ?? 1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
