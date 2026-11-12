/* SuiFoot deterministic math (SF.Q).
 * The game logic must give bit-identical results on every platform (browser, Node, Rust/wasm, a zkVM, and a fixed-point Move port).
 * Math.exp / log / pow / cos are NOT specified to be identical across engines, so the game never calls them. Everything here is built only from
 * + - * / on IEEE-754 doubles (correctly rounded everywhere) and integers, with fixed iteration counts. No Math.exp/log/pow/sin/cos/random.
 * The same algorithm, with the same constants and term counts, is the specification for the on-chain (fixed-point) port. */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});
  const LN2 = 0.6931471805599453, PI = 3.141592653589793, TWO_PI = 6.283185307179586, HALF_PI = 1.5707963267948966;

  const Q = (SF.Q = { LN2, PI });

  /** e^x: x = k*ln2 + r, |r| <= ln2/2; Taylor series of e^r with 16 terms; scale by 2^k with exact doublings */
  Q.exp = function (x) {
    if (x > 700) x = 700; else if (x < -700) x = -700;
    const k = Math.floor(x / LN2 + 0.5);
    const r = x - k * LN2;
    let term = 1, sum = 1;
    for (let i = 1; i <= 16; i++) { term = (term * r) / i; sum += term; }
    for (let i = 0; i < k; i++) sum *= 2;
    for (let i = 0; i > k; i--) sum /= 2;
    return sum;
  };

  /** natural log, x > 0: x = m * 2^k with m in [1,2); ln m = 2 atanh((m-1)/(m+1)) with 24 odd terms */
  Q.ln = function (x) {
    if (!(x > 0)) return -745;
    let m = x, k = 0;
    while (m >= 2) { m /= 2; k++; }
    while (m < 1) { m *= 2; k--; }
    const z = (m - 1) / (m + 1), z2 = z * z;
    let p = z, sum = 0;
    for (let i = 0; i < 24; i++) { sum += p / (2 * i + 1); p *= z2; }
    return k * LN2 + 2 * sum;
  };

  /** x^y for x > 0 */
  Q.pow = (x, y) => (x === 1 || y === 0 ? 1 : Q.exp(y * Q.ln(x)));

  /** integer square root: floor(sqrt(n)) for integers n >= 0 (exact) */
  Q.isqrt = function (n) {
    n = Math.floor(n);
    if (n < 2) return n < 0 ? 0 : n;
    let r = Math.floor(Math.sqrt(n));
    while (r * r > n) r--;
    while ((r + 1) * (r + 1) <= n) r++;
    return r;
  };

  /** square root by Newton iteration: the starting point is a power of two, 10 fixed iterations */
  Q.sqrt = function (x) {
    if (!(x > 0)) return 0;
    let g = 1, t = x;
    while (t >= 4) { t /= 4; g *= 2; }
    while (t < 1) { t *= 4; g /= 2; }
    for (let i = 0; i < 10; i++) g = (g + x / g) / 2;
    return g;
  };

  /** cos(t) for t in [0, 2pi): folded to [0, pi/2], Taylor series with 12 terms */
  Q.cos = function (t) {
    t = t % TWO_PI; if (t < 0) t += TWO_PI;
    if (t > PI) t = TWO_PI - t;
    let sign = 1;
    if (t > HALF_PI) { t = PI - t; sign = -1; }
    const t2 = t * t;
    let term = 1, sum = 1;
    for (let i = 1; i <= 12; i++) { term = (-term * t2) / ((2 * i - 1) * (2 * i)); sum += term; }
    return sign * sum;
  };

  /** floor(log2(n)) for integers n >= 1, exact */
  Q.ilog2 = function (n) { let k = 0; n = Math.floor(n); while (n >= 2) { n = Math.floor(n / 2); k++; } return k; };
})();
