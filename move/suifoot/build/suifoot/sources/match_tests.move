/// Eighteen men a side, written out by hand, and four seeds. Every number here came from playing
/// the same match in JavaScript with whole-number arithmetic, and that JavaScript was itself played
/// twenty thousand times against the real browser engine to show it plays the same football.
///
/// This is the test that matters most in the whole package. If it passes, a match played inside the
/// contract is the match the browser would have played, and either can check the other.
#[test_only]
module suifoot::match_tests;

use suifoot::match_play::{Self as mp, Result};
use suifoot::player::{Self, Player};

fun man(num: u32, pos: u8, ovr: u16, cond: u8, mood: u8, tp: u8): Player {
    let mut p = player::new(num, pos, tp, 25, ovr, ovr, 1000, 52);
    player::set_cond(&mut p, cond);
    player::set_mood(&mut p, mood);
    p
}
fun ok(num: u32, pos: u8, ovr: u16): Player { man(num, pos, ovr, 100, 70, player::pro()) }

fun home_xi(): vector<Player> {
    vector[
        ok(1, player::gk(), 54),
        ok(2, player::df(), 51), ok(3, player::df(), 50), ok(4, player::df(), 48), ok(5, player::df(), 45),
        ok(6, player::mf(), 54), ok(7, player::mf(), 50), ok(8, player::mf(), 47), ok(9, player::mf(), 44),
        ok(10, player::fw(), 52), ok(11, player::fw(), 49),
    ]
}
fun home_bench(): vector<Player> {
    vector[
        ok(12, player::gk(), 46), ok(13, player::df(), 43), ok(14, player::df(), 42),
        ok(15, player::mf(), 45), ok(16, player::mf(), 41), ok(17, player::fw(), 47), ok(18, player::fw(), 40),
    ]
}
fun away_xi(): vector<Player> {
    vector[
        ok(21, player::gk(), 57),
        man(22, player::df(), 55, 90, 70, player::pro()), ok(23, player::df(), 53), ok(24, player::df(), 52), ok(25, player::df(), 49),
        ok(26, player::mf(), 58), ok(27, player::mf(), 55), man(28, player::mf(), 51, 80, 30, player::pro()), ok(29, player::mf(), 48),
        ok(30, player::fw(), 61), man(31, player::fw(), 56, 100, 70, player::hard()),
    ]
}
fun away_bench(): vector<Player> {
    vector[ok(32, player::gk(), 48), ok(33, player::df(), 46), ok(34, player::mf(), 50), ok(35, player::mf(), 44), ok(36, player::fw(), 52)]
}

fun play(seed: u32): Result {
    mp::play(home_xi(), home_bench(), 1, 0, away_xi(), away_bench(), 0, 4, seed)
}

fun tally(r: &Result, kind: u8): u64 {
    let ev = mp::events(r);
    let mut n = 0;
    let mut i = 0;
    while (i < ev.length()) { if (mp::ev_kind(&ev[i]) == kind) n = n + 1; i = i + 1; };
    n
}

#[test]
fun seed_one_is_two_one() {
    let r = play(1);
    assert!(mp::home_goals(&r) == 2 && mp::away_goals(&r) == 1, 0);
    assert!(mp::home_shots(&r) == 14 && mp::away_shots(&r) == 13, 1);
    assert!(mp::home_poss(&r) == 14 && mp::away_poss(&r) == 16, 2);
    assert!(tally(&r, mp::yellow()) == 5, 3);
    assert!(tally(&r, mp::red()) == 1, 4);
    assert!(tally(&r, mp::sub()) == 4, 5);
    assert!(mp::events(&r).length() == 24, 6);
}

#[test]
fun seed_forty_two_is_nil_three_and_every_event_in_it_matches() {
    let r = play(42);
    assert!(mp::home_goals(&r) == 0 && mp::away_goals(&r) == 3, 0);
    assert!(mp::home_shots(&r) == 6 && mp::away_shots(&r) == 7, 1);
    assert!(mp::home_poss(&r) == 9 && mp::away_poss(&r) == 9, 2);

    // minute, side, kind, who, other - the whole match, in order
    let want = vector[
        vector[3u64, 1, 0, 30, 0], vector[8, 1, 0, 26, 25], vector[9, 1, 1, 31, 1], vector[14, 1, 2, 29, 0],
        vector[33, 0, 1, 11, 21], vector[44, 0, 1, 3, 21], vector[51, 1, 1, 26, 1], vector[52, 1, 0, 28, 0],
        vector[58, 1, 2, 28, 0], vector[61, 0, 2, 10, 0], vector[62, 0, 5, 15, 9], vector[62, 1, 5, 34, 29],
        vector[71, 0, 3, 1, 0], vector[71, 1, 3, 21, 0], vector[74, 0, 5, 13, 5], vector[74, 1, 5, 33, 25],
        vector[76, 0, 1, 10, 0],
    ];
    let ev = mp::events(&r);
    assert!(ev.length() == want.length(), 3);
    let mut i = 0;
    while (i < want.length()) {
        let w = &want[i];
        let e = &ev[i];
        assert!((mp::ev_minute(e) as u64) == w[0], 100 + i * 10);
        assert!((mp::ev_side(e) as u64) == w[1], 101 + i * 10);
        assert!((mp::ev_kind(e) as u64) == w[2], 102 + i * 10);
        assert!((mp::ev_who(e) as u64) == w[3], 103 + i * 10);
        assert!((mp::ev_other(e) as u64) == w[4], 104 + i * 10);
        i = i + 1;
    };
}

#[test]
fun a_big_seed_and_another_both_land_where_they_should() {
    let r = play(123456789);
    assert!(mp::home_goals(&r) == 2 && mp::away_goals(&r) == 1, 0);
    assert!(mp::home_shots(&r) == 7 && mp::away_shots(&r) == 7, 1);
    assert!(tally(&r, mp::yellow()) == 4, 2);
    assert!(mp::events(&r).length() == 13, 3);

    let r2 = play(7777);
    assert!(mp::home_goals(&r2) == 2 && mp::away_goals(&r2) == 4, 10);
    assert!(mp::home_shots(&r2) == 6 && mp::away_shots(&r2) == 9, 11);
    assert!(mp::events(&r2).length() == 14, 12);
}

#[test]
fun the_same_seed_always_gives_the_same_match() {
    let a = play(1);
    let b = play(1);
    assert!(mp::home_goals(&a) == mp::home_goals(&b), 0);
    assert!(mp::away_goals(&a) == mp::away_goals(&b), 1);
    assert!(mp::events(&a).length() == mp::events(&b).length(), 2);
}

#[test]
fun a_different_seed_gives_a_different_match() {
    let a = play(1);
    let b = play(2);
    assert!(mp::home_goals(&a) != mp::home_goals(&b) || mp::away_goals(&a) != mp::away_goals(&b)
        || mp::events(&a).length() != mp::events(&b).length(), 0);
}

/// The chances written out at the top of the module have to be the chances the rules actually say.
/// Written-out numbers are the sort of thing that drifts quietly, so this holds each one against the
/// arithmetic it stands in for.
#[test]
fun the_written_out_chances_are_the_ones_the_rules_give() {
    use suifoot::fx;
    assert!(mp::attack_rate() == fx::raw(&fx::from_ratio(28, 100)), 0);
    assert!(mp::penalty_rate() == fx::raw(&fx::from_ratio(12, 1000)), 1);
    assert!(mp::shot_rate() == fx::raw(&fx::from_ratio(72, 100)), 2);
    assert!(mp::assist_rate() == fx::raw(&fx::from_ratio(70, 100)), 3);
    assert!(mp::tell_rate() == fx::raw(&fx::from_ratio(34, 100)), 4);
    assert!(mp::card_rate() == fx::raw(&fx::from_ratio(19, 1000)), 5);
    assert!(mp::red_rate() == fx::raw(&fx::from_ratio(5, 10000)), 6);
    assert!(mp::injury_rate() == fx::raw(&fx::from_ratio(6, 10000)), 7);
    assert!(mp::book_foul_rate() == fx::raw(&fx::from_ratio(35, 100)), 8);
}
