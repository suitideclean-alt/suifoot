/// Fixed-point arithmetic in Q32.32, the number format the whole engine runs on.
///
/// The browser engine does its sums in IEEE-754 doubles. Move has no floating point, so every ratio
/// the game multiplies by - form, tiredness, a coach's bonus - is carried as a 64-bit integer with
/// 32 bits of fraction. Thirty-two bits is twelve more than the twenty the measurements showed were
/// needed, which is the margin that keeps a season's tables identical to the browser's.
///
/// Money never carries a scale. A dollar is a whole number of dollars, always.
module suifoot::fx;

/// 1.0 in Q32.32
const ONE: u64 = 1 << 32;

#[error]
const EOverflow: vector<u8> = b"fixed-point result does not fit in 64 bits";

public fun one(): u64 { ONE }

/// whole number -> fixed point
public fun from_int(n: u64): u64 {
    assert!(n <= 0xFFFFFFFF, EOverflow);
    n << 32
}

/// fixed point -> whole number, rounding down
public fun to_int(a: u64): u64 { a >> 32 }

/// fixed point -> whole number, rounding to nearest
public fun round(a: u64): u64 { (a + (ONE / 2)) >> 32 }

/// a * b, going through 128 bits so the product never wraps
public fun mul(a: u64, b: u64): u64 {
    let r = ((a as u128) * (b as u128)) >> 32;
    assert!(r <= (0xFFFFFFFFFFFFFFFF as u128), EOverflow);
    r as u64
}

/// a / b, going through 128 bits for the same reason
public fun div(a: u64, b: u64): u64 {
    let r = ((a as u128) << 32) / (b as u128);
    assert!(r <= (0xFFFFFFFFFFFFFFFF as u128), EOverflow);
    r as u64
}

/// a percentage written as hundredths, 250 meaning 2.50, turned into fixed point
public fun from_cents(c: u64): u64 { div(from_int(c), from_int(100)) }
