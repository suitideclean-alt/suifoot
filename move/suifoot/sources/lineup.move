/// Sealed lineups: commit first, reveal after.
///
/// Everything written to a public chain is read by everyone, so a lineup sent before kickoff would be
/// read by the other manager, who would then pick his own against it. The answer is old and simple.
/// Before the deadline you publish only a seal, which is your lineup and a secret number of your own
/// hashed together. After the deadline you publish both, and anyone can check they make that seal.
/// You cannot change your mind afterwards and nobody could see it before.
///
/// Whoever reveals nothing plays his last lineup, exactly as he would if he never opened the game
/// that day. Not turning up is not a way to get a better team out.
module suifoot::lineup;

use std::hash;

const ATT: u8 = 0;
const BAL: u8 = 1;
const DEF: u8 = 2;

const XI: u64 = 11;

#[error]
const EWrongSize: vector<u8> = b"a lineup is eleven players and a bench of at most seven";
#[error]
const ERepeated: vector<u8> = b"the same player twice in one lineup";
#[error]
const EBadTactic: vector<u8> = b"tactic must be attacking, balanced or defensive";

public struct Lineup has store, copy, drop {
    xi: vector<u32>,
    bench: vector<u32>,
    tactic: u8,
}

public fun att(): u8 { ATT }
public fun bal(): u8 { BAL }
public fun def(): u8 { DEF }

public fun new(xi: vector<u32>, bench: vector<u32>, tactic: u8): Lineup {
    assert!(xi.length() == XI, EWrongSize);
    assert!(bench.length() <= 7, EWrongSize);
    assert!(tactic <= DEF, EBadTactic);
    let l = Lineup { xi, bench, tactic };
    assert!(no_repeats(&l), ERepeated);
    l
}

public fun xi(l: &Lineup): &vector<u32> { &l.xi }
public fun bench(l: &Lineup): &vector<u32> { &l.bench }
public fun tactic(l: &Lineup): u8 { l.tactic }

/// nobody may be named twice, on the pitch or on the bench
fun no_repeats(l: &Lineup): bool {
    let mut all = l.xi;
    all.append(l.bench);
    let n = all.length();
    let mut i = 0;
    while (i < n) {
        let mut j = i + 1;
        while (j < n) {
            if (all[i] == all[j]) return false;
            j = j + 1;
        };
        i = i + 1;
    };
    true
}

/// The bytes a lineup turns into before it is hashed. Spelled out rather than left to a library,
/// because the browser has to produce the very same bytes for the seal to be checkable at all:
/// the count of the eleven, each of them as four bytes low end first, then the bench the same way,
/// then the tactic, then the secret number as eight bytes.
public fun encode(l: &Lineup, salt: u64): vector<u8> {
    let mut out = vector::empty<u8>();
    out.push_back((l.xi.length() as u8));
    let mut i = 0;
    while (i < l.xi.length()) { push_u32(&mut out, l.xi[i]); i = i + 1; };
    out.push_back((l.bench.length() as u8));
    let mut j = 0;
    while (j < l.bench.length()) { push_u32(&mut out, l.bench[j]); j = j + 1; };
    out.push_back(l.tactic);
    push_u64(&mut out, salt);
    out
}

fun push_u32(out: &mut vector<u8>, v: u32) {
    let mut k = 0;
    while (k < 4) { out.push_back((((v >> (8 * k)) & 0xFF) as u8)); k = k + 1; };
}
fun push_u64(out: &mut vector<u8>, v: u64) {
    let mut k = 0;
    while (k < 8) { out.push_back((((v >> (8 * k)) & 0xFF) as u8)); k = k + 1; };
}

/// the seal itself
public fun seal_of(l: &Lineup, salt: u64): vector<u8> { hash::sha2_256(encode(l, salt)) }

/// what anyone can run to check a revealed lineup against the seal published before the deadline
public fun matches(l: &Lineup, salt: u64, seal: &vector<u8>): bool { &seal_of(l, salt) == seal }
