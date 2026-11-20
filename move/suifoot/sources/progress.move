/// What a season does to the men who play it.
///
/// Without this the contract plays matches and keeps a table while nobody in it changes: the same
/// twenty-two men, as fresh in May as in August, never older, never better, never gone. A league
/// like that has nothing to manage.
///
/// So: a match leaves them tired and credits whoever scored, a week of training brings them back and
/// moves them on, and the turn of a season ages everyone, grows the young, wears down the old,
/// retires those who are finished and brings the next lot through.
module suifoot::progress;

use suifoot::club::{Self, Club};
use suifoot::fx::{Self, Fx};
use suifoot::player::{Self, Player};
use suifoot::rng::{Self, Rng};

/// the three ways a week can be worked, and what each is worth
/// light: easy on the legs, slow going. hard: the other way about.
const RECOVER: vector<u64> = vector[12, 8, 4];
const MOOD_LIGHT: u64 = 0;  // a tenth of a point, which at whole numbers is nothing
const MOOD_HARD_COST: u64 = 1;

/// what ninety minutes takes out of a man, and what coming on for half an hour does
const COST_STARTING: u8 = 9;
const COST_OFF_THE_BENCH: u8 = 4;

/// nobody is worse than this or better than that, however the years treat him
const OVR_FLOOR: u16 = 25;
const OVR_CEILING: u16 = 94;

/// what a youngster coming through might become, by level
const YOUTH_POT: vector<u64> = vector[66, 60, 54, 49];

// ---------- after a match ----------

/// A man who started is credited with the game and loses nine points of freshness; one who came off
/// the bench loses four. Everyone else was not involved and is untouched.
public(package) fun played_match(c: &mut Club, who: &vector<u32>, started: u64) {
    let mut i = 0;
    while (i < who.length()) {
        let num = who[i];
        if (club::has_player(c, num)) {
            let idx = club::find(c, num);
            let p = club::player_mut(c, idx);
            player::add_app(p);
            let cost = if (i < started) COST_STARTING else COST_OFF_THE_BENCH;
            let now = player::cond(p);
            player::set_cond(p, if (now > cost + 5) now - cost else 5);
        };
        i = i + 1;
    };
}

/// and whoever put it in the net has it on his name for the rest of his career
public(package) fun scored(c: &mut Club, num: u32) {
    if (club::has_player(c, num)) {
        let idx = club::find(c, num);
        player::add_goal(club::player_mut(c, idx));
    };
}

// ---------- a week of training ----------

/// A computer club works its players as hard as their legs allow: if the side that matters is worn
/// down it eases off, and if it is fresh it pushes. A club with somebody running it keeps whatever
/// that person chose.
public(package) fun choose_training(c: &mut Club) {
    let n = club::squad_size(c);
    if (n == 0) return;
    let take = if (n < 14) n else 14; // the men who actually play, not the whole squad
    let mut total = 0u64;
    let mut i = 0;
    while (i < take) { total = total + (player::cond(club::player_at(c, i)) as u64); i = i + 1; };
    let average = total / take;
    club::set_training(c, if (average < 62) 0 else if (average < 76) 1 else 2);
}

/// Legs come back over the week, by as much as the training allowed them to. Hard weeks also wear on
/// a man's mood, and easy ones leave it be.
public(package) fun train_week(c: &mut Club) {
    let mode = (club::training(c) as u64);
    let back = RECOVER[mode];
    let n = club::squad_size(c);
    let mut i = 0;
    while (i < n) {
        let p = club::player_mut(c, i);
        let now = (player::cond(p) as u64);
        let next = if (now + back > 100) 100 else now + back;
        player::set_cond(p, (next as u8));
        if (mode == 2) {
            let m = player::mood(p);
            player::set_mood(p, if (m > MOOD_HARD_COST as u8) m - (MOOD_HARD_COST as u8) else 0);
        };
        i = i + 1;
    };
}

// ---------- the turn of a season ----------

/// A year older, and whatever that year did to him.
///
/// Under twenty-five a man closes some of the gap to what he could be, and plays his way there: a
/// season of games is worth most of a point on its own, and a season watching costs him. Through the
/// prime it is a coin toss either way. Past thirty it is only ever downhill, and past thirty-three
/// it is steep.
///
/// The browser weighs the club's training ground and the coach's eye for it here too. Neither exists
/// on chain yet, so this is the plain version of the same curve - a club with better facilities will
/// grow its players faster once there are facilities to have.
public(package) fun grow(r: &mut Rng, p: &mut Player) {
    let age = (player::age(p) as u64);
    let ovr = player::ovr(p);
    let pot = player::pot(p);
    let apps = (player::apps(p) as u64);

    let (change, down) = if (age <= 24) {
        let room = fx::from_int(((pot - ovr) as u64));
        let share = fx::add(&fx::from_ratio(12, 100), &fx::mul(&draw(r), &fx::from_ratio(28, 100)));
        let mut d = fx::mul(&room, &share);
        if (apps >= 12) d = fx::add(&d, &fx::from_ratio(8, 10));     // a season of football is worth having
        if (apps <= 2) d = fx::mul(&d, &fx::from_ratio(7, 10));      // and a season of watching is not
        (d, false)
    } else if (age <= 29) {
        let g = gauss(r, fx::from_ratio(2, 10), fx::from_ratio(11, 10));
        (fx::abs(&g), fx::is_neg(&g))
    } else if (age <= 32) {
        (fx::add(&fx::from_ratio(2, 10), &fx::mul(&draw(r), &fx::from_ratio(14, 10))), true)
    } else {
        (fx::add(&fx::from_ratio(12, 10), &fx::mul(&draw(r), &fx::from_ratio(18, 10))), true)
    };

    // A change of two thirds of a point is two points in one season out of three, not nothing in
    // every one. Rounding it away would mean nobody ever moved by a little.
    let step = stochastic(r, &change);
    let next = if (down) { if (ovr > OVR_FLOOR + (step as u16)) ovr - (step as u16) else OVR_FLOOR }
        else { let v = ovr + (step as u16); if (v > OVR_CEILING) OVR_CEILING else v };
    player::set_ovr(p, next);

    // what he might still become drifts while he is young, and is simply what he is once he is not
    if (age <= 24) {
        let drift = gauss(r, fx::zero(), fx::one());
        let moved = if (fx::is_neg(&drift)) {
            let d = (fx::to_int_round(&fx::abs(&drift)) as u16);
            if (pot > d) pot - d else next
        } else {
            let v = pot + (fx::to_int_round(&drift) as u16);
            if (v > 95) 95 else v
        };
        player::set_pot(p, if (moved < next) next else moved);
    } else {
        player::set_pot(p, next);
    };
}

/// From thirty-four on, a man is likelier to go each year than he was the last, and by forty it is
/// all but certain.
public fun retires(r: &mut Rng, p: &Player): bool {
    let age = (player::age(p) as u64);
    if (age < 34) return false;
    let chance = (age - 33) * 28;
    let cut = if (chance > 95) 95 else chance;
    rng::int(r, 0, 99) < cut
}

/// The turn of the season for one club: everyone a year older and a year further along, those who
/// are finished are let go, and the academy sends up what it has.
public(package) fun season_turn(c: &mut Club, seed: u32) {
    let mut r = rng::new(seed);
    let level = club::level(c);

    let mut i = 0;
    while (i < club::squad_size(c)) {
        {
            let p = club::player_mut(c, i);
            player::add_year(p);
            player::set_cond(p, 100);  // a summer puts everybody right
            player::reset_season(p);
            grow(&mut r, p);
        };
        let going = { let p = club::player_at(c, i); retires(&mut r, p) };
        if (going) { club::drop_player_at(c, i); } else { i = i + 1; };
    };

    // and the next lot. Two most years, three when the academy has had a good one.
    let extra = if (rng::int(&mut r, 0, 99) < 45) 1 else 0;
    let mut k = 0;
    while (k < 1 + extra) {
        club::add_player(c, youngster(&mut r, c, level));
        k = k + 1;
    };
}

/// A sixteen to eighteen year old: a long way short of what he might be, which is the whole point of
/// him. Keepers come through about a quarter as often as the rest, as they do everywhere.
fun youngster(r: &mut Rng, c: &Club, level: u8): Player {
    let roll = rng::int(r, 0, 9);
    let pos = if (roll == 0) player::gk() else if (roll <= 3) player::df() else if (roll <= 6) player::mf() else player::fw();

    let mean = fx::from_int(YOUTH_POT[(level as u64)]);
    let pot_raw = gauss(r, mean, fx::from_int(10));
    let pot = clamp_u16(&pot_raw, 40, 93);
    let gap = (rng::int(r, 14, 28) as u16);
    let ovr = if (pot > gap + 28) pot - gap else 28;

    let num = next_number(c);
    let temper = player::temper_from_num(num, pos);
    player::new(num, pos, temper, (rng::int(r, 16, 18) as u8), ovr, pot, 40, 3 * 52)
}

/// a number no man at this club already carries
fun next_number(c: &Club): u32 {
    let mut highest = club::num(c) * 100;
    let mut i = 0;
    while (i < club::squad_size(c)) {
        let n = player::num(club::player_at(c, i));
        if (n > highest) highest = n;
        i = i + 1;
    };
    highest + 1
}

// ---------- drawing ----------

/// a flat draw between nothing and one
fun draw(r: &mut Rng): Fx { fx::from_raw((rng::next_u32(r) as u64), false) }

/// the bell curve, as the world is made with
fun gauss(r: &mut Rng, mean: Fx, sd: Fx): Fx {
    let mut u = rng::next_u32(r);
    while (u == 0) u = rng::next_u32(r);
    let v = rng::next_u32(r);
    let uf = fx::from_raw((u as u64), false);
    let vf = fx::from_raw((v as u64), false);
    let radius = fx::sqrt(&fx::mul_int(&fx::abs(&fx::ln(&uf)), 2));
    let angle = fx::cos(&fx::mul(&fx::from_ratio(628318531, 100000000), &vf));
    fx::add(&mean, &fx::mul(&sd, &fx::mul(&radius, &angle)))
}

/// Round a fraction by chance rather than away. Two thirds of a point becomes two points in one
/// season out of three instead of nothing in every one, which is how small gains ever add up.
fun stochastic(r: &mut Rng, x: &Fx): u64 {
    let whole = fx::raw(x) >> 32;
    let part = fx::raw(x) & 0xFFFFFFFF;
    whole + (if ((rng::next_u32(r) as u64) < part) 1 else 0)
}

fun clamp_u16(v: &Fx, lo: u16, hi: u16): u16 {
    if (fx::is_neg(v)) return lo;
    let n = fx::to_int_round(v);
    if (n < (lo as u64)) lo else if (n > (hi as u64)) hi else (n as u16)
}
