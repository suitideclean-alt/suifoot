/// What it costs to be in the league, and what not paying costs.
///
/// The cases that matter are the ones where somebody has a reason to cheat: paying less, paying
/// for somebody else's club, paying twice, taking a club back from somebody who is not behind,
/// and - the one that would have been easy to miss - getting a club back with a deed from before
/// it was taken away.
#[test_only]
module suifoot::entry_tests;

use sui::coin;
use sui::test_scenario as ts;
use suifoot::club::{Self, Club};
use suifoot::deed;
use suifoot::entry;
use suifoot::league::{Self, League};
use suifoot::market;
use suifoot::sfoot::{Self, Treasury, SFOOT};
use suifoot::world;

const ADMIN: address = @0xAD;
const OWNER: address = @0xA11CE;
const OTHER: address = @0xB0B;
const FEE: u64 = 5_000_000;
const DAY: u64 = 86400000;
const T0: u64 = 1800000000000 / DAY * DAY;

/// a league that charges FEE, due after matchday 3, with one club taken by OWNER in its first week
fun setup(sc: &mut ts::Scenario): (League, Club) {
    let mut l = league::new(T0, vector[12 * 60, 20 * 60], 34, sc.ctx());
    league::set_entry(&mut l, FEE, 3, sc.ctx());
    let mut c = world::new_club(1, 3, 0, 77, object::id(&l), sc.ctx());
    let t = market::ticket_for_testing(object::id(&c), sc.ctx());
    market::claim(t, &l, &mut c, sc.ctx());
    (l, c)
}

fun advance(l: &mut League, n: u64, ctx: &TxContext) {
    let mut i = 0;
    while (i < n) { league::advance(l, ctx); i = i + 1 };
}

fun fee(sc: &mut ts::Scenario, amount: u64): coin::Coin<SFOOT> { coin::mint_for_testing<SFOOT>(amount, sc.ctx()) }

#[test]
fun paying_puts_the_fee_in_the_treasury_and_settles_the_season() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, mut c) = setup(&mut sc);
    assert!(entry::owes(&l, &c), 0);

    let coin = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());

    assert!(!entry::owes(&l, &c), 1);
    assert!(club::paid_for(&c) == league::season(&l), 2);
    assert!(sfoot::kept(&t) + sfoot::pool(&t) == FEE, 3);
    ts::return_shared(t);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

#[test, expected_failure(abort_code = entry::EWrongAmount)]
fun paying_less_is_refused() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, mut c) = setup(&mut sc);
    let coin = fee(&mut sc, FEE - 1);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::EWrongAmount)]
fun paying_more_is_refused_too() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, mut c) = setup(&mut sc);
    let coin = fee(&mut sc, FEE + 1);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::ENotOwner)]
fun somebody_else_cannot_pay_for_the_club() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, mut c) = setup(&mut sc);
    sc.next_tx(OTHER);
    let coin = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::EPaid)]
fun a_season_is_not_paid_twice() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, mut c) = setup(&mut sc);
    let a = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, a, sc.ctx());
    let b = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, b, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::EOtherLeague)]
fun a_club_from_another_league_cannot_be_paid_for_here() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (l, _c) = setup(&mut sc);
    let mut stranger = world::new_club(9, 3, 0, 77, object::id_from_address(@0xDEAD), sc.ctx());
    club::set_owner(&mut stranger, option::some(OWNER));
    let coin = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut stranger, coin, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::ENoFee)]
fun a_league_that_charges_nothing_takes_nothing() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (mut l, mut c) = setup(&mut sc);
    league::set_entry(&mut l, 0, 3, sc.ctx());
    assert!(!entry::owes(&l, &c), 0);
    let coin = fee(&mut sc, 1);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = entry::ETooSoon)]
fun a_club_cannot_be_taken_back_while_there_is_still_time() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let (mut l, mut c) = setup(&mut sc);
    advance(&mut l, 2, sc.ctx()); // matchday 3: the last day to pay
    sc.next_tx(OTHER);
    entry::reclaim(&mut l, &mut c, sc.ctx());
    abort 0
}

#[test]
fun after_the_deadline_anybody_can_take_an_unpaid_club_back() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let (mut l, mut c) = setup(&mut sc);
    advance(&mut l, 5, sc.ctx());   // well past matchday 3, and past the newcomer's grace
    let before = club::tenure(&c);
    let squad = club::squad_size(&c);

    sc.next_tx(OTHER);              // not the owner, not the admin: anybody
    entry::reclaim(&mut l, &mut c, sc.ctx());

    assert!(club::is_free(&c), 0);
    assert!(club::owner(&c).is_none() && club::coach(&c).is_none(), 1);
    assert!(club::tenure(&c) == before + 1, 2);
    assert!(club::squad_size(&c) == squad, 3);                 // the club is not stripped
    assert!(league::free_at_foot(&l) == 1, 4);                 // and is on the newcomers' list
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

#[test, expected_failure(abort_code = entry::ENothingOwed)]
fun a_club_that_paid_cannot_be_taken_back() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (mut l, mut c) = setup(&mut sc);
    let coin = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    advance(&mut l, 20, sc.ctx());
    sc.next_tx(OTHER);
    entry::reclaim(&mut l, &mut c, sc.ctx());
    abort 0
}

/// The one that would have been easy to miss. A deed is the proof of owning a club, and a deed does
/// not expire by itself: whoever lost the club for not paying still holds one. If it still worked,
/// losing a club would cost nothing - walk back in the same afternoon, for free.
#[test, expected_failure(abort_code = deed::EStale)]
fun the_old_owner_cannot_walk_back_in_with_the_old_deed() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let (mut l, mut c) = setup(&mut sc);
    sc.next_tx(OWNER);
    let old = sc.take_from_sender<deed::ClubDeed>();
    advance(&mut l, 5, sc.ctx());
    entry::reclaim(&mut l, &mut c, sc.ctx());
    assert!(club::is_free(&c), 0);

    deed::present(&old, &mut c, sc.ctx()); // the club is nobody's - and still not his
    abort 0
}

/// ...and the same deed works while the keeping it was cut for is still going.
#[test]
fun a_deed_still_works_while_its_keeping_lasts() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let (l, mut c) = setup(&mut sc);
    sc.next_tx(OWNER);
    let d = sc.take_from_sender<deed::ClubDeed>();
    assert!(deed::tenure(&d) == club::tenure(&c), 0);
    deed::present(&d, &mut c, sc.ctx());
    assert!(club::runs_it(&c, OWNER), 1);
    sc.return_to_sender(d);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

/// A new owner is not evicted for a fee that fell due before he arrived.
#[test, expected_failure(abort_code = entry::ETooSoon)]
fun a_newcomer_after_the_deadline_is_given_time_to_pay() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut l = league::new(T0, vector[12 * 60, 20 * 60], 34, sc.ctx());
    league::set_entry(&mut l, FEE, 3, sc.ctx());
    let mut c = world::new_club(1, 3, 0, 77, object::id(&l), sc.ctx());
    advance(&mut l, 9, sc.ctx());   // matchday 10, long after the deadline
    let t = market::ticket_for_testing(object::id(&c), sc.ctx());
    market::claim(t, &l, &mut c, sc.ctx());
    sc.next_tx(OTHER);
    entry::reclaim(&mut l, &mut c, sc.ctx()); // the very same matchday
    abort 0
}

/// ...but only a moment. The grace is not a way never to pay.
#[test]
fun the_grace_for_a_newcomer_runs_out() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut l = league::new(T0, vector[12 * 60, 20 * 60], 34, sc.ctx());
    league::set_entry(&mut l, FEE, 3, sc.ctx());
    let mut c = world::new_club(1, 3, 0, 77, object::id(&l), sc.ctx());
    advance(&mut l, 9, sc.ctx());
    let t = market::ticket_for_testing(object::id(&c), sc.ctx());
    market::claim(t, &l, &mut c, sc.ctx());
    assert!(entry::deadline(&l, &c) == 12, 0);
    advance(&mut l, 3, sc.ctx());   // matchday 13
    sc.next_tx(OTHER);
    entry::reclaim(&mut l, &mut c, sc.ctx());
    assert!(club::is_free(&c), 1);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

/// A season's fee is owed again each season, without anybody having to reset anything.
#[test]
fun the_fee_falls_due_again_every_season() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut t = sc.take_shared<Treasury>();
    let (mut l, mut c) = setup(&mut sc);
    let coin = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, coin, sc.ctx());
    assert!(!entry::owes(&l, &c), 0);

    advance(&mut l, 34, sc.ctx());  // the calendar runs out
    league::next_season(&mut l, sc.ctx());
    assert!(league::season(&l) == 2, 1);
    assert!(entry::owes(&l, &c), 2);        // paid for last year is not paid for this one

    let again = fee(&mut sc, FEE);
    entry::pay(&mut t, &l, &mut c, again, sc.ctx());
    assert!(!entry::owes(&l, &c), 3);
    assert!(sfoot::kept(&t) + sfoot::pool(&t) == 2 * FEE, 4);
    ts::return_shared(t);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

/// A club above the foot is not drawn by newcomers; it goes back on sale on the usual terms.
#[test]
fun a_club_above_the_foot_is_not_put_on_the_newcomers_list() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let mut l = league::new(T0, vector[12 * 60, 20 * 60], 34, sc.ctx());
    league::set_entry(&mut l, FEE, 3, sc.ctx());
    let mut c = world::new_club(1, 1, 0, 77, object::id(&l), sc.ctx()); // level 1, not the foot
    club::set_owner(&mut c, option::some(OWNER));
    club::set_coach(&mut c, option::some(OWNER));
    advance(&mut l, 5, sc.ctx());
    entry::reclaim(&mut l, &mut c, sc.ctx());
    assert!(club::is_free(&c), 0);
    assert!(league::free_at_foot(&l) == 0, 1);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

/// Whoever was running the team for the owner goes when the club does.
#[test]
fun a_hired_coach_goes_with_the_club() {
    let mut sc = ts::begin(OWNER);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(OWNER);
    let (mut l, mut c) = setup(&mut sc);
    club::set_coach(&mut c, option::some(OTHER));
    club::set_job(&mut c, option::some(club::new_job(1000, 34, 0, 1, true)));
    advance(&mut l, 5, sc.ctx());
    entry::reclaim(&mut l, &mut c, sc.ctx());
    assert!(club::job(&c).is_none(), 0);
    assert!(club::coach(&c).is_none(), 1);
    assert!(!club::runs_it(&c, OTHER), 2);
    club::destroy_for_testing(c); league::destroy_for_testing(l);
    sc.end();
}

/// Only the league's own address may set the price.
#[test, expected_failure(abort_code = league::ENotAdmin)]
fun an_owner_cannot_set_his_own_price() {
    let mut sc = ts::begin(ADMIN);
    let mut l = league::new(T0, vector[12 * 60, 20 * 60], 34, sc.ctx());
    sc.next_tx(OWNER);
    league::set_entry(&mut l, 0, 3, sc.ctx());
    abort 0
}
