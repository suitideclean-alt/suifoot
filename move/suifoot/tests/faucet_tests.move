/// The tap for testnet SFOOT, and the ways of using it as a printing press.
#[test_only]
module suifoot::faucet_tests;

use sui::coin::Coin;
use sui::test_scenario as ts;
use suifoot::faucet::{Self, Faucet};
use suifoot::sfoot::{Self, Treasury, SFOOT};

const ADMIN: address = @0xAD;
const ANNA: address = @0xA11CE;
const BOB: address = @0xB0B;
const SHARE: u64 = 100_000_000;

fun begin(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    sfoot::init_for_test(sc.ctx());
    faucet::init_for_test(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

#[test, expected_failure(abort_code = faucet::EClosed)]
fun it_starts_closed() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    let mut t = sc.take_shared<Treasury>();
    sc.next_tx(ANNA);
    faucet::claim(&mut f, &mut t, sc.ctx());
    abort 0
}

#[test]
fun an_open_faucet_gives_each_address_its_share() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    let mut t = sc.take_shared<Treasury>();
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    sc.next_tx(ANNA);
    faucet::claim(&mut f, &mut t, sc.ctx());
    sc.next_tx(BOB);
    faucet::claim(&mut f, &mut t, sc.ctx());
    assert!(faucet::given(&f) == 2 * SHARE, 0);
    assert!(sfoot::minted(&t) == 2 * SHARE, 1);           // what it says it gave is what exists
    sc.next_tx(ANNA);
    let c = sc.take_from_sender<Coin<SFOOT>>();
    assert!(c.value() == SHARE, 2);
    sc.return_to_sender(c);
    ts::return_shared(f); ts::return_shared(t);
    sc.end();
}

#[test, expected_failure(abort_code = faucet::EAlready)]
fun an_address_gets_one_share_not_a_stream() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    let mut t = sc.take_shared<Treasury>();
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    sc.next_tx(ANNA);
    faucet::claim(&mut f, &mut t, sc.ctx());
    faucet::claim(&mut f, &mut t, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = faucet::EDry)]
fun the_ceiling_holds_however_many_addresses_ask() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    let mut t = sc.take_shared<Treasury>();
    faucet::open(&mut f, SHARE, 2 * SHARE, sc.ctx());      // room for two
    sc.next_tx(ANNA); faucet::claim(&mut f, &mut t, sc.ctx());
    sc.next_tx(BOB);  faucet::claim(&mut f, &mut t, sc.ctx());
    sc.next_tx(@0xCA7); faucet::claim(&mut f, &mut t, sc.ctx());   // a third
    abort 0
}

#[test, expected_failure(abort_code = faucet::ENotAdmin)]
fun only_the_league_opens_it() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    sc.next_tx(ANNA);
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = faucet::ENotAdmin)]
fun only_the_league_seals_it() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    sc.next_tx(ANNA);
    faucet::seal(&mut f, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = faucet::ESealed)]
fun a_sealed_faucet_cannot_be_opened_again_not_even_by_the_league() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    faucet::seal(&mut f, sc.ctx());
    assert!(faucet::sealed(&f), 0);
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = faucet::EClosed)]
fun sealing_stops_the_flow_at_once() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    let mut t = sc.take_shared<Treasury>();
    faucet::open(&mut f, SHARE, 10 * SHARE, sc.ctx());
    faucet::seal(&mut f, sc.ctx());
    sc.next_tx(ANNA);
    faucet::claim(&mut f, &mut t, sc.ctx());
    abort 0
}

#[test, expected_failure(abort_code = faucet::ENothing)]
fun it_cannot_be_opened_to_give_nothing_or_to_give_more_than_its_ceiling() {
    let mut sc = begin();
    let mut f = sc.take_shared<Faucet>();
    faucet::open(&mut f, 10, 5, sc.ctx());
    abort 0
}
