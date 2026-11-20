// The fixed-point maths that the Move port is written from. It has to agree with the engine
// closely enough that a season played with it is the same season, and we measure how much
// precision that really takes instead of assuming.
const path = require('path');
require(path.join(__dirname, '..', 'src', 'fixed.js'));
const SF = require('./load.js');
const { Game, Q, FX: X } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const near = (got, want, tol, m) => { const d = Math.abs(got - want); if (!(d <= tol)) throw new Error(`${m || ''} ${got} vs ${want}, off by ${d.toExponential(2)}, allowed ${tol.toExponential(2)}`); };

t('whole numbers only: no doubles leak into the fixed-point maths', () => {
  for (const [n, v] of [['exp', X.exp(X.from(1))], ['ln', X.ln(X.from(2))], ['sqrt', X.sqrt(X.from(2))], ['cos', X.cos(X.from(1))], ['pow', X.pow(X.from(2), X.from(3))]]) {
    eq(typeof v, 'bigint', n + ' did not return a whole number;');
  }
  eq(typeof X.isqrt(144n), 'bigint');
  // the source must not call Math.* or divide with a decimal point
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'fixed.js'), 'utf8');
  const body = src.slice(src.indexOf('(function'));
  const calls = body.match(/Math\.\w+/g) || [];
  eq(calls.filter((c) => c !== 'Math.round').length, 0, 'the maths calls into Math.*: ' + calls.join(' ') + ';');
});

t('the signs behave: multiply and divide carry them as Move must', () => {
  const a = X.from(2.5), b = X.from(-4);
  near(X.to(X.fmul(a, b)), -10, 1e-7, 'fmul');
  near(X.to(X.fdiv(b, a)), -1.6, 1e-7, 'fdiv');
  near(X.to(X.fmul(b, b)), 16, 1e-7, 'fmul of two negatives');
  eq(X.floorDiv(-7n, 2n), -4n, 'floorDiv rounds down, not toward zero;');
  eq(X.floorDiv(7n, 2n), 3n);
});

t('matches the published values of the functions', () => {
  near(X.to(X.exp(X.from(1))), Math.E, 1e-8, 'e');
  near(X.to(X.ln(X.from(Math.E))), 1, 1e-8, 'ln e');
  near(X.to(X.sqrt(X.from(2))), Math.SQRT2, 1e-8, 'root two');
  near(X.to(X.cos(0n)), 1, 1e-9, 'cos 0');
  near(X.to(X.cos(X.HALF_PI)), 0, 1e-8, 'cos of a right angle');
  near(X.to(X.pow(X.from(2), X.from(10))), 1024, 1e-4, 'two to the ten');
  eq(X.isqrt(1000000n), 1000n); eq(X.isqrt(999999n), 999n); eq(X.ilog2(1024n), 10n);
  // against the engine's own, every value: the specification drifting from it is how a bug reaches
  // the contract, and at n = 2 it did exactly that
  for (let n = 0; n < 3000; n++) eq(Number(X.isqrt(BigInt(n))), Q.isqrt(n), 'isqrt ' + n + ';');
  for (let n = 1; n < 3000; n++) eq(Number(X.ilog2(BigInt(n))), Q.ilog2(n), 'ilog2 ' + n + ';');
});

t('agrees with the engine across the ranges the game really uses', () => {
  // the ranges come from recording two seasons: exp -1.43..5.28, ln 0.0001..3.55,
  // pow base 0.41..3.55, sqrt 0.0004..19.36, cos 0..2pi
  const sweep = (lo, hi, n, f) => { const out = []; for (let i = 0; i <= n; i++) out.push(f(lo + ((hi - lo) * i) / n)); return out; };
  // Where a function passes through zero (ln near 1, cos near a right angle) the relative error
  // means nothing, so it is only judged away from zero; the absolute error is judged everywhere.
  const worst = (name, lo, hi, fFx, fRef) => {
    let maxRel = 0, maxAbs = 0;
    sweep(lo, hi, 2000, (x) => {
      const want = fRef(x), got = X.to(fFx(x));
      const ab = Math.abs(got - want);
      maxAbs = Math.max(maxAbs, ab);
      if (Math.abs(want) > 0.1) maxRel = Math.max(maxRel, ab / Math.abs(want));
    });
    // The scale holds steps of 2^-32, about 2.3e-10. On a result near 200, as exp reaches, that
    // shows up as an absolute error near 1e-7; on ln, whose result passes through zero, only the
    // absolute error means anything. So both are bounded, and neither alone would be honest.
    truthy(maxAbs < 1e-6, `${name}: absolute error ${maxAbs.toExponential(2)} is too big`);
    truthy(maxRel < 1e-7, `${name}: relative error ${maxRel.toExponential(2)} is too big`);
    return `${name} ${maxAbs.toExponential(1)}/${maxRel.toExponential(1)}`;
  };
  const r = [
    worst('exp', -1.5, 5.3, (x) => X.exp(X.from(x)), (x) => Q.exp(x)),
    worst('ln', 0.0001, 3.6, (x) => X.ln(X.from(x)), (x) => Q.ln(x)),
    worst('sqrt', 0.0004, 19.4, (x) => X.sqrt(X.from(x)), (x) => Q.sqrt(x)),
    worst('cos', 0, 6.283, (x) => X.cos(X.from(x)), (x) => Q.cos(x)),
    worst('pow^0.6', 0.41, 3.6, (x) => X.pow(X.from(x), X.from(0.6)), (x) => Q.pow(x, 0.6)),
  ];
  console.log('      (pior erro absoluto/relativo: ' + r.join('  ') + ')');
});

t('a season played on the fixed-point maths is the same season', () => {
  const orig = { exp: Q.exp, ln: Q.ln, pow: Q.pow, sqrt: Q.sqrt, cos: Q.cos };
  const play = () => { const G = Game.newGame({ seed: 42, coaches: [{ name: 'A', role: 'both' }] }); Game.simulateSeason(G); return G; };
  const a = play();
  Q.exp = (x) => X.to(X.exp(X.from(x)));
  Q.ln = (x) => X.to(X.ln(X.from(x)));
  Q.pow = (p, q) => X.to(X.pow(X.from(p), X.from(q)));
  Q.sqrt = (x) => X.to(X.sqrt(X.from(x)));
  Q.cos = (x) => X.to(X.cos(X.from(x)));
  let b;
  try { b = play(); } finally { Object.assign(Q, orig); }
  eq(JSON.stringify(b.table), JSON.stringify(a.table), 'the league table came out different;');
  eq(Game.standings(b, 0)[0], Game.standings(a, 0)[0], 'another champion;');
  eq(b.cup.winner, a.cup.winner, 'another cup winner;');
});

t('twenty bits of fraction is the line, and Q32.32 clears it', () => {
  // round every probability onto a coarser grid, which is what a smaller scale would do
  const seasonAt = (bits) => {
    const f0 = SF.R.f, chance0 = SF.R.chance;
    if (bits) { const s = 2 ** bits; SF.R.chance = function (p) { return f0.call(this) < Math.round(p * s) / s; }; }
    try {
      const G = Game.newGame({ seed: 42, coaches: [{ name: 'A', role: 'both' }] });
      Game.simulateSeason(G);
      return JSON.stringify(G.table);
    } finally { SF.R.chance = chance0; }
  };
  const ref = seasonAt(0);
  truthy(seasonAt(12) !== ref, '12 bits should not be enough, yet nothing changed');
  eq(seasonAt(20), ref, '20 bits should already be identical;');
  eq(seasonAt(32), ref, '32 bits, the scale we use, must be identical;');
});

t('the rule the port has to follow: money stays whole, only ratios carry a scale', () => {
  const U64 = (1n << 64n) - 1n;
  // Money and counts are already whole numbers in the engine, so they go to Move as plain u64 and
  // never touch the scale. Only ratings, ratios and odds are scaled, and those stay small: the
  // widest the engine ever reaches is exp(5.28) = 196 and sqrt of about 19.
  const scaled = [196, 19.4, 6.3, 1.5, 0.0001];
  for (const v of scaled) truthy(X.from(v) <= U64, `${v} does not fit a u64 at this scale`);
  // two scaled values multiplied together still fit, which is what keeps the port in u64 storage
  const big = X.from(1000); // ten times wider than anything the engine reaches
  truthy(big * big > U64, 'the intermediate needs u128: the port depends on promoting');
  truthy((big * big) >> X.SH <= U64, 'after shifting back it has to fit a u64 again');
  // and the rule that money must not be scaled: four million scaled, squared, would not fit
  const money = X.from(4e6);
  truthy(((money * money) >> X.SH) > U64, 'if money were scaled it would overflow, which is why it is not');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
