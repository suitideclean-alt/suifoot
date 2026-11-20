/// The match engine: what eleven men are worth, and then what happens for ninety minutes.
///
/// This is the module the whole project exists for. A result cannot be chosen, asserted or agreed -
/// it has to be computed, from two lineups that were sealed before the deadline and one random
/// number the chain drew after it. Given those, there is exactly one outcome, and anyone who has
/// them can work it out again and get the same.
///
/// The numbers in here are the rule book from src/core.js. They are written as plain fractions
/// rather than decimals so that nothing is misread on the way across.
module suifoot::engine;

use suifoot::fx::{Self, Fx};
use suifoot::player::{Self, Player};

/// a rating at or above this makes a man a star
const STAR_OVR: u16 = 80;
/// and up to this many of them lift a side before the dressing room starts to suffer
const STAR_FREE: u64 = 3;

const ATT: u8 = 0;
const DEF: u8 = 2;

/// A man on the pitch: which minute he came on, and what he has already been booked for. It lives
/// here rather than beside the match loop so that working out what a side is worth can read the
/// eleven where they already are, instead of being handed a copy of them each time.
public struct OnPitch has copy, drop, store {
    p: Player,
    since: u64,
    yellows: u8,
}

public fun on_pitch(p: Player, since: u64): OnPitch { OnPitch { p, since, yellows: 0 } }
public fun man(o: &OnPitch): &Player { &o.p }
public fun since(o: &OnPitch): u64 { o.since }
public fun yellows(o: &OnPitch): u8 { o.yellows }
public fun book(o: &mut OnPitch) { o.yellows = o.yellows + 1 }

/// What a side is worth, in four numbers: the keeper on his own, and then the attack, the defence
/// and the midfield as the engine weighs them.
public struct Power has copy, drop, store {
    gk: Fx,
    ap: Fx,
    dp: Fx,
    mp: Fx,
}

public fun gk(p: &Power): Fx { p.gk }
public fun ap(p: &Power): Fx { p.ap }
public fun dp(p: &Power): Fx { p.dp }
public fun mp(p: &Power): Fx { p.mp }

/// What eleven men are worth right now.
///
/// `on` says, for each of them, the minute he came onto the pitch, so a substitute is not charged
/// for the legs of the man he replaced. A side with nobody in goal puts an outfield player there
/// and gets about a third of its best man out of him.
public fun power(xi: &vector<Player>, on: &vector<u64>, minute: u64, tactic: u8, tbonus: u64): Power {
    let mut pitch = vector::empty<OnPitch>();
    let mut i = 0;
    while (i < xi.length()) {
        pitch.push_back(OnPitch { p: xi[i], since: if (i < on.length()) on[i] else 0, yellows: 0 });
        i = i + 1;
    };
    power_now(&pitch, minute, tactic, tbonus)
}

/// the same thing, reading the eleven where they stand
public fun power_now(xi: &vector<OnPitch>, minute: u64, tactic: u8, tbonus: u64): Power {
    let mut keeper = fx::zero();
    let mut back = fx::zero();
    let mut middle = fx::zero();
    let mut front = fx::zero();
    let mut best = fx::zero();

    let n = xi.length();
    let mut i = 0;
    while (i < n) {
        let p = &xi[i].p;
        let came_on = xi[i].since;
        let played = if (minute > came_on) minute - came_on else 0;
        let o = player::rating(p, played);

        if (fx::gt(&o, &best)) best = o;
        let pos = player::pos(p);
        if (pos == player::gk()) { if (fx::gt(&o, &keeper)) keeper = o }
        else if (pos == player::df()) back = fx::add(&back, &o)
        else if (pos == player::mf()) middle = fx::add(&middle, &o)
        else front = fx::add(&front, &o);
        i = i + 1;
    };

    if (fx::is_zero(&keeper)) keeper = fx::mul(&best, &fx::from_ratio(35, 100));

    // attack leans on the forwards and takes under half of the midfield; defence the other way round
    let mut attack = fx::div(&fx::add(&front, &fx::mul(&fx::from_ratio(45, 100), &middle)), &fx::from_ratio(38, 10));
    let mut defence = fx::div(&fx::add(&back, &fx::mul(&fx::from_ratio(35, 100), &middle)), &fx::from_ratio(54, 10));
    let mut mid = fx::div(
        &fx::add(&middle, &fx::mul(&fx::from_ratio(25, 100), &fx::add(&front, &back))),
        &fx::from_ratio(55, 10),
    );

    // going forward buys attack and costs defence; sitting back does the reverse
    if (tactic == ATT) {
        attack = fx::mul(&attack, &fx::from_ratio(108, 100));
        defence = fx::mul(&defence, &fx::from_ratio(94, 100));
    } else if (tactic == DEF) {
        attack = fx::mul(&attack, &fx::from_ratio(92, 100));
        defence = fx::mul(&defence, &fx::from_ratio(107, 100));
    };

    // stars: the first few add flair, and every one past that pulls the whole side down a little
    let stars = count_stars(xi);
    let k = if (stars < STAR_FREE) stars else STAR_FREE;
    let flair = fx::from_ratio(50, 100);
    attack = fx::add(&attack, &fx::mul_int(&flair, k));
    mid = fx::add(&mid, &fx::mul_int(&fx::mul(&flair, &fx::from_ratio(70, 100)), k));
    defence = fx::add(&defence, &fx::mul_int(&fx::mul(&flair, &fx::from_ratio(35, 100)), k));

    let over = if (stars > STAR_FREE) stars - STAR_FREE else 0;
    let penalty = fx::sub(&fx::one(), &fx::mul_int(&fx::from_ratio(3, 100), over));
    let coach = fx::add(&fx::one(), &fx::mul_int(&fx::from_ratio(15, 1000), tbonus));
    let tb = fx::mul(&coach, &penalty);

    Power {
        gk: fx::mul(&keeper, &penalty),
        ap: fx::mul(&attack, &tb),
        dp: fx::mul(&defence, &tb),
        mp: fx::mul(&mid, &tb),
    }
}

/// the tactics triangle gives the side that picked well a small lift across the board
public fun scale(p: &Power, k: &Fx): Power {
    Power { gk: p.gk, ap: fx::mul(&p.ap, k), dp: fx::mul(&p.dp, k), mp: fx::mul(&p.mp, k) }
}

fun count_stars(xi: &vector<OnPitch>): u64 {
    let mut n = 0;
    let mut i = 0;
    while (i < xi.length()) {
        if (player::ovr(&xi[i].p) >= STAR_OVR) n = n + 1;
        i = i + 1;
    };
    n
}
