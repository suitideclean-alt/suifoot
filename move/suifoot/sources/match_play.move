/// Ninety minutes, a minute at a time.
///
/// The order the random draws are taken in is as much a part of the rules as the probabilities are.
/// Move one draw and every match after that point is a different match, so this is written in the
/// same order as src/match.js and is checked against it: eighteen men written out by hand, four
/// seeds, and the same score, the same scorers, the same minutes on both sides.
module suifoot::match_play;

use suifoot::engine::{Self, Power, OnPitch};
use suifoot::fx::{Self, Fx};
use suifoot::player::{Self, Player};
use suifoot::rng::{Self, Rng};

const HOME: u8 = 0;
const AWAY: u8 = 1;

const ATT: u8 = 0;
const BAL: u8 = 1;
const DEF: u8 = 2;

// what each kind of event is, as it goes into the record
const GOAL: u8 = 0;
const SHOT: u8 = 1;
const YELLOW: u8 = 2;
const RED: u8 = 3;
const INJURY: u8 = 4;
const SUB: u8 = 5;
const PENALTY: u8 = 6;

/// at most five changes a side
const SUBS: u64 = 5;

/// The chances that are drawn against every minute or every attack, carried already at the scale.
///
/// Written out rather than worked out, because working them out means a multiply and a divide in a
/// hundred and twenty-eight bits, and three of these are reached twice a minute for ninety minutes:
/// five hundred and forty times a match, to arrive at the same nine numbers. A test below checks
/// each one against the arithmetic it stands in for, so they cannot quietly drift from the rules.
const ATTACK_RATE: u64 = 1202590843;     // 0.28 attacking moves a minute, between the two sides
const PENALTY_RATE: u64 = 51539608;      // 0.012 of attacks are a penalty
const SHOT_RATE: u64 = 3092376453;       // 0.72 of attacks produce a shot of some kind
const ASSIST_RATE: u64 = 3006477107;     // 0.70 of goals have somebody to thank
const TELL_RATE: u64 = 1460288881;       // 0.34 of the rest are worth telling about
const CARD_RATE: u64 = 81604379;         // 0.019 a side a minute, before temperament
const RED_RATE: u64 = 2147484;           // 0.0005, and rarer still for a gentleman
const INJURY_RATE: u64 = 2576980;        // 0.0006, likelier the more tired the man
const BOOK_FOUL_RATE: u64 = 1503238554;  // 0.35 of penalties also cost a booking

public struct Event has copy, drop, store {
    minute: u8,
    side: u8,
    kind: u8,
    who: u32,
    other: u32,
}

public struct Result has copy, drop, store {
    home_goals: u8,
    away_goals: u8,
    home_shots: u8,
    away_shots: u8,
    home_poss: u8,
    away_poss: u8,
    events: vector<Event>,
}

public struct Side has copy, drop, store {
    xi: vector<OnPitch>,
    bench: vector<Player>,
    tactic: u8,
    tbonus: u64,
    subs: u64,
    goals: u64,
    shots: u64,
    poss: u64,
    /// how freely this eleven collects cards, averaged over the men who started
    card_f: Fx,
    red_f: Fx,
    pw: Power,
    /// What an attack by this side is worth, and - on the home side only - how often the ball comes
    /// its way at all. Both follow from the two sides' strengths and nothing else, so they are
    /// worked out when those change and not again every minute in between. The same numbers, found
    /// once instead of ninety times.
    pg: Fx,
    pg_known: bool,
    attack_share: Fx,
}

public fun home_goals(r: &Result): u8 { r.home_goals }
public fun away_goals(r: &Result): u8 { r.away_goals }
public fun home_shots(r: &Result): u8 { r.home_shots }
public fun away_shots(r: &Result): u8 { r.away_shots }
public fun home_poss(r: &Result): u8 { r.home_poss }
public fun away_poss(r: &Result): u8 { r.away_poss }
public fun events(r: &Result): &vector<Event> { &r.events }
public fun ev_minute(e: &Event): u8 { e.minute }
public fun ev_side(e: &Event): u8 { e.side }
public fun ev_kind(e: &Event): u8 { e.kind }
public fun ev_who(e: &Event): u32 { e.who }
public fun ev_other(e: &Event): u32 { e.other }

public fun goal(): u8 { GOAL }
public fun shot(): u8 { SHOT }
public fun yellow(): u8 { YELLOW }
public fun red(): u8 { RED }
public fun injury(): u8 { INJURY }
public fun sub(): u8 { SUB }
public fun penalty_kind(): u8 { PENALTY }

public fun attack_rate(): u64 { ATTACK_RATE }
public fun penalty_rate(): u64 { PENALTY_RATE }
public fun shot_rate(): u64 { SHOT_RATE }
public fun assist_rate(): u64 { ASSIST_RATE }
public fun tell_rate(): u64 { TELL_RATE }
public fun card_rate(): u64 { CARD_RATE }
public fun red_rate(): u64 { RED_RATE }
public fun injury_rate(): u64 { INJURY_RATE }
public fun book_foul_rate(): u64 { BOOK_FOUL_RATE }

// ---------- building a side ----------

fun make_side(xi: vector<Player>, bench: vector<Player>, tactic: u8, tbonus: u64): Side {
    let mut on = vector::empty<OnPitch>();
    let mut card_sum = fx::zero();
    let mut red_sum = fx::zero();
    let n = xi.length();
    let mut i = 0;
    while (i < n) {
        let p = xi[i];
        card_sum = fx::add(&card_sum, &player::card_factor(&p));
        red_sum = fx::add(&red_sum, &player::red_factor(&p));
        on.push_back(engine::on_pitch(p, 0));
        i = i + 1;
    };
    Side {
        xi: on, bench, tactic, tbonus,
        subs: 0, goals: 0, shots: 0, poss: 0,
        card_f: fx::div_int(&card_sum, n),
        red_f: fx::div_int(&red_sum, n),
        pw: engine::power(&vector::empty(), &vector::empty(), 0, BAL, 0),
        pg: fx::zero(),
        pg_known: false,
        attack_share: fx::zero(),
    }
}

/// the tactics triangle: attacking beats balanced, balanced beats defensive, defensive beats attacking
fun beats(t: u8): u8 { if (t == ATT) BAL else if (t == BAL) DEF else ATT }

fun refresh(h: &mut Side, a: &mut Side, minute: u64) {
    h.pw = engine::power_now(&h.xi, minute, h.tactic, h.tbonus);
    a.pw = engine::power_now(&a.xi, minute, a.tactic, a.tbonus);
    let edge = fx::from_ratio(1025, 1000);
    if (beats(h.tactic) == a.tactic) h.pw = engine::scale(&h.pw, &edge);
    if (beats(a.tactic) == h.tactic) a.pw = engine::scale(&a.pw, &edge);

    // Everything below follows from those four numbers each and nothing else, so it is worked out
    // here rather than again inside every attack and every minute. The values are identical: they
    // could only change when the strengths do, and the strengths only change here.
    // marked as needing working out again, rather than worked out now: a side that never gets
    // forward before the next change never needs it at all
    h.pg_known = false;
    a.pg_known = false;

    let gap = fx::sub(&fx::add(&engine::mp(&h.pw), &fx::from_ratio(18, 10)), &engine::mp(&a.pw));
    h.attack_share = fx::div(
        &fx::one(),
        &fx::add(&fx::one(), &fx::exp(&fx::negate(&fx::mul(&fx::from_ratio(36, 1000), &gap)))),
    );
}

/// How likely an attack is to end in a goal: the gap between this attack and that defence, softened
/// by how good the keeper is, and then held between a fortieth and a half so that no mismatch ever
/// becomes a certainty either way.
fun goal_chance(att: &Power, def: &Power, home: bool): Fx {
    let ratio = fx::exp(&fx::mul(&fx::from_ratio(36, 1000), &fx::sub(&engine::ap(att), &engine::dp(def))));
    let floor15 = fx::from_int(15);
    let keeper = if (fx::gt(&engine::gk(def), &floor15)) engine::gk(def) else floor15;
    let gkf = fx::pow(&fx::div(&engine::dp(def), &keeper), &fx::from_ratio(6, 10));
    let raw = fx::mul(
        &fx::mul(&fx::mul(&fx::from_ratio(84, 1000), &ratio), &gkf),
        &(if (home) fx::from_ratio(115, 100) else fx::one()),
    );
    fx::clamp(raw, fx::from_ratio(15, 1000), fx::from_ratio(50, 100))
}

// ---------- picking a man out of an eleven ----------

/// the browser's R.weighted: one draw, walked down a list of weights
fun weighted(r: &mut Rng, weights: &vector<Fx>): u64 {
    let n = weights.length();
    let mut total = fx::zero();
    let mut i = 0;
    while (i < n) { total = fx::add(&total, &weights[i]); i = i + 1; };
    if (fx::is_zero(&total)) return rng::index(r, n);
    let mut left = fx::mul(&fx::from_raw(rng::next_u32(r) as u64, false), &total);
    let mut j = 0;
    while (j < n) {
        left = fx::sub(&left, &weights[j]);
        if (fx::is_neg(&left) || fx::is_zero(&left)) return j;
        j = j + 1;
    };
    n - 1
}

fun ovr_fx(o: &OnPitch): Fx { fx::from_int((player::ovr(engine::man(o)) as u64)) }

/// who is likeliest to put it away: forwards most, then midfielders, defenders rarely, never the keeper
fun scorer_weights(s: &Side): vector<Fx> {
    let mut w = vector::empty<Fx>();
    let mut i = 0;
    while (i < s.xi.length()) {
        let pos = player::pos(engine::man(&s.xi[i]));
        let o = ovr_fx(&s.xi[i]);
        w.push_back(
            if (pos == player::gk()) fx::zero()
            else if (pos == player::df()) fx::mul(&fx::from_ratio(8, 100), &o)
            else if (pos == player::mf()) fx::mul(&fx::from_ratio(35, 100), &o)
            else o
        );
        i = i + 1;
    };
    w
}

// ---------- the match ----------

/// Play it out. The seed is the one the chain drew after the deadline, so neither manager could
/// have known it while there was still a lineup to change.
public fun play(
    home_xi: vector<Player>, home_bench: vector<Player>, home_tactic: u8, home_tbonus: u64,
    away_xi: vector<Player>, away_bench: vector<Player>, away_tactic: u8, away_tbonus: u64,
    seed: u32,
): Result {
    let mut r = rng::new(seed);
    let mut h = make_side(home_xi, home_bench, home_tactic, home_tbonus);
    let mut a = make_side(away_xi, away_bench, away_tactic, away_tbonus);
    let mut events = vector::empty<Event>();
    refresh(&mut h, &mut a, 0);

    let mut minute = 0u64;
    while (minute < 90) {
        minute = minute + 1;

        // is there an attack at all this minute, and whose
        if (rng::next_fx(&mut r) < ATTACK_RATE) {
            let home_has_it = rng::next_fx(&mut r) < fx::raw(&h.attack_share);
            attack(&mut r, &mut h, &mut a, home_has_it, minute, &mut events);
        };

        // then, for each side in turn: a booking, a sending off, an injury, and the hour-mark changes
        let mut which = 0u8;
        while (which < 2) {
            incidents(&mut r, &mut h, &mut a, which, minute, &mut events);
            which = which + 1;
        };

        if (minute % 15 == 0) refresh(&mut h, &mut a, minute);
    };

    Result {
        home_goals: (h.goals as u8),
        away_goals: (a.goals as u8),
        home_shots: (h.shots as u8),
        away_shots: (a.shots as u8),
        home_poss: (h.poss as u8),
        away_poss: (a.poss as u8),
        events,
    }
}

/// whichever of the two is being asked to change
fun side_mut(h: &mut Side, a: &mut Side, home: bool): &mut Side { if (home) h else a }

fun keeper_ovr(s: &Side): u64 {
    let mut i = 0;
    while (i < s.xi.length()) {
        if (player::is_keeper(engine::man(&s.xi[i]))) return (player::ovr(engine::man(&s.xi[i])) as u64);
        i = i + 1;
    };
    55 // nobody in goal: the engine still has to put a number against the penalty taker
}
fun keeper_num(s: &Side): u32 {
    let mut i = 0;
    while (i < s.xi.length()) {
        if (player::is_keeper(engine::man(&s.xi[i]))) return player::num(engine::man(&s.xi[i]));
        i = i + 1;
    };
    0
}

/// An attack. How likely it is to end in a goal comes from the gap between this attack and that
/// defence, softened by how good the keeper is, and then held between a fortieth and a half so that
/// no mismatch ever becomes a certainty either way.
fun attack(r: &mut Rng, h: &mut Side, a: &mut Side, home: bool, minute: u64, events: &mut vector<Event>) {
    let att_pw = if (home) h.pw else a.pw; // copied, so neither side stays borrowed
    let def_pw = if (home) a.pw else h.pw;
    let pg = {
        let known = { let s = side_mut(h, a, home); s.pg_known };
        let v = if (known) { let s = side_mut(h, a, home); s.pg } else goal_chance(&att_pw, &def_pw, home);
        let s = side_mut(h, a, home);
        s.pg = v;
        s.pg_known = true;
        s.poss = s.poss + 1;
        v
    };

    // a penalty first: it replaces the attack rather than following it
    if (rng::next_fx(r) < PENALTY_RATE) {
        spot_kick(r, h, a, home, minute, events);
        return
    };

    if (rng::next_fx(r) < SHOT_RATE) {
        let s = side_mut(h, a, home);
        s.shots = s.shots + 1;
    };

    if (rng::next_fx(r) < fx::raw(&pg)) {
        let weights = { let s = side_mut(h, a, home); scorer_weights(s) };
        let si = weighted(r, &weights);
        let scorer = { let s = side_mut(h, a, home); player::num(engine::man(&s.xi[si])) };

        // and whether anybody made it for him: midfielders likeliest
        let mut assist = 0u32;
        if (rng::next_fx(r) < ASSIST_RATE) {
            let (aw, nums) = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut nums = vector::empty<u32>();
                let mut i = 0;
                while (i < s.xi.length()) {
                    if (i != si) {
                        let pos = player::pos(engine::man(&s.xi[i]));
                        let o = ovr_fx(&s.xi[i]);
                        w.push_back(
                            if (pos == player::gk()) fx::zero()
                            else if (pos == player::mf()) fx::mul(&fx::from_ratio(12, 10), &o)
                            else o
                        );
                        nums.push_back(player::num(engine::man(&s.xi[i])));
                    };
                    i = i + 1;
                };
                (w, nums)
            };
            if (aw.length() > 0) { let ai = weighted(r, &aw); assist = nums[ai]; };
        };

        let s = side_mut(h, a, home);
        s.goals = s.goals + 1;
        events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: GOAL, who: scorer, other: assist });
        return
    };

    // not a goal, but worth telling: saved, wide, off the woodwork or blocked
    let had_shots = { let s = side_mut(h, a, home); s.shots > 0 };
    if (had_shots && rng::next_fx(r) < TELL_RATE) {
        let weights = {
            let s = side_mut(h, a, home);
            let mut w = vector::empty<Fx>();
            let mut i = 0;
            while (i < s.xi.length()) {
                let pos = player::pos(engine::man(&s.xi[i]));
                let o = ovr_fx(&s.xi[i]);
                w.push_back(
                    if (pos == player::gk()) fx::zero()
                    else if (pos == player::df()) fx::mul(&fx::from_ratio(10, 100), &o)
                    else if (pos == player::mf()) fx::mul(&fx::from_ratio(40, 100), &o)
                    else o
                );
                i = i + 1;
            };
            w
        };
        let shi = weighted(r, &weights);
        let shooter = { let s = side_mut(h, a, home); player::num(engine::man(&s.xi[shi])) };
        let gkp = if (home) keeper_num(a) else keeper_num(h);
        rng::index(r, 6); // which of the six it was, drawn and then told in the browser
        events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: SHOT, who: shooter, other: gkp });
    };
}

/// A penalty. The best finisher takes it, and the man who gave it away may be booked for it.
fun spot_kick(r: &mut Rng, h: &mut Side, a: &mut Side, home: bool, minute: u64, events: &mut vector<Event>) {
    let taker = {
        let s = side_mut(h, a, home);
        let mut best = 0u64;
        let mut best_v = 0u64;
        let mut found = false;
        let mut i = 0;
        while (i < s.xi.length()) {
            if (!player::is_keeper(engine::man(&s.xi[i]))) {
                let v = (player::ovr(engine::man(&s.xi[i])) as u64) + (if (player::pos(engine::man(&s.xi[i])) == player::fw()) 3 else 0);
                if (!found || v > best_v) { best = i; best_v = v; found = true };
            };
            i = i + 1;
        };
        best
    };
    let taker_ovr = { let s = side_mut(h, a, home); (player::ovr(engine::man(&s.xi[taker])) as u64) };
    let taker_num = { let s = side_mut(h, a, home); player::num(engine::man(&s.xi[taker])) };

    // who conceded it: a defender most often, weighted by how freely he goes in
    let foul_weights = {
        let d = side_mut(h, a, !home);
        let mut w = vector::empty<Fx>();
        let mut i = 0;
        while (i < d.xi.length()) {
            let pos = player::pos(engine::man(&d.xi[i]));
            let base = if (pos == player::df()) fx::from_ratio(14, 10)
                else if (pos == player::mf()) fx::one()
                else if (pos == player::gk()) fx::from_ratio(3, 10)
                else fx::from_ratio(4, 10);
            w.push_back(fx::mul(&base, &player::card_factor(engine::man(&d.xi[i]))));
            i = i + 1;
        };
        w
    };
    let foul = weighted(r, &foul_weights);
    let foul_num = { let d = side_mut(h, a, !home); player::num(engine::man(&d.xi[foul])) };
    let gk_ovr = if (home) keeper_ovr(a) else keeper_ovr(h);

    { let s = side_mut(h, a, home); s.shots = s.shots + 1; };

    // a good taker against a poor keeper scores more, but never fewer than three in five
    let edge = if (taker_ovr >= gk_ovr) fx::div_int(&fx::from_int(taker_ovr - gk_ovr), 300)
        else fx::negate(&fx::div_int(&fx::from_int(gk_ovr - taker_ovr), 300));
    let p_ok = fx::clamp(fx::add(&fx::from_ratio(76, 100), &edge), fx::from_ratio(60, 100), fx::from_ratio(88, 100));

    let scored = rng::next_fx(r) < fx::raw(&p_ok);
    if (!scored) { rng::index(r, 3); }; // saved, wide or off the post
    events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: PENALTY, who: taker_num, other: foul_num });
    if (scored) {
        let s = side_mut(h, a, home);
        s.goals = s.goals + 1;
        events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: GOAL, who: taker_num, other: 0 });
    };
    if (rng::next_fx(r) < BOOK_FOUL_RATE) {
        book(h, a, !home, foul, minute, events);
    };
}

/// A yellow. The second one is a red and he goes off.
fun book(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64, events: &mut vector<Event>) {
    let (num, twice) = {
        let s = side_mut(h, a, home);
        engine::book(&mut s.xi[i]);
        (player::num(engine::man(&s.xi[i])), engine::yellows(&s.xi[i]) >= 2)
    };
    let who = if (home) HOME else AWAY;
    if (twice) {
        events.push_back(Event { minute: (minute as u8), side: who, kind: RED, who: num, other: 1 });
        send_off(h, a, home, i, minute);
    } else {
        events.push_back(Event { minute: (minute as u8), side: who, kind: YELLOW, who: num, other: 0 });
    };
}

/// Off the pitch, with nobody coming on for him. The two sides are weighed again straight away:
/// playing a man short has to tell from the next minute, not from the next quarter of an hour.
fun send_off(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64) {
    { let s = side_mut(h, a, home); s.xi.remove(i); };
    refresh(h, a, minute);
}

/// off injured, and if there is anyone left to bring on, the best man of his position comes on
fun carried_off(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64, events: &mut vector<Event>) {
    replace_injured(h, a, home, i, minute, events);
    refresh(h, a, minute);
}

fun replace_injured(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64, events: &mut vector<Event>) {
    let s = side_mut(h, a, home);
    let gone = *engine::man(&s.xi[i]);
    s.xi.remove(i);
    if (s.subs >= SUBS || s.bench.length() == 0) return;

    let want = player::pos(&gone);
    let mut pick = 0u64;
    let mut best = 0u16;
    let mut found = false;
    let mut j = 0;
    while (j < s.bench.length()) { // first the same position, and only then anyone outfield
        if (player::pos(&s.bench[j]) == want) {
            let o = player::ovr(&s.bench[j]);
            if (!found || o > best) { pick = j; best = o; found = true };
        };
        j = j + 1;
    };
    if (!found) {
        let mut k = 0;
        while (k < s.bench.length()) {
            if (player::pos(&s.bench[k]) != player::gk()) {
                let o = player::ovr(&s.bench[k]);
                if (!found || o > best) { pick = k; best = o; found = true };
            };
            k = k + 1;
        };
    };
    if (!found) return;

    let coming = s.bench.remove(pick);
    let num = player::num(&coming);
    s.xi.push_back(engine::on_pitch(coming, minute));
    s.subs = s.subs + 1;
    events.push_back(Event {
        minute: (minute as u8), side: if (home) HOME else AWAY, kind: SUB,
        who: num, other: player::num(&gone),
    });
}

/// Everything that can happen to a side in a minute that is not an attack, in the order it is drawn.
fun incidents(r: &mut Rng, h: &mut Side, a: &mut Side, which: u8, minute: u64, events: &mut vector<Event>) {
    let home = which == 0;

    // a booking
    let card_p = { let s = side_mut(h, a, home); fx::mul(&fx::from_raw(CARD_RATE, false), &s.card_f) };
    if (rng::next_fx(r) < fx::raw(&card_p)) {
        let weights = {
            let s = side_mut(h, a, home);
            let mut w = vector::empty<Fx>();
            let mut i = 0;
            while (i < s.xi.length()) {
                let pos = player::pos(engine::man(&s.xi[i]));
                let base = if (pos == player::gk()) fx::from_ratio(2, 10)
                    else if (pos == player::df()) fx::from_ratio(13, 10)
                    else if (pos == player::mf()) fx::from_ratio(11, 10)
                    else fx::from_ratio(8, 10);
                w.push_back(fx::mul(&base, &player::card_factor(engine::man(&s.xi[i]))));
                i = i + 1;
            };
            w
        };
        let i = weighted(r, &weights);
        book(h, a, home, i, minute, events);
    };

    // a straight red, which is rare and never leaves a side below nine
    let enough = { let s = side_mut(h, a, home); s.xi.length() > 8 };
    if (enough) {
        let red_p = { let s = side_mut(h, a, home); fx::mul(&fx::from_raw(RED_RATE, false), &s.red_f) };
        if (rng::next_fx(r) < fx::raw(&red_p)) {
            let weights = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut i = 0;
                while (i < s.xi.length()) { w.push_back(player::red_factor(engine::man(&s.xi[i]))); i = i + 1; };
                w
            };
            let i = weighted(r, &weights);
            let num = { let s = side_mut(h, a, home); player::num(engine::man(&s.xi[i])) };
            events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: RED, who: num, other: 0 });
            send_off(h, a, home, i, minute);
        };
    };

    // an injury, likelier the more tired the man is
    if (rng::next_fx(r) < INJURY_RATE) {
        let enough_now = { let s = side_mut(h, a, home); s.xi.length() > 8 };
        if (enough_now) {
            let weights = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut i = 0;
                while (i < s.xi.length()) {
                    let c = (player::cond(engine::man(&s.xi[i])) as u64);
                    w.push_back(fx::add(&fx::one(), &fx::div_int(&fx::from_int(100 - c), 60)));
                    i = i + 1;
                };
                w
            };
            let i = weighted(r, &weights);
            let num = { let s = side_mut(h, a, home); player::num(engine::man(&s.xi[i])) };
            events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: INJURY, who: num, other: 0 });
            carried_off(h, a, home, i, minute, events);
        };
    };

    // fresh legs on the hour and again at seventy-four
    if (minute == 62 || minute == 74) {
        let cap = if (minute == 62) 3 else SUBS;
        let can = { let s = side_mut(h, a, home); s.subs < cap && s.bench.length() > 0 };
        if (can) fresh_legs(h, a, home, minute, events);
    };
}

/// Take off the weakest outfield man and bring on someone of his position who is not worse by more
/// than four. No draw is taken: a manager who has gone to bed still gets his changes made.
fun fresh_legs(h: &mut Side, a: &mut Side, home: bool, minute: u64, events: &mut vector<Event>) {
    let (made, coming, going_off) = swap_in(h, a, home, minute);
    if (!made) return;
    refresh(h, a, minute); // the mirror weighs the sides again before the change is told
    events.push_back(Event {
        minute: (minute as u8), side: if (home) HOME else AWAY, kind: SUB, who: coming, other: going_off,
    });
}

fun swap_in(h: &mut Side, a: &mut Side, home: bool, minute: u64): (bool, u32, u32) {
    let s = side_mut(h, a, home);

    let mut out = 0u64;
    let mut out_v = fx::zero();
    let mut found = false;
    let mut i = 0;
    while (i < s.xi.length()) {
        if (!player::is_keeper(engine::man(&s.xi[i]))) {
            let v = fx::add(&ovr_fx(&s.xi[i]), &player::cond_adj(engine::man(&s.xi[i])));
            if (!found || fx::lt(&v, &out_v)) { out = i; out_v = v; found = true };
        };
        i = i + 1;
    };
    if (!found) return (false, 0, 0);

    let want = player::pos(engine::man(&s.xi[out]));
    let mut pick = 0u64;
    let mut best = 0u16;
    let mut got = false;
    let mut j = 0;
    while (j < s.bench.length()) {
        if (player::pos(&s.bench[j]) == want) {
            let o = player::ovr(&s.bench[j]);
            if (!got || o > best) { pick = j; best = o; got = true };
        };
        j = j + 1;
    };
    if (!got) return (false, 0, 0);

    let cand_v = fx::add(
        &fx::from_int((player::ovr(&s.bench[pick]) as u64)),
        &player::cond_adj(&s.bench[pick]),
    );
    if (fx::lt(&cand_v, &fx::sub(&out_v, &fx::from_int(4)))) return (false, 0, 0);

    let going_off = player::num(engine::man(&s.xi[out]));
    let coming = s.bench.remove(pick);
    let num = player::num(&coming);
    *(&mut s.xi[out]) = engine::on_pitch(coming, minute);
    s.subs = s.subs + 1;
    (true, num, going_off)
}
