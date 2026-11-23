/// A job is authority, not a label: these are the ways somebody might try to take one.
#[test_only]
module suifoot::jobs_tests;

use std::string;
use suifoot::club::{Self, Club};
use suifoot::jobs;
use suifoot::league::{Self, League};

const OWNER: address = @0xB055;
const COACH: address = @0xC0AC4;
const DAY: u64 = 86400000;
const T0: u64 = 1800000000000 / DAY * DAY;

fun a_league(ctx: &mut TxContext): League { league::new(T0, vector[12 * 60, 20 * 60], 34, ctx) }

fun a_club(lg: &League, ctx: &mut TxContext): Club {
    club::new(1, string::utf8(b"Test"), 3, 0, 100000, object::id(lg), ctx)
}

fun done(l: League, c: Club) { club::destroy_for_testing(c); league::destroy_for_testing(l); }

/// The ordinary way round: offered, then taken, and only then is anything settled.
#[test]
fun a_job_is_offered_and_taken() {
    let mut ctx = tx_context::dummy(); // the sender here is the owner
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(ctx.sender()));
    club::set_coach(&mut c, option::some(ctx.sender()));

    jobs::offer(&l, &mut c, COACH, 5000, 68, 500, &mut ctx);
    // nothing has moved yet: an offer is not a job
    assert!(*club::coach(&c).borrow() == ctx.sender(), 0);
    assert!(club::job(&c).is_none(), 1);
    assert!(club::offer(&c).is_some(), 2);

    let mut his = tx_context::new_from_hint(COACH, 7, 0, 0, 0);
    jobs::accept(&l, &mut c, &mut his);
    assert!(*club::coach(&c).borrow() == COACH, 3);
    let j = *club::job(&c).borrow();
    assert!(club::job_wage(&j) == 5000 && club::job_weeks(&j) == 68, 4);
    assert!(club::job_agreed(&j), 5); // two people settled on it
    assert!(club::offer(&c).is_none(), 6);
    done(l, c);
}

/// A job put to one person is not a job anybody may take.
#[test, expected_failure(abort_code = jobs::ENotForYou)]
fun somebody_else_cannot_take_the_job() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(ctx.sender()));
    jobs::offer(&l, &mut c, COACH, 5000, 68, 500, &mut ctx);

    let mut other = tx_context::new_from_hint(@0xBAD, 7, 0, 0, 0);
    jobs::accept(&l, &mut c, &mut other);
    abort 0
}

/// Only the owner gives the job away.
#[test, expected_failure(abort_code = jobs::ENotTheOwner)]
fun a_stranger_cannot_hand_out_somebody_elses_job() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(OWNER));
    jobs::offer(&l, &mut c, COACH, 5000, 68, 500, &mut ctx);
    abort 0
}

/// A club with an owner is not a vacancy, whatever its coaching position.
#[test, expected_failure(abort_code = jobs::EHasOwner)]
fun an_owned_club_cannot_be_walked_into() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(OWNER));
    let mut his = tx_context::new_from_hint(COACH, 7, 0, 0, 0);
    jobs::take_vacant(&l, &mut c, &mut his);
    abort 0
}

/// A club nobody owns is a job anybody may take, and it pays what the rules say rather than what
/// the taker fancies - which is why nothing he writes decides it.
#[test]
fun a_club_nobody_owns_has_a_job_going() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);

    let mut his = tx_context::new_from_hint(COACH, 7, 0, 0, 0);
    jobs::take_vacant(&l, &mut c, &mut his);
    assert!(*club::coach(&c).borrow() == COACH, 0);
    let j = *club::job(&c).borrow();
    assert!(!club::job_agreed(&j), 1); // nobody agreed it, so the rules set what it pays
    assert!(club::job_wage(&j) == 0, 2);

    // and now it is not going any more
    let mut another = tx_context::new_from_hint(@0xBAD, 7, 0, 0, 0);
    assert!(club::coach(&c).is_some(), 3);
    done(l, c);
    let _ = another;
}

/// Whoever holds the job can walk away; nobody else can walk away for him.
#[test, expected_failure(abort_code = jobs::ENotTheCoach)]
fun nobody_resigns_on_somebody_elses_behalf() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(OWNER));
    club::set_coach(&mut c, option::some(COACH));
    jobs::resign(&l, &mut c, &mut ctx);
    abort 0
}

/// Letting somebody go leaves the owner picking the team, rather than nobody.
#[test]
fun dismissal_leaves_the_owner_holding_the_team_sheet() {
    let mut ctx = tx_context::dummy();
    let me = ctx.sender();
    let l = a_league(&mut ctx);
    let mut c = a_club(&l, &mut ctx);
    club::set_owner(&mut c, option::some(me));
    club::set_coach(&mut c, option::some(COACH));
    club::set_job(&mut c, option::some(club::new_job(5000, 68, 500, 1, true)));

    jobs::dismiss(&l, &mut c, &mut ctx);
    assert!(*club::coach(&c).borrow() == me, 0);
    assert!(club::job(&c).is_none(), 1);
    done(l, c);
}

/// A club from another league is not this league's to hire into.
#[test, expected_failure(abort_code = jobs::ENotThisLeague)]
fun a_club_from_elsewhere_cannot_be_hired_into_here() {
    let mut ctx = tx_context::dummy();
    let here = a_league(&mut ctx);
    let there = a_league(&mut ctx);
    let mut theirs = a_club(&there, &mut ctx);
    club::set_owner(&mut theirs, option::some(ctx.sender()));
    jobs::offer(&here, &mut theirs, COACH, 5000, 68, 500, &mut ctx);
    abort 0
}
