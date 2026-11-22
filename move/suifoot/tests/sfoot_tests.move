/// What a coin has to be true about itself before anybody is asked to want one.
#[test_only]
module suifoot::sfoot_tests;

use sui::coin;
use sui::test_scenario as ts;
use suifoot::sfoot::{Self, Treasury, SFOOT};

const ME: address = @0xA11CE;

/// Nothing exists until somebody pays for it. A coin that starts with a pile already in somebody's
/// hands starts with a question about whose hands.
#[test]
fun it_starts_at_nothing() {
    let mut sc = ts::begin(ME);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(ME);
    let t = sc.take_shared<Treasury>();
    assert!(sfoot::minted(&t) == 0, 0);
    assert!(sfoot::kept(&t) == 0, 1);
    assert!(sfoot::pool(&t) == 0, 2);
    ts::return_shared(t);
    sc.end();
}

/// Money is split where it lands: what the project keeps and what is waiting to be won are
/// different money from the moment they arrive, rather than one pile to be divided later.
#[test]
fun what_comes_in_is_split_as_it_arrives() {
    let mut sc = ts::begin(ME);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(ME);
    let mut t = sc.take_shared<Treasury>();

    let paid = coin::mint_for_testing<SFOOT>(1_000_000, sc.ctx());
    sfoot::take(&mut t, paid, b"entry", sc.ctx());

    assert!(sfoot::kept(&t) == 200_000, 0);   // a fifth
    assert!(sfoot::pool(&t) == 800_000, 1);   // and the rest to be won back
    ts::return_shared(t);
    sc.end();
}

/// Twice over, because a split that is right once and wrong on the second payment is worse than
/// one that is always wrong.
#[test]
fun it_keeps_splitting_the_same_way() {
    let mut sc = ts::begin(ME);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(ME);
    let mut t = sc.take_shared<Treasury>();

    sfoot::take(&mut t, coin::mint_for_testing<SFOOT>(500_000, sc.ctx()), b"entry", sc.ctx());
    sfoot::take(&mut t, coin::mint_for_testing<SFOOT>(500_000, sc.ctx()), b"entry", sc.ctx());
    assert!(sfoot::kept(&t) == 200_000, 0);
    assert!(sfoot::pool(&t) == 800_000, 1);
    ts::return_shared(t);
    sc.end();
}

/// Nothing is not an amount.
#[test, expected_failure(abort_code = sfoot::ENothing)]
fun nothing_is_not_a_payment() {
    let mut sc = ts::begin(ME);
    sfoot::init_for_test(sc.ctx());
    sc.next_tx(ME);
    let mut t = sc.take_shared<Treasury>();
    sfoot::take(&mut t, coin::zero<SFOOT>(sc.ctx()), b"entry", sc.ctx());
    abort 0
}

/* The property this module exists for cannot be written as a test, so it is written here instead.
 *
 * Nobody can mint SFOOT by hand. Not the author, not whoever published the package, not whoever
 * holds any key at all - because there is no function anywhere in this module that returns the
 * TreasuryCap or mints through it. A test can only try the doors that exist; what matters here is
 * that the door does not. Anybody doubting it should search this package for `cap` and find that
 * it is written once, at publication, and read never.
 *
 * If a minting function is ever added, this comment is the thing that should stop whoever adds it,
 * or be deleted honestly along with the claim.
 */
