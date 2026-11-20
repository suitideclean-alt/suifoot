/// Ninety minutes, a minute at a time.
///
/// The order the random draws are taken in is as much a part of the rules as the probabilities are.
/// Move one draw and every match after that point is a different match, so this is written in the
/// same order as src/match.js and is checked against it: eighteen men written out by hand, four
/// seeds, and the same score, the same scorers, the same minutes on both sides.
module suifoot::match_play;

use suifoot::engine::{Self, Power};
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

/// a man on the pitch: when he came on, and what he has already been booked for
public struct OnPitch has copy, drop, store {
    p: Player,
    since: u64,
    yellows: u8,
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
        on.push_back(OnPitch { p, since: 0, yellows: 0 });
        i = i + 1;
    };
    Side {
        xi: on, bench, tactic, tbonus,
        subs: 0, goals: 0, shots: 0, poss: 0,
        card_f: fx::div_int(&card_sum, n),
        red_f: fx::div_int(&red_sum, n),
        pw: engine::power(&vector::empty(), &vector::empty(), 0, BAL, 0),
    }
}

fun players_of(s: &Side): vector<Player> {
    let mut out = vector::empty<Player>();
    let mut i = 0;
    while (i < s.xi.length()) { out.push_back(s.xi[i].p); i = i + 1; };
    out
}
fun since_of(s: &Side): vector<u64> {
    let mut out = vector::empty<u64>();
    let mut i = 0;
    while (i < s.xi.length()) { out.push_back(s.xi[i].since); i = i + 1; };
    out
}

/// the tactics triangle: attacking beats balanced, balanced beats defensive, defensive beats attacking
fun beats(t: u8): u8 { if (t == ATT) BAL else if (t == BAL) DEF else ATT }

fun refresh(h: &mut Side, a: &mut Side, minute: u64) {
    h.pw = engine::power(&players_of(h), &since_of(h), minute, h.tactic, h.tbonus);
    a.pw = engine::power(&players_of(a), &since_of(a), minute, a.tactic, a.tbonus);
    let edge = fx::from_ratio(1025, 1000);
    if (beats(h.tactic) == a.tactic) h.pw = engine::scale(&h.pw, &edge);
    if (beats(a.tactic) == h.tactic) a.pw = engine::scale(&a.pw, &edge);
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

fun ovr_fx(o: &OnPitch): Fx { fx::from_int((player::ovr(&o.p) as u64)) }

/// who is likeliest to put it away: forwards most, then midfielders, defenders rarely, never the keeper
fun scorer_weights(s: &Side): vector<Fx> {
    let mut w = vector::empty<Fx>();
    let mut i = 0;
    while (i < s.xi.length()) {
        let pos = player::pos(&s.xi[i].p);
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
        if (rng::next_fx(&mut r) < fx::raw(&fx::from_ratio(28, 100))) {
            let gap = fx::sub(&fx::add(&engine::mp(&h.pw), &fx::from_ratio(18, 10)), &engine::mp(&a.pw));
            let logistic = fx::div(&fx::one(), &fx::add(&fx::one(), &fx::exp(&fx::negate(&fx::mul(&fx::from_ratio(36, 1000), &gap)))));
            let home_has_it = rng::next_fx(&mut r) < fx::raw(&logistic);
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
        if (player::is_keeper(&s.xi[i].p)) return (player::ovr(&s.xi[i].p) as u64);
        i = i + 1;
    };
    55 // nobody in goal: the engine still has to put a number against the penalty taker
}
fun keeper_num(s: &Side): u32 {
    let mut i = 0;
    while (i < s.xi.length()) {
        if (player::is_keeper(&s.xi[i].p)) return player::num(&s.xi[i].p);
        i = i + 1;
    };
    0
}

/// An attack. How likely it is to end in a goal comes from the gap between this attack and that
/// defence, softened by how good the keeper is, and then held between a fortieth and a half so that
/// no mismatch ever becomes a certainty either way.
fun attack(r: &mut Rng, h: &mut Side, a: &mut Side, home: bool, minute: u64, events: &mut vector<Event>) {
    let att_pw = if (home) h.pw else a.pw;
    let def_pw = if (home) a.pw else h.pw;

    { let s = side_mut(h, a, home); s.poss = s.poss + 1; };

    let ratio = fx::exp(&fx::mul(&fx::from_ratio(36, 1000), &fx::sub(&engine::ap(&att_pw), &engine::dp(&def_pw))));
    let floor15 = fx::from_int(15);
    let keeper = if (fx::gt(&engine::gk(&def_pw), &floor15)) engine::gk(&def_pw) else floor15;
    let gkf = fx::pow(&fx::div(&engine::dp(&def_pw), &keeper), &fx::from_ratio(6, 10));
    let raw_pg = fx::mul(
        &fx::mul(&fx::mul(&fx::from_ratio(84, 1000), &ratio), &gkf),
        &(if (home) fx::from_ratio(115, 100) else fx::one()),
    );
    let pg = fx::clamp(raw_pg, fx::from_ratio(15, 1000), fx::from_ratio(50, 100));

    // a penalty first: it replaces the attack rather than following it
    if (rng::next_fx(r) < fx::raw(&fx::from_ratio(12, 1000))) {
        spot_kick(r, h, a, home, minute, events);
        return
    };

    if (rng::next_fx(r) < fx::raw(&fx::from_ratio(72, 100))) {
        let s = side_mut(h, a, home);
        s.shots = s.shots + 1;
    };

    if (rng::next_fx(r) < fx::raw(&pg)) {
        let weights = { let s = side_mut(h, a, home); scorer_weights(s) };
        let si = weighted(r, &weights);
        let scorer = { let s = side_mut(h, a, home); player::num(&s.xi[si].p) };

        // and whether anybody made it for him: midfielders likeliest
        let mut assist = 0u32;
        if (rng::next_fx(r) < fx::raw(&fx::from_ratio(70, 100))) {
            let (aw, nums) = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut nums = vector::empty<u32>();
                let mut i = 0;
                while (i < s.xi.length()) {
                    if (i != si) {
                        let pos = player::pos(&s.xi[i].p);
                        let o = ovr_fx(&s.xi[i]);
                        w.push_back(
                            if (pos == player::gk()) fx::zero()
                            else if (pos == player::mf()) fx::mul(&fx::from_ratio(12, 10), &o)
                            else o
                        );
                        nums.push_back(player::num(&s.xi[i].p));
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
    if (had_shots && rng::next_fx(r) < fx::raw(&fx::from_ratio(34, 100))) {
        let weights = {
            let s = side_mut(h, a, home);
            let mut w = vector::empty<Fx>();
            let mut i = 0;
            while (i < s.xi.length()) {
                let pos = player::pos(&s.xi[i].p);
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
        let shooter = { let s = side_mut(h, a, home); player::num(&s.xi[shi].p) };
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
            if (!player::is_keeper(&s.xi[i].p)) {
                let v = (player::ovr(&s.xi[i].p) as u64) + (if (player::pos(&s.xi[i].p) == player::fw()) 3 else 0);
                if (!found || v > best_v) { best = i; best_v = v; found = true };
            };
            i = i + 1;
        };
        best
    };
    let taker_ovr = { let s = side_mut(h, a, home); (player::ovr(&s.xi[taker].p) as u64) };
    let taker_num = { let s = side_mut(h, a, home); player::num(&s.xi[taker].p) };

    // who conceded it: a defender most often, weighted by how freely he goes in
    let foul_weights = {
        let d = side_mut(h, a, !home);
        let mut w = vector::empty<Fx>();
        let mut i = 0;
        while (i < d.xi.length()) {
            let pos = player::pos(&d.xi[i].p);
            let base = if (pos == player::df()) fx::from_ratio(14, 10)
                else if (pos == player::mf()) fx::one()
                else if (pos == player::gk()) fx::from_ratio(3, 10)
                else fx::from_ratio(4, 10);
            w.push_back(fx::mul(&base, &player::card_factor(&d.xi[i].p)));
            i = i + 1;
        };
        w
    };
    let foul = weighted(r, &foul_weights);
    let foul_num = { let d = side_mut(h, a, !home); player::num(&d.xi[foul].p) };
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
    if (rng::next_fx(r) < fx::raw(&fx::from_ratio(35, 100))) {
        book(h, a, !home, foul, minute, events);
    };
}

/// A yellow. The second one is a red and he goes off.
fun book(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64, events: &mut vector<Event>) {
    let (num, twice) = {
        let s = side_mut(h, a, home);
        s.xi[i].yellows = s.xi[i].yellows + 1;
        (player::num(&s.xi[i].p), s.xi[i].yellows >= 2)
    };
    let who = if (home) HOME else AWAY;
    if (twice) {
        events.push_back(Event { minute: (minute as u8), side: who, kind: RED, who: num, other: 1 });
        send_off(h, a, home, i);
    } else {
        events.push_back(Event { minute: (minute as u8), side: who, kind: YELLOW, who: num, other: 0 });
    };
}

/// off the pitch, with nobody coming on for him
fun send_off(h: &mut Side, a: &mut Side, home: bool, i: u64) {
    let s = side_mut(h, a, home);
    s.xi.remove(i);
}

/// off injured, and if there is anyone left to bring on, the best man of his position comes on
fun carried_off(h: &mut Side, a: &mut Side, home: bool, i: u64, minute: u64, events: &mut vector<Event>) {
    let s = side_mut(h, a, home);
    let gone = s.xi[i].p;
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
    s.xi.push_back(OnPitch { p: coming, since: minute, yellows: 0 });
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
    let card_p = { let s = side_mut(h, a, home); fx::mul(&fx::from_ratio(19, 1000), &s.card_f) };
    if (rng::next_fx(r) < fx::raw(&card_p)) {
        let weights = {
            let s = side_mut(h, a, home);
            let mut w = vector::empty<Fx>();
            let mut i = 0;
            while (i < s.xi.length()) {
                let pos = player::pos(&s.xi[i].p);
                let base = if (pos == player::gk()) fx::from_ratio(2, 10)
                    else if (pos == player::df()) fx::from_ratio(13, 10)
                    else if (pos == player::mf()) fx::from_ratio(11, 10)
                    else fx::from_ratio(8, 10);
                w.push_back(fx::mul(&base, &player::card_factor(&s.xi[i].p)));
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
        let red_p = { let s = side_mut(h, a, home); fx::mul(&fx::from_ratio(5, 10000), &s.red_f) };
        if (rng::next_fx(r) < fx::raw(&red_p)) {
            let weights = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut i = 0;
                while (i < s.xi.length()) { w.push_back(player::red_factor(&s.xi[i].p)); i = i + 1; };
                w
            };
            let i = weighted(r, &weights);
            let num = { let s = side_mut(h, a, home); player::num(&s.xi[i].p) };
            events.push_back(Event { minute: (minute as u8), side: if (home) HOME else AWAY, kind: RED, who: num, other: 0 });
            send_off(h, a, home, i);
        };
    };

    // an injury, likelier the more tired the man is
    let inj_p = fx::from_ratio(6, 10000);
    if (rng::next_fx(r) < fx::raw(&inj_p)) {
        let enough_now = { let s = side_mut(h, a, home); s.xi.length() > 8 };
        if (enough_now) {
            let weights = {
                let s = side_mut(h, a, home);
                let mut w = vector::empty<Fx>();
                let mut i = 0;
                while (i < s.xi.length()) {
                    let c = (player::cond(&s.xi[i].p) as u64);
                    w.push_back(fx::add(&fx::one(), &fx::div_int(&fx::from_int(100 - c), 60)));
                    i = i + 1;
                };
                w
            };
            let i = weighted(r, &weights);
            let num = { let s = side_mut(h, a, home); player::num(&s.xi[i].p) };
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
    let s = side_mut(h, a, home);

    let mut out = 0u64;
    let mut out_v = fx::zero();
    let mut found = false;
    let mut i = 0;
    while (i < s.xi.length()) {
        if (!player::is_keeper(&s.xi[i].p)) {
            let v = fx::add(&ovr_fx(&s.xi[i]), &player::cond_adj(&s.xi[i].p));
            if (!found || fx::lt(&v, &out_v)) { out = i; out_v = v; found = true };
        };
        i = i + 1;
    };
    if (!found) return;

    let want = player::pos(&s.xi[out].p);
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
    if (!got) return;

    let cand_v = fx::add(
        &fx::from_int((player::ovr(&s.bench[pick]) as u64)),
        &player::cond_adj(&s.bench[pick]),
    );
    if (fx::lt(&cand_v, &fx::sub(&out_v, &fx::from_int(4)))) return;

    let going_off = player::num(&s.xi[out].p);
    let coming = s.bench.remove(pick);
    let num = player::num(&coming);
    *(&mut s.xi[out]) = OnPitch { p: coming, since: minute, yellows: 0 };
    s.subs = s.subs + 1;
    events.push_back(Event {
        minute: (minute as u8), side: if (home) HOME else AWAY, kind: SUB, who: num, other: going_off,
    });
}
