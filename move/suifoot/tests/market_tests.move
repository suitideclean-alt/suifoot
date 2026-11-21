/// Who may have a club, and on what terms.
#[test_only]
module suifoot::market_tests;

use suifoot::club::{Self, Club};
use suifoot::league;
use suifoot::market;
use suifoot::world;

const DAY: u64 = 86400000;
const T0: u64 = 1800000000000 / DAY * DAY;

fun a_league(ctx: &mut TxContext): league::League {
    league::new(T0, vector[12 * 60, 20 * 60], 34, ctx)
}

/// a club that finished where it is told to have finished
fun club_that_finished(num: u32, level: u8, pos: u8, ctx: &mut TxContext): Club {
    let mut c = world::new_club(num, level, 0, 1234, ctx);
    club::new_season(&mut c, pos);
    c
}

#[test]
fun a_ticket_names_one_club_and_that_club_becomes_yours() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = world::new_club(1, 3, 0, 77, &mut ctx);
    assert!(club::is_free(&c), 0);

    let t = market::ticket_for_testing(object::id(&c), &mut ctx);
    market::claim(t, &l, &mut c, &mut ctx);

    assert!(!club::is_free(&c), 1);
    assert!(club::runs_it(&c, me), 2);
    assert!(club::owner(&c) == option::some(me), 3);

    club::destroy_for_testing(c);
    league::destroy_for_testing(l);
}

#[test, expected_failure(abort_code = market::EWrongClub)]
fun a_ticket_cannot_be_turned_in_against_a_different_club() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let drawn = world::new_club(1, 3, 0, 77, &mut ctx);
    let mut nicer = world::new_club(2, 3, 0, 88, &mut ctx);

    let t = market::ticket_for_testing(object::id(&drawn), &mut ctx);
    market::claim(t, &l, &mut nicer, &mut ctx); // the one that was drawn is not the one handed over
    abort 0
}

#[test, expected_failure(abort_code = market::ETaken)]
fun a_club_somebody_already_runs_cannot_be_taken() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = world::new_club(1, 3, 0, 77, &mut ctx);
    club::set_coach(&mut c, option::some(me));

    let t = market::ticket_for_testing(object::id(&c), &mut ctx);
    market::claim(t, &l, &mut c, &mut ctx);
    abort 0
}

#[test, expected_failure(abort_code = market::ETopNotForSale)]
fun the_top_division_is_not_for_sale_however_badly_it_finished() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let mut bottom_of_the_top = club_that_finished(1, 0, 12, &mut ctx); // dead last in the first division
    market::buy(&mut l, &mut bottom_of_the_top, &mut ctx);
    abort 0
}

#[test, expected_failure(abort_code = market::ETooHigh)]
fun a_club_that_finished_in_the_top_half_is_not_for_sale() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let mut sixth = club_that_finished(1, 2, 6, &mut ctx); // a series of twelve: the sixth is the last of the top half
    market::buy(&mut l, &mut ninth, &mut ctx);
    abort 0
}

#[test]
fun a_club_that_finished_in_the_bottom_half_is() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let mut l = a_league(&mut ctx);
    let mut seventh = club_that_finished(1, 2, 7, &mut ctx); // and the seventh the first of the bottom
    market::buy(&mut l, &mut tenth, &mut ctx);
    assert!(club::runs_it(&seventh, me), 0);

    let mut last = club_that_finished(2, 1, 12, &mut ctx);
    market::buy(&mut l, &mut last, &mut ctx);
    assert!(club::runs_it(&last, me), 1);

    club::destroy_for_testing(seventh);
    club::destroy_for_testing(last);
    league::destroy_for_testing(l);
}

#[test, expected_failure(abort_code = market::ETooHigh)]
fun in_a_leagues_first_season_nothing_is_for_sale_at_all() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    // never finished a season, so there is nothing to judge it on and it counts as mid-table
    let mut brand_new = world::new_club(1, 2, 0, 99, &mut ctx);
    assert!(club::last_pos(&brand_new) == 0, 0);
    market::buy(&mut l, &mut brand_new, &mut ctx);
    abort 0
}

#[test]
fun the_free_list_holds_only_the_foot_and_shrinks_as_clubs_are_taken() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    assert!(league::free_at_foot(&l) == 0, 0);

    let a = world::new_club(1, 3, 0, 1, &mut ctx);
    let b = world::new_club(2, 3, 0, 2, &mut ctx);
    league::register_free(&mut l, object::id(&a), 0);
    league::register_free(&mut l, object::id(&b), 0);
    league::register_free(&mut l, object::id(&a), 0); // the same club twice is still one club
    assert!(league::free_at_foot(&l) == 2, 1);

    league::forget_free(&mut l, &object::id(&a));
    assert!(league::free_at_foot(&l) == 1, 2);
    assert!(league::free_at(&l, 0) == object::id(&b), 3);

    club::destroy_for_testing(a);
    club::destroy_for_testing(b);
    league::destroy_for_testing(l);
}

#[test]
fun a_club_taken_once_the_season_is_under_way_owes_nothing_for_it() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    league::advance(&mut l, &ctx); // the season has moved on
    assert!(league::week(&l) == 2, 0);

    let mut c = club_that_finished(1, 2, 10, &mut ctx);
    club::set_entry_paid(&mut c, true);
    market::buy(&mut l, &mut c, &mut ctx);
    assert!(!club::entry_paid(&c), 1); // nothing paid in, so nothing to be drawn out

    club::destroy_for_testing(c);
    league::destroy_for_testing(l);
}
