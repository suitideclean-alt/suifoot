// SF.Q: accuracy against Math.* and exactness of the integer helpers.
const SF = require('./load.js');
const Q = SF.Q;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } }
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
t('exp matches Math.exp to 1e-13 over -30..30', () => { for (let x = -30; x <= 30; x += 0.137) if (rel(Q.exp(x), Math.exp(x)) > 1e-13) throw new Error('x=' + x + ' ' + Q.exp(x) + ' vs ' + Math.exp(x)); });
t('ln matches Math.log to 1e-13 over 1e-6..1e9', () => { for (let x = 1e-6; x < 1e9; x *= 1.37) if (Math.abs(Q.ln(x) - Math.log(x)) > 1e-12) throw new Error('x=' + x); });
t('pow matches Math.pow to 1e-12 (game ranges)', () => { for (const [a, b] of [[1.06, 46], [1.45, 9], [0.75, 1.1], [1.3, 1.1], [0.4, 0.6], [3.2, 0.6]]) if (rel(Q.pow(a, b), Math.pow(a, b)) > 1e-12) throw new Error(a + '^' + b); });
t('sqrt matches Math.sqrt to 1e-14', () => { for (let x = 1e-4; x < 1e8; x *= 1.31) if (rel(Q.sqrt(x), Math.sqrt(x)) > 1e-14) throw new Error('x=' + x); });
t('cos matches Math.cos to 1e-13 on [0, 2pi)', () => { for (let x = 0; x < 6.2831; x += 0.0137) if (Math.abs(Q.cos(x) - Math.cos(x)) > 1e-13) throw new Error('x=' + x); });
t('isqrt and ilog2 are exact', () => { for (let n = 0; n < 5000; n++) { const r = Q.isqrt(n); if (r * r > n || (r + 1) * (r + 1) <= n) throw new Error('isqrt ' + n); } for (let n = 1; n < 5000; n++) if (2 ** Q.ilog2(n) > n || 2 ** (Q.ilog2(n) + 1) <= n) throw new Error('ilog2 ' + n); });
t('the game logic never calls Math.exp/log/pow/sin/cos/random', () => {
  const fs = require('fs'), path = require('path');
  for (const f of ['core', 'bank', 'body', 'world', 'match', 'game', 'owner', 'boss', 'actions', 'extras']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const m = s.match(/Math\.(exp|log|log2|log10|pow|sin|cos|tan|atan|atan2|tanh|cbrt|hypot|random)\b/);
    if (m) throw new Error(f + '.js uses Math.' + m[1]);
  }
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
