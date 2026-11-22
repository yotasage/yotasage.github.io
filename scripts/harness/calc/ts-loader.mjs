// Minimal Node 22 ESM loader hook using Node's built-in stripTypeScriptTypes
// so harness scripts can import `../../../lib/calc/*.ts` with zero external packages.
import { register } from 'node:module';

const hookSource = `
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of ['.ts', '.tsx']) {
        const candidate = new URL(base.href + ext);
        if (fs.existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = fs.readFileSync(fileURLToPath(url), 'utf8');
    const stripped = stripTypeScriptTypes(source, { mode: 'strip' });
    return { format: 'module', source: stripped, shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(hookSource).toString('base64')}`);
