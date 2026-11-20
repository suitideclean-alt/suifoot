/// The game's random number generator, the same one the browser runs.
///
/// Everything in a season traces back to this: who is born with what, who gets injured, who scores.
/// So it has to produce not similar numbers to the browser's but the identical ones, or a season
/// played on chain would diverge from the same season played in a tab and neither could check the
/// other. It is mulberry32, carried over step for step.
///
/// JavaScript does these sums on 32-bit integers that wrap silently. Move's integers abort on
/// overflow instead, so every add and multiply here is done in 64 bits and masked back down to 32,
/// which gives the same bits the browser gets.
///
/// One piece of luck worth naming: the browser's f() is the 32-bit output divided by 2^32, and a
/// Q32.32 fixed-point number is its value times 2^32. So the fixed-point form of a draw is the raw
/// 32-bit output itself, widened. Nothing is rounded on the way across.
module suifoot::rng;

const M32: u64 = 0xFFFFFFFF;
const STEP: u64 = 0x6d2b79f5;

public struct Rng has copy, drop, store {
    state: u32,
}

public fun new(seed: u32): Rng { Rng { state: seed } }

/// where the generator stands, so a world can be stored and picked up again mid-season
public fun state(r: &Rng): u32 { r.state }
public fun from_state(state: u32): Rng { Rng { state } }

fun wrap_add(a: u32, b: u64): u32 { (((a as u64) + b) & M32) as u32 }
fun wrap_mul(a: u32, b: u32): u32 { ((((a as u64) * (b as u64)) & M32)) as u32 }

/// one draw: a 32-bit number, which is also the draw as a Q32.32 fraction of one
public fun next_u32(r: &mut Rng): u32 {
    let a = wrap_add(r.state, STEP);
    r.state = a;
    let mut t = wrap_mul(a ^ (a >> 15), 1 | a);
    t = (wrap_add(t, (wrap_mul(t ^ (t >> 7), 61 | t) as u64))) ^ t;
    t ^ (t >> 14)
}

/// the draw as a Q32.32 number in [0, 1), exactly
public fun next_fx(r: &mut Rng): u64 { next_u32(r) as u64 }

/// a whole number from lo to hi, both ends included - the browser's R.int
public fun int(r: &mut Rng, lo: u64, hi: u64): u64 {
    let span = hi - lo + 1;
    lo + (((next_u32(r) as u64) * span) >> 32)
}

/// an index into a list of n things - the browser's R.pick
public fun index(r: &mut Rng, n: u64): u64 { ((next_u32(r) as u64) * n) >> 32 }

/// true with the given chance, written in hundredths: 125 meaning 1.25%
public fun chance_bp(r: &mut Rng, hundredths_of_a_percent: u64): bool {
    (next_u32(r) as u64) * 10000 < hundredths_of_a_percent << 32
}
