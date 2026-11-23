/// A club's books: who turns up, what they pay, and what the week costs.
#[test_only]
module suifoot::money_tests;

use suifoot::club::{Self, Club};
use suifoot::money;
use suifoot::world;

/// A league id for clubs in tests that are not about which league they play in.
fun test_league(): ID { object::id_from_address(@0x1EA6DE) }


fun a_club(level: u8, ctx: &mut TxContext): Club { world::new_club(1, level, 0, 4242, test_league(), ctx) }

#[test]
fun a_ground_never_holds_more_than_it_holds() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(3, &mut ctx);
    club::set_fans(&mut c, 1000000); // the whole country decides to follow them
    assert!(money::attendance(&c) == (club::capacity(&c) as u64), 0);
    club::destroy_for_testing(c);
}

#[test]
fun charging_more_empties_the_ground() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(2, &mut ctx);
    club::set_fans(&mut c, 4000); // room to move, so the ground is not simply full either way
    let at_the_usual = money::attendance(&c);

    let dearer_price = club::ticket_cents(&c) * 2;
    club::set_ticket_cents(&mut c, dearer_price);
    let at_double = money::attendance(&c);
    assert!(at_double < at_the_usual, 0);

    club::set_ticket_cents(&mut c, 95);
    let at_half = money::attendance(&c);
    assert!(at_half > at_the_usual, 1);
    club::destroy_for_testing(c);
}

#[test]
fun doubling_the_price_does_not_double_the_gate() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(2, &mut ctx);
    club::set_fans(&mut c, 4000);
    let plain = money::gate(&c, false);
    let dearer_price = club::ticket_cents(&c) * 2;
    club::set_ticket_cents(&mut c, dearer_price);
    let dearer = money::gate(&c, false);
    // it may be more or less, but it is nowhere near twice: emptier seats eat the rise
    assert!(dearer < plain * 2, 0);
    club::destroy_for_testing(c);
}

#[test]
fun a_derby_is_worth_a_third_again() {
    let mut ctx = tx_context::dummy();
    let c = a_club(2, &mut ctx);
    let plain = money::gate(&c, false);
    let derby = money::gate(&c, true);
    assert!(derby == plain * 130 / 100, 0);
    club::destroy_for_testing(c);
}

#[test]
fun winning_brings_people_through_the_gate() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(2, &mut ctx);
    club::set_fans(&mut c, 4000);
    let before_a_ball_is_kicked = money::attendance(&c);

    let mut i = 0;
    while (i < 10) { club::record(&mut c, 2, 0); i = i + 1; }; // ten straight wins
    let winning = money::attendance(&c);
    assert!(winning > before_a_ball_is_kicked, 0);

    let mut d = a_club(2, &mut ctx);
    club::set_fans(&mut d, 4000);
    let mut j = 0;
    while (j < 10) { club::record(&mut d, 0, 2); j = j + 1; }; // ten straight defeats
    assert!(money::attendance(&d) < before_a_ball_is_kicked, 1);

    club::destroy_for_testing(c);
    club::destroy_for_testing(d);
}

#[test]
fun the_first_division_earns_more_than_the_fourth() {
    let mut ctx = tx_context::dummy();
    let top = world::new_club(1, 0, 0, 7, test_league(), &mut ctx);
    let bottom = world::new_club(2, 3, 0, 7, test_league(), &mut ctx);
    assert!(money::television(&top) > money::television(&bottom), 0);
    assert!(money::sponsorship(&top) > money::sponsorship(&bottom), 1);
    assert!(money::gate(&top, false) > money::gate(&bottom, false), 2);
    // and it costs more to run, too
    assert!(money::upkeep(&top) > money::upkeep(&bottom), 3);
    club::destroy_for_testing(top);
    club::destroy_for_testing(bottom);
}

#[test]
fun a_week_moves_money_both_ways() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(2, &mut ctx);
    let before = club::balance(&c);
    let earned = money::incomings(&c);
    let owed = money::outgoings(&c);
    money::settle_week(&mut c);
    assert!(club::balance(&c) == before + earned - owed, 0);
    club::destroy_for_testing(c);
}

#[test]
fun a_club_with_nothing_is_taken_to_nothing_and_no_further() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(0, &mut ctx); // a first-division wage bill
    let everything = club::balance(&c);
    club::debit(&mut c, everything); // and not a penny
    assert!(club::balance(&c) == 0, 0);

    money::settle_week(&mut c);
    assert!(club::balance(&c) == 0, 1); // it owes nobody what nobody could collect
    club::destroy_for_testing(c);
}

#[test]
fun the_gate_goes_to_the_club_at_home() {
    let mut ctx = tx_context::dummy();
    let mut c = a_club(1, &mut ctx);
    let before = club::balance(&c);
    let expected = money::gate(&c, false);
    money::collect_gate(&mut c, false);
    assert!(club::balance(&c) == before + expected, 0);
    assert!(expected > 0, 1);
    club::destroy_for_testing(c);
}
