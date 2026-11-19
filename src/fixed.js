/* SuiFoot fixed-point maths (SF.FX): the same engine maths, in whole numbers only.
 *
 * Why it exists. The engine runs on doubles, which Move does not have: Move only offers u8..u256.
 * This module is the reference the Move port is written from - translate it line by line and the
 * contract plays the game we already have. It is written with BigInt, using nothing a Move module
 * could not do: no Math.*, no division with a decimal point, no conversion to a double anywhere.
 * The sign is carried beside the magnitude, because Move has no signed integers.
 *
 * Scale: Q32.32. A real number x is held as round(x * 2^32).
 *   - a value fits in u64:   the largest the game reaches is a player valuation near 4 million,
 *     which is 1.7e16, against the 1.8e19 a u64 holds
 *   - a multiplication promotes to u128 before shifting back, which is the usual Move pattern
 *
 * How much precision the game needs, measured rather than guessed (tests/fixed.js):
 *   below 20 bits of fraction a season ends differently - other champions, swings of 50 points;
 *   from 20 bits up every season is identical. Q32.32 keeps 12 bits of margin over that line.
 *
 * It is not loaded by the game: the browser keeps using SF.Q. This is the specification.
 */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  const SH = 32n;
  const ONE = 1n << SH;

  // the same constants the engine uses, carried to the scale
  const LN2 = 2977044472n;      // round(0.6931471805599453 * 2^32)
  const PI = 13493037705n;      // round(3.141592653589793  * 2^32)
  const TWO_PI = 26986075409n;  // round(6.283185307179586  * 2^32)
  const HALF_PI = 6746518852n;  // round(1.5707963267948966 * 2^32)

  const abs = (x) => (x < 0n ? -x : x);
  const isNeg = (x) => x < 0n;

  /** multiply two fixed-point values: (a*b) >> 32, with the sign handled apart as Move must */
  function fmul(a, b) {
    const m = (abs(a) * abs(b)) >> SH;
    return isNeg(a) !== isNeg(b) ? -m : m;
  }
  /** divide two fixed-point values */
  function fdiv(a, b) {
    if (b === 0n) return 0n;
    const d = (abs(a) << SH) / abs(b);
    return isNeg(a) !== isNeg(b) ? -d : d;
  }
  /** divide by a plain whole number: the denominators of the Taylor series */
  function fdivInt(a, n) {
    const d = abs(a) / BigInt(n);
    return isNeg(a) ? -d : d;
  }
  /** floor of a division, which for signed values is not the same as cutting off the remainder */
  function floorDiv(a, b) {
    const q = a / b;
    return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
  }

  /** e^x: x = k*ln2 + r, Taylor series of e^r with 16 terms, scaled by 2^k with exact shifts */
  function exp(x) {
    const LIM = 700n << SH;
    if (x > LIM) x = LIM; else if (x < -LIM) x = -LIM;
    const k = floorDiv(x + (LN2 >> 1n), LN2); // round(x / ln2)
    const r = x - k * LN2;
    let term = ONE, sum = ONE;
    for (let i = 1n; i <= 16n; i++) { term = fdivInt(fmul(term, r), i); sum += term; }
    if (k > 0n) sum <<= k; else if (k < 0n) sum >>= -k;
    return sum;
  }

  /** natural log, x > 0: x = m * 2^k with m in [1,2); ln m = 2*atanh((m-1)/(m+1)) with 24 odd terms */
  function ln(x) {
    if (x <= 0n) return -745n << SH;
    let m = x, k = 0n;
    while (m >= ONE << 1n) { m >>= 1n; k++; }
    while (m < ONE) { m <<= 1n; k--; }
    const z = fdiv(m - ONE, m + ONE), z2 = fmul(z, z);
    let p = z, sum = 0n;
    for (let i = 0n; i < 24n; i++) { sum += fdivInt(p, 2n * i + 1n); p = fmul(p, z2); }
    return k * LN2 + 2n * sum;
  }

  /** x^y for x > 0 */
  const pow = (x, y) => (x === ONE || y === 0n ? ONE : exp(fmul(y, ln(x))));

  /** square root by Newton iteration: the starting point is a power of two, 10 fixed iterations */
  function sqrt(x) {
    if (x <= 0n) return 0n;
    let g = ONE, t = x;
    while (t >= ONE << 2n) { t >>= 2n; g <<= 1n; }
    while (t < ONE) { t <<= 2n; g >>= 1n; }
    if (g === 0n) g = 1n;
    for (let i = 0; i < 10; i++) g = (g + fdiv(x, g)) >> 1n;
    return g;
  }

  /** cos(t): folded to [0, pi/2], Taylor series with 12 terms */
  function cos(t) {
    t %= TWO_PI;
    if (t < 0n) t += TWO_PI;
    if (t > PI) t = TWO_PI - t;
    let sign = 1n;
    if (t > HALF_PI) { t = PI - t; sign = -1n; }
    const t2 = fmul(t, t);
    let term = ONE, sum = ONE;
    for (let i = 1n; i <= 12n; i++) { term = -fdivInt(fmul(term, t2), (2n * i - 1n) * (2n * i)); sum += term; }
    return sign === 1n ? sum : -sum;
  }

  /** floor(sqrt(n)) for whole n >= 0, exact: Newton over whole numbers, no scale involved */
  function isqrt(n) {
    if (n < 2n) return n < 0n ? 0n : n;
    let r = n, p = (n >> 1n) + 1n;
    while (p < r) { r = p; p = (p + n / p) >> 1n; }
    return r;
  }

  /** floor(log2(n)) for whole n >= 1, exact */
  function ilog2(n) { let k = 0n; while (n >= 2n) { n >>= 1n; k++; } return k; }

  // Conversions. They exist to compare against SF.Q and to feed the current engine; a Move port
  // never uses them, because nothing there ever leaves the whole numbers.
  const from = (x) => BigInt(Math.round(x * 2 ** 32));
  const to = (x) => Number(x) / 2 ** 32;

  SF.FX = { SH, ONE, LN2, PI, TWO_PI, HALF_PI, fmul, fdiv, fdivInt, floorDiv, exp, ln, pow, sqrt, cos, isqrt, ilog2, from, to };
})();
