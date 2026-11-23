/// Fixed-point arithmetic in Q32.32, translated line for line from src/fixed.js.
///
/// The browser engine does its sums in doubles. Move has no floating point and no signed integers
/// either, so a number here is a magnitude with a sign carried beside it, and every ratio the game
/// multiplies by - form, tiredness, a coach's bonus - is a 64-bit integer with 32 bits of fraction.
///
/// Thirty-two bits of fraction is not a guess. Measuring the browser engine showed that below twenty
/// bits a season ends differently - other champions, swings of fifty points - and that from twenty
/// bits up every season comes out identical. Q32.32 keeps twelve bits of margin over that line.
///
/// Money never carries a scale. A dollar is a whole number of dollars, always.
module suifoot::fx;

const SH: u8 = 32;
const U64_MAX: u128 = 18446744073709551615;
const U64_MAX_RAW: u64 = 18446744073709551615;
const ONE_RAW: u64 = 1 << 32;

/// round(ln 2 * 2^32), and the rest of the constants the series need
const LN2_RAW: u64 = 2977044472;
const PI_RAW: u64 = 13493037705;
const TWO_PI_RAW: u64 = 26986075409;
const HALF_PI_RAW: u64 = 6746518852;

/// How far exp may be asked to go. e^21 is about 1.3 billion, near the top of what Q32.32 holds;
/// past it the answer saturates instead of aborting. The engine's widest reach is exp(5.28) = 196,
/// which is four times inside this, so the clamp is a guard and never a behaviour.
const EXP_LIM_RAW: u64 = 21 << 32;

#[error]
const EOverflow: vector<u8> = b"fixed-point result does not fit in 64 bits";
#[error]
const ENegative: vector<u8> = b"a negative value where a whole number was wanted";

/// A number as a magnitude and a sign. Zero is always held with neg = false, so two zeros compare equal.
public struct Fx has copy, drop, store {
    m: u64,
    neg: bool,
}

// ---------- making them ----------

public fun zero(): Fx { Fx { m: 0, neg: false } }
public fun one(): Fx { Fx { m: ONE_RAW, neg: false } }
public fun ln2(): Fx { Fx { m: LN2_RAW, neg: false } }
public fun pi(): Fx { Fx { m: PI_RAW, neg: false } }

/// build from the raw Q32.32 bits, which is how a draw from the generator arrives
public fun from_raw(m: u64, neg: bool): Fx { Fx { m, neg: neg && m != 0 } }
public fun raw(a: &Fx): u64 { a.m }

public fun from_int(n: u64): Fx {
    assert!(n <= 0xFFFFFFFF, EOverflow);
    Fx { m: n << SH, neg: false }
}

/// A constant written as a plain fraction, which is how every number in the engine's rule book is
/// carried to the scale: from_ratio(45, 100) for 0.45, from_ratio(15, 1000) for 0.015. Writing them
/// this way leaves no decimal to be misread on the way across.
public fun from_ratio(n: u64, d: u64): Fx {
    let m = ((((n as u128) << SH) + ((d as u128) / 2)) / (d as u128)) as u64;
    Fx { m, neg: false }
}

/// A ratio written in hundredths: 250 meaning 2.50. This rounds rather than truncates, because it
/// is how a constant is carried to the scale, and the specification's own conversion rounds. The
/// series below truncate instead - that is division inside a calculation, which is a different thing.
public fun from_cents(c: u64, neg: bool): Fx {
    let m = ((((c as u128) << SH) + 50) / 100) as u64;
    Fx { m, neg: neg && m != 0 }
}

/// toward zero, as the browser's truncation does
public fun to_int(a: &Fx): u64 {
    assert!(!a.neg, ENegative);
    a.m >> SH
}
public fun to_int_round(a: &Fx): u64 {
    assert!(!a.neg, ENegative);
    (a.m + (ONE_RAW / 2)) >> SH
}

// ---------- comparing ----------

public fun is_neg(a: &Fx): bool { a.neg }
public fun is_zero(a: &Fx): bool { a.m == 0 }
public fun negate(a: &Fx): Fx { Fx { m: a.m, neg: !a.neg && a.m != 0 } }
public fun abs(a: &Fx): Fx { Fx { m: a.m, neg: false } }

public fun lt(a: &Fx, b: &Fx): bool {
    // zero is always held with neg = false, so a negative value really is below every other
    if (a.neg && !b.neg) { true }
    else if (!a.neg && b.neg) { false }
    else if (a.neg) { b.m < a.m } // both below zero: the bigger magnitude is the smaller number
    else { a.m < b.m }
}
public fun gt(a: &Fx, b: &Fx): bool { lt(b, a) }
public fun eq(a: &Fx, b: &Fx): bool { a.m == b.m && a.neg == b.neg }

/// keep a value between two bounds, the browser's util.clamp
public fun clamp(a: Fx, lo: Fx, hi: Fx): Fx {
    if (lt(&a, &lo)) lo else if (gt(&a, &hi)) hi else a
}

// ---------- the four operations ----------

public fun add(a: &Fx, b: &Fx): Fx {
    if (a.neg == b.neg) {
        let s = (a.m as u128) + (b.m as u128);
        assert!(s <= U64_MAX, EOverflow);
        Fx { m: s as u64, neg: a.neg && s != 0 }
    } else if (a.m >= b.m) {
        let m = a.m - b.m;
        Fx { m, neg: a.neg && m != 0 }
    } else {
        let m = b.m - a.m;
        Fx { m, neg: b.neg && m != 0 }
    }
}

public fun sub(a: &Fx, b: &Fx): Fx { add(a, &negate(b)) }

public fun mul(a: &Fx, b: &Fx): Fx {
    let p = ((a.m as u128) * (b.m as u128)) >> SH;
    assert!(p <= U64_MAX, EOverflow);
    let m = p as u64;
    Fx { m, neg: (a.neg != b.neg) && m != 0 }
}

public fun div(a: &Fx, b: &Fx): Fx {
    if (b.m == 0) return zero();
    let q = ((a.m as u128) << SH) / (b.m as u128);
    assert!(q <= U64_MAX, EOverflow);
    let m = q as u64;
    Fx { m, neg: (a.neg != b.neg) && m != 0 }
}

/// divide by a plain whole number: the denominators of the Taylor series
public fun div_int(a: &Fx, n: u64): Fx {
    let m = a.m / n;
    Fx { m, neg: a.neg && m != 0 }
}
public fun mul_int(a: &Fx, n: u64): Fx {
    let p = (a.m as u128) * (n as u128);
    assert!(p <= U64_MAX, EOverflow);
    let m = p as u64;
    Fx { m, neg: a.neg && m != 0 }
}

// ---------- the functions the engine calls ----------

/// e^x. x is split as k*ln2 + r, the series is run on r, and the 2^k is a shift.
public fun exp(x: &Fx): Fx {
    // outside the range Q32.32 can hold, saturate rather than abort: e^21 is near the ceiling and
    // e^-21 is already smaller than the smallest step the scale has
    if (!x.neg && x.m > EXP_LIM_RAW) return Fx { m: U64_MAX_RAW, neg: false };
    if (x.neg && x.m > EXP_LIM_RAW) return zero();

    // k = round(x / ln2), worked out as floor((x + ln2/2) / ln2)
    let half_ln2 = Fx { m: LN2_RAW >> 1, neg: false };
    let shifted = add(x, &half_ln2);
    let (k, k_neg) = floor_div_ln2(&shifted);

    // r = x - k*ln2
    let k_ln2 = Fx { m: ((k as u128) * (LN2_RAW as u128)) as u64, neg: k_neg && k != 0 };
    let r = sub(x, &k_ln2);

    // Sixteen terms is what the specification writes, but at this scale the term falls to exactly
    // zero by the ninth at the very widest the engine reaches, and a term of zero makes every term
    // after it zero too. Stopping there adds nothing and leaves nothing out: the sum is the same
    // number, found sooner.
    let mut term = one();
    let mut sum = one();
    let mut i = 1u64;
    while (i <= 16) {
        term = div_int(&mul(&term, &r), i);
        if (is_zero(&term)) break;
        sum = add(&sum, &term);
        i = i + 1;
    };

    if (k == 0) return sum;
    if (k_neg) {
        if (k >= 64) zero() else Fx { m: sum.m >> (k as u8), neg: false }
    } else {
        if (k >= 64) Fx { m: U64_MAX_RAW, neg: false }
        else {
            let s = (sum.m as u128) << (k as u8);
            if (s > U64_MAX) Fx { m: U64_MAX_RAW, neg: false }
            else Fx { m: s as u64, neg: false }
        }
    }
}

/// floor(a / ln2) for a signed a, returned as a magnitude and a sign. Flooring a negative number is
/// not the same as cutting off its remainder, which is why this is spelled out.
fun floor_div_ln2(a: &Fx): (u64, bool) {
    let q = a.m / LN2_RAW;
    let rem = a.m % LN2_RAW;
    if (!a.neg) (q, false)
    else if (rem == 0) (q, true)
    else (q + 1, true) // floor of a negative goes further from zero
}

/// natural log of a positive x. x is written as m * 2^k with m in [1,2), and ln m comes from
/// 2*atanh((m-1)/(m+1)), which converges fast on that interval.
public fun ln(x: &Fx): Fx {
    // the specification's answer for this, which exp then turns into a clean zero
    if (x.neg || x.m == 0) return Fx { m: 745 << 32, neg: true };

    let mut m = x.m;
    let mut k = 0u64;
    let mut k_neg = false;
    while (m >= ONE_RAW << 1) { m = m >> 1; k = k + 1; };
    while (m < ONE_RAW) { m = m << 1; if (k == 0) { k_neg = true; k = 1 } else if (k_neg) { k = k + 1 } else { k = k - 1 } };

    let mf = Fx { m, neg: false };
    let one_f = one();
    let z = div(&sub(&mf, &one_f), &add(&mf, &one_f));
    let z2 = mul(&z, &z);

    // twenty-four terms written, ten ever reached: the same stopping rule as exp, and the same reason
    let mut p = z;
    let mut sum = zero();
    let mut i = 0u64;
    while (i < 24) {
        sum = add(&sum, &div_int(&p, 2 * i + 1));
        p = mul(&p, &z2);
        if (is_zero(&p)) break;
        i = i + 1;
    };

    let k_part = Fx { m: ((k as u128) * (LN2_RAW as u128)) as u64, neg: k_neg && k != 0 };
    add(&k_part, &mul_int(&sum, 2))
}

/// x^y for x > 0
public fun pow(x: &Fx, y: &Fx): Fx {
    if (y.m == 0) return one();
    if (x.m == ONE_RAW && !x.neg) return one();
    exp(&mul(y, &ln(x)))
}

/// square root by Newton, started on a power of two, ten fixed turns
public fun sqrt(x: &Fx): Fx {
    if (x.neg || x.m == 0) return zero();
    let mut g = ONE_RAW;
    let mut t = x.m;
    while (t >= ONE_RAW << 2) { t = t >> 2; g = g << 1; };
    while (t < ONE_RAW) { t = t << 2; g = g >> 1; };
    if (g == 0) g = 1;
    let xf = Fx { m: x.m, neg: false };
    // Newton doubles its correct digits each turn and settles well inside ten; once the guess stops
    // moving, every turn after it would land on the same number
    let mut i = 0u64;
    while (i < 10) {
        let gf = Fx { m: g, neg: false };
        let next = (g + div(&xf, &gf).m) >> 1;
        if (next == g) break;
        g = next;
        i = i + 1;
    };
    Fx { m: g, neg: false }
}

/// cos(t), folded into [0, pi/2] and then a twelve-term series
public fun cos(t: &Fx): Fx {
    let mut v = t.m % TWO_PI_RAW;
    if (t.neg && v != 0) v = TWO_PI_RAW - v;
    if (v > PI_RAW) v = TWO_PI_RAW - v;
    let mut sign_neg = false;
    if (v > HALF_PI_RAW) { v = PI_RAW - v; sign_neg = true; };

    let tf = Fx { m: v, neg: false };
    let t2 = mul(&tf, &tf);
    let mut term = one();
    let mut sum = one();
    let mut i = 1u64;
    while (i <= 12) {
        term = negate(&div_int(&mul(&term, &t2), (2 * i - 1) * (2 * i)));
        if (is_zero(&term)) break;
        sum = add(&sum, &term);
        i = i + 1;
    };
    if (sign_neg) negate(&sum) else sum
}

/// floor(sqrt(n)) for whole n, exact, with no scale involved
public fun isqrt(n: u64): u64 {
    if (n < 2) return n;
    let mut r = n;
    let mut p = (n >> 1) + (n & 1); // ceil(n/2); (n>>1)+1 lands on the answer at n = 2 and never improves it
    while (p < r) { r = p; p = (p + n / p) >> 1; };
    r
}

/// floor(log2(n)) for whole n >= 1, exact
public fun ilog2(n: u64): u64 {
    let mut v = n;
    let mut k = 0;
    while (v >= 2) { v = v >> 1; k = k + 1; };
    k
}
