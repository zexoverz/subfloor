/**
 * The showcase surface may not use the permission register: seven prior ETHGlobal projects own
 * that ground, and a judge who pattern-matches this into "another agent-permissions project"
 * never looks twice. Cheaper to grep than to re-shoot a video around a screen that says the wrong
 * word.
 *
 * Comments are exempt — internal prose may use whatever word is accurate. Copy may not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  'limit', 'policy', 'permission', 'guardrail', 'cap', 'allowlist', 'firewall', 'zero-trust',
  'circuit breaker', 'spending', 'monitors', 'blocks', 'sentinel', 'warden', 'leash',
];
const RE = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'gi');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path;
  });

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failed = false;
for (const file of walk('src').filter((f) => /\.tsx?$/.test(f))) {
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      for (const hit of line.matchAll(RE)) {
        console.error(`${file}:${i + 1}  banned word "${hit[0]}"`);
        failed = true;
      }
    });
}

console.log(failed ? 'copy gate failed' : 'copy clean');
process.exit(failed ? 1 : 0);
