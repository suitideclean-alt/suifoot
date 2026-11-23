/// What the contract must refuse, written down as the attacks it has to survive.
///
/// The rest of the suite asks whether the game is played correctly. This one assumes somebody is
/// trying to cheat and asks whether they can. The contract guards two things - whose a decision is
/// and whether it came in time - because those are the two that cannot be worked out afterwards
/// from numbers everybody shares. Everything else is arithmetic, and arithmetic is refused the
/// same way by every browser; these are the ones that would not be.
#[test_only]
module suifoot::security_tests;

use sui::clock;
use std::string;
use suifoot::club::{Self, Club};
use suifoot::decide;
use suifoot::league::{Self, League};
use suifoot::player;

const ALICE: address = @0xA11CE;
const DAY: u64 = 86400000;
const T0: u64 = 1800000000000 / DAY * DAY;

fun a_league(ctx: &mut TxContext): League {
    league::new(T0, vector[12 * 60, 20 * 60], 34, ctx)
}

fun a_club(num: u32, lg: &League, ctx: &mut TxContext): Club {
    let mut c = club::new(num, string::utf8(b"Test"), 3, 0, 100000, object::id(lg), ctx);
    let mut i = 0;
    while (i < 18) {
        club::add_player(&mut c, player::new(num * 100 + i, player::mf(), player::pro(), 25, 50, 50, 1000, 52));
        i = i + 1;
    };
    c
}

/// Nobody decides for a club that is not theirs. This is the whole of what owning one means here:
/// a club somebody else can act for is not owned, it is merely labelled.
#[test, expected_failure(abort_code = decide::ENotYours)]
fun a_stranger_cannot_decide_for_my_club() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let mut c = a_club(1, &l, &mut ctx);
    league::add_to_series(&mut l, 0, 1);
    club::set_owner(&mut c, option::some(ALICE)); // Alice's club, and we are not Alice

    let clk = clock::create_for_testing(&mut ctx);
    decide::decide(&l, &c, decide::ticket(), 9999, 0, vector[], &clk, &mut ctx);
    abort 0
}

/// A club from another league answers "is my number on your list?" correctly, because club numbers
/// start again at one in every league. It has to be refused on identity rather than on number, and
/// this is the test that would have caught it had it been written first.
#[test, expected_failure(abort_code = decide::ENotThisLeague)]
fun a_club_from_another_league_cannot_decide_here() {
    let mut ctx = tx_context::dummy();
    let mut here = a_league(&mut ctx);
    let there = a_league(&mut ctx);

    // club number one of the other league, held quite legitimately by whoever is calling
    let mut theirs = a_club(1, &there, &mut ctx);
    club::set_owner(&mut theirs, option::some(ctx.sender()));
    // and this league has a club number one on its own list
    league::add_to_series(&mut here, 0, 1);

    let clk = clock::create_for_testing(&mut ctx);
    decide::decide(&here, &theirs, decide::ticket(), 100, 0, vector[], &clk, &mut ctx);
    abort 0
}

/// The other half of the same rule, which would be a poor guard if it refused everybody.
#[test]
fun the_owner_can_decide_for_his_own_club() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let mut c = a_club(1, &l, &mut ctx);
    league::add_to_series(&mut l, 0, 1);
    club::set_owner(&mut c, option::some(ctx.sender()));

    let clk = clock::create_for_testing(&mut ctx);
    decide::decide(&l, &c, decide::ticket(), 1500, 0, vector[], &clk, &mut ctx);

    clock::destroy_for_testing(clk);
    club::destroy_for_testing(c);
    league::destroy_for_testing(l);
}

/// A decision carries a note, not a document. The log is a log, and not storage that everybody
/// else is paying to keep for one person.
#[test, expected_failure(abort_code = decide::ETooMuch)]
fun a_decision_cannot_be_used_as_storage() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let mut c = a_club(1, &l, &mut ctx);
    league::add_to_series(&mut l, 0, 1);
    club::set_owner(&mut c, option::some(ctx.sender()));

    let mut big = vector[];
    let mut i = 0;
    while (i < 400) { big.push_back(7u8); i = i + 1; };

    let clk = clock::create_for_testing(&mut ctx);
    decide::decide(&l, &c, decide::ticket(), 0, 0, big, &clk, &mut ctx);
    abort 0
}

/// A club nobody runs cannot be decided for either, which matters because a free club is exactly
/// the one a passer-by would try.
#[test, expected_failure(abort_code = decide::ENotYours)]
fun a_free_club_decides_for_nobody() {
    let mut ctx = tx_context::dummy();
    let mut l = a_league(&mut ctx);
    let c = a_club(1, &l, &mut ctx);
    league::add_to_series(&mut l, 0, 1);

    let clk = clock::create_for_testing(&mut ctx);
    decide::decide(&l, &c, decide::ticket(), 100, 0, vector[], &clk, &mut ctx);
    abort 0
}
