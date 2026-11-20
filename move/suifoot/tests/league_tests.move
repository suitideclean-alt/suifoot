/// The clock the whole world shares, and a matchday played from end to end: seal, show, whistle.
#[test_only]
module suifoot::league_tests;

use sui::clock;
use std::string;
use suifoot::club::{Self, Club};
use suifoot::league;
use suifoot::lineup;
use suifoot::player::{Self, Player};

const DAY: u64 = 86400000;
const MIN: u64 = 60000;
const H: u64 = 3600000;

/// a Monday midnight UTC, far enough from anything to be unambiguous
const T0: u64 = 1800000000000 / DAY * DAY;

fun man(num: u32, pos: u8, ovr: u16): Player { player::new(num, pos, player::pro(), 25, ovr, ovr, 1000, 52) }

fun squad_of(base: u32, strength: u16, ctx: &mut TxContext): Club {
    let mut c = club::new(base, string::utf8(b"Test"), 3, 0, 100000, ctx);
    club::add_player(&mut c, man(base + 1, player::gk(), strength));
    let mut i = 0;
    while (i < 5) { club::add_player(&mut c, man(base + 2 + i, player::df(), strength - 2)); i = i + 1; };
    let mut j = 0;
    while (j < 6) { club::add_player(&mut c, man(base + 7 + j, player::mf(), strength - 3)); j = j + 1; };
    let mut k = 0;
    while (k < 4) { club::add_player(&mut c, man(base + 13 + k, player::fw(), strength - 1)); k = k + 1; };
    c
}

fun a_league(ctx: &mut TxContext): league::League {
    league::new(T0, vector[12 * 60, 20 * 60], 34, ctx)
}

#[test]
fun two_matchdays_a_day_at_noon_and_at_eight() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    assert!(league::kickoff_at(&l, 1) == T0 + 12 * H, 0);
    assert!(league::kickoff_at(&l, 2) == T0 + 20 * H, 1);
    assert!(league::kickoff_at(&l, 3) == T0 + DAY + 12 * H, 2);
    assert!(league::kickoff_at(&l, 4) == T0 + DAY + 20 * H, 3);
    assert!(league::kickoff_at(&l, 11) == T0 + 5 * DAY + 12 * H, 4);
    // a season of thirty-four matchdays at two a day is seventeen days
    assert!(league::kickoff_at(&l, 34) == T0 + 16 * DAY + 20 * H, 5);
    league::destroy_for_testing(l);
}

#[test]
fun the_three_moments_of_a_matchday() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let whistle = league::kickoff_at(&l, 1);
    assert!(league::lock_at(&l, 1) == whistle - 30 * MIN, 0);
    assert!(league::draw_at(&l, 1) == whistle - 15 * MIN, 1);

    assert!(league::phase_at(&l, 1, T0) == league::open(), 2);
    assert!(league::phase_at(&l, 1, whistle - 31 * MIN) == league::open(), 3);
    assert!(league::phase_at(&l, 1, whistle - 30 * MIN) == league::locked(), 4);
    assert!(league::phase_at(&l, 1, whistle - 16 * MIN) == league::locked(), 5);
    assert!(league::phase_at(&l, 1, whistle - 15 * MIN) == league::drawn(), 6);
    assert!(league::phase_at(&l, 1, whistle - 1) == league::drawn(), 7);
    assert!(league::phase_at(&l, 1, whistle) == league::played(), 8);
    league::destroy_for_testing(l);
}

#[test]
fun seal_then_show_then_play() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = squad_of(100, 60, &mut ctx);
    club::set_coach(&mut c, option::some(me));

    let mut clk = clock::create_for_testing(&mut ctx);
    let whistle = league::kickoff_at(&l, 1);

    // long before: the seal goes up and nothing else
    clock::set_for_testing(&mut clk, whistle - 2 * H);
    let xi = vector[101u32, 102, 103, 104, 105, 107, 108, 109, 110, 113, 114];
    let bench = vector[106u32, 111, 112, 115, 116];
    let l_obj = lineup::new(xi, bench, lineup::bal());
    league::commit(&l, &mut c, 1, lineup::seal_of(&l_obj, 42), &clk, &ctx);
    assert!(club::has_sealed(&c, 1), 0);
    assert!(!club::has_revealed(&c, 1), 1);

    // inside the window: the lineup is shown and checked against the seal
    clock::set_for_testing(&mut clk, whistle - 20 * MIN);
    league::reveal(&l, &mut c, 1, xi, bench, lineup::bal(), 42, &clk, &ctx);
    assert!(club::has_revealed(&c, 1), 2);

    clock::destroy_for_testing(clk);
    club::destroy_for_testing(c);
    league::destroy_for_testing(l);
}

#[test, expected_failure(abort_code = league::ETooLate)]
fun a_seal_after_the_deadline_is_refused() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = squad_of(100, 60, &mut ctx);
    club::set_coach(&mut c, option::some(me));
    let mut clk = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clk, league::kickoff_at(&l, 1) - 29 * MIN);
    league::commit(&l, &mut c, 1, b"0000000000000000000000000000000x", &clk, &ctx);
    abort 0
}

#[test, expected_failure(abort_code = club::ESealMismatch)]
fun showing_a_lineup_that_is_not_the_sealed_one_is_refused() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = squad_of(100, 60, &mut ctx);
    club::set_coach(&mut c, option::some(me));
    let mut clk = clock::create_for_testing(&mut ctx);
    let whistle = league::kickoff_at(&l, 1);

    let xi = vector[101u32, 102, 103, 104, 105, 107, 108, 109, 110, 113, 114];
    let bench = vector[106u32, 111, 112, 115, 116];
    clock::set_for_testing(&mut clk, whistle - 2 * H);
    league::commit(&l, &mut c, 1, lineup::seal_of(&lineup::new(xi, bench, lineup::bal()), 42), &clk, &ctx);

    // the same eleven, but now set up to attack: a different seal, so it cannot be slipped through
    clock::set_for_testing(&mut clk, whistle - 20 * MIN);
    league::reveal(&l, &mut c, 1, xi, bench, lineup::att(), 42, &clk, &ctx);
    abort 0
}

#[test]
fun a_fixture_fills_in_both_tables() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut home = squad_of(100, 60, &mut ctx);
    let mut away = squad_of(200, 52, &mut ctx);

    let (hg, ag) = league::play_for_testing(&l, &mut home, &mut away, 12345);
    assert!(club::played(&home) == 1 && club::played(&away) == 1, 0);
    assert!(club::goals_for(&home) == (hg as u16), 1);
    assert!(club::goals_against(&home) == (ag as u16), 2);
    assert!(club::goals_for(&away) == (ag as u16), 3);
    assert!(club::last_week(&home) == 1 && club::last_week(&away) == 1, 4);

    // three for a win, one each for a draw
    if (hg > ag) { assert!(club::points(&home) == 3 && club::points(&away) == 0, 5) }
    else if (hg == ag) { assert!(club::points(&home) == 1 && club::points(&away) == 1, 6) }
    else { assert!(club::points(&home) == 0 && club::points(&away) == 3, 7) };

    club::destroy_for_testing(home);
    club::destroy_for_testing(away);
    league::destroy_for_testing(l);
}

#[test]
fun a_club_that_never_sealed_anything_still_puts_a_team_out() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut home = squad_of(100, 60, &mut ctx);
    let mut away = squad_of(200, 60, &mut ctx);
    // neither has ever shown a lineup, and the match is played all the same
    let (hg, ag) = league::play_for_testing(&l, &mut home, &mut away, 999);
    assert!((hg as u64) + (ag as u64) < 30, 0); // a real score, not a walkover
    assert!(club::played(&home) == 1, 1);
    club::destroy_for_testing(home);
    club::destroy_for_testing(away);
    league::destroy_for_testing(l);
}

#[test]
fun the_stronger_side_wins_far_more_often_over_a_hundred_games
() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut strong_wins = 0;
    let mut weak_wins = 0;
    let mut seed = 1u32;
    while (seed <= 100) {
        let mut home = squad_of(100, 72, &mut ctx);
        let mut away = squad_of(200, 48, &mut ctx);
        let (hg, ag) = league::play_for_testing(&l, &mut home, &mut away, seed);
        if (hg > ag) strong_wins = strong_wins + 1;
        if (ag > hg) weak_wins = weak_wins + 1;
        club::destroy_for_testing(home);
        club::destroy_for_testing(away);
        seed = seed + 1;
    };
    assert!(strong_wins > weak_wins * 3, strong_wins); // football, but not a coin toss
    league::destroy_for_testing(l);
}
