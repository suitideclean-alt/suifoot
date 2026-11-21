/// The deed, and what holding one lets you do.
#[test_only]
module suifoot::deed_tests;

use suifoot::club::{Self, Club};
use suifoot::deed;
use suifoot::world;

fun a_club(num: u32, ctx: &mut TxContext): Club { world::new_club(num, 3, 0, 77, ctx) }

#[test]
fun a_deed_names_one_club_and_carries_what_a_wallet_needs() {
    let mut ctx = tx_context::dummy();
    let c = a_club(7, &mut ctx);
    let d = deed::issue_for_testing(&c, 3, &mut ctx);

    assert!(deed::club(&d) == object::id(&c), 0);
    assert!(deed::club_num(&d) == 7, 1);
    assert!(deed::name(&d) == club::name(&c), 2);  // the badge and the name follow the number
    assert!(deed::level(&d) == 3, 3);
    assert!(deed::since(&d) == 3, 4);

    deed::destroy_for_testing(d);
    club::destroy_for_testing(c);
}

#[test]
fun presenting_it_makes_you_the_one_who_runs_the_club() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let mut c = a_club(7, &mut ctx);
    let d = deed::issue_for_testing(&c, 1, &mut ctx);
    assert!(club::is_free(&c), 0);

    deed::present(&d, &mut c, &ctx);
    assert!(club::runs_it(&c, me), 1);
    assert!(club::owner(&c) == option::some(me), 2);

    // and again changes nothing, which is what a new holder does after a sale
    deed::present(&d, &mut c, &ctx);
    assert!(club::runs_it(&c, me), 3);

    deed::destroy_for_testing(d);
    club::destroy_for_testing(c);
}

#[test, expected_failure(abort_code = deed::EWrongClub)]
fun a_deed_is_no_use_against_another_club() {
    let mut ctx = tx_context::dummy();
    let mine = a_club(7, &mut ctx);
    let mut yours = a_club(8, &mut ctx);
    let d = deed::issue_for_testing(&mine, 1, &mut ctx);
    deed::present(&d, &mut yours, &ctx);
    abort 0
}

#[test, expected_failure(abort_code = deed::ETaken)]
fun a_deed_cannot_be_used_to_walk_in_on_a_going_concern() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(7, &mut ctx);
    club::set_owner(&mut c, option::some(@0xBEEF)); // somebody else already runs it
    let d = deed::issue_for_testing(&c, 1, &mut ctx);
    deed::present(&d, &mut c, &ctx);
    abort 0
}

#[test]
fun giving_up_destroys_the_deed_and_frees_the_club() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(7, &mut ctx);
    let d = deed::issue_for_testing(&c, 1, &mut ctx);
    deed::present(&d, &mut c, &ctx);
    assert!(!club::is_free(&c), 0);

    deed::give_up(d, &mut c, &ctx);
    assert!(club::is_free(&c), 1); // and somebody else may have it now
    club::destroy_for_testing(c);
}

#[test, expected_failure(abort_code = deed::ETaken)]
fun you_cannot_give_up_a_club_that_is_not_yours() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(7, &mut ctx);
    club::set_owner(&mut c, option::some(@0xBEEF));
    club::set_coach(&mut c, option::some(@0xBEEF));
    let d = deed::issue_for_testing(&c, 1, &mut ctx);
    deed::give_up(d, &mut c, &ctx);
    abort 0
}

#[test]
fun taking_a_club_cuts_a_deed_for_it() {
    use suifoot::league;
    use suifoot::market;
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = league::new(1795046400000, vector[720, 1200], 34, &mut ctx);
    let mut c = a_club(7, &mut ctx);

    let t = market::ticket_for_testing(object::id(&c), &mut ctx);
    market::claim(t, &l, &mut c, &mut ctx);

    assert!(club::runs_it(&c, me), 0);
    // the deed went to the person who took it; the club knows who that is
    assert!(club::owner(&c) == option::some(me), 1);

    club::destroy_for_testing(c);
    league::destroy_for_testing(l);
}
