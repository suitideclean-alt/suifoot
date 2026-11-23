/// Being in the league costs something every season, and not paying costs you the club.
///
/// The fee is in SFOOT and it goes to the treasury, where a fifth is kept and the rest waits to be
/// won back. It is owed once a season, by whoever owns the club, until a matchday the league names.
/// Past that matchday an owner who has not paid loses the club - and *anybody* may say so, with one
/// transaction, which is the point of doing it here. Nobody has to be trusted to notice, and the
/// league has no staff to forget.
///
/// Three things are deliberate:
///
///   - Only the owner pays. A coach is paid, not charged: who hired him is who owes the season.
///   - A newcomer is given two matchdays. A club taken on the last day before the deadline would
///     otherwise be lost before its new owner had seen it.
///   - What is taken back is the club and nothing else. Its players stay, its money stays, its
///     history stays; the club goes back to being nobody's and is sold again like any other.
module suifoot::entry;

use sui::coin::{Self, Coin};
use sui::event;
use suifoot::club::{Self, Club};
use suifoot::jobs;
use suifoot::league::{Self, League};
use suifoot::sfoot::{Self, Treasury, SFOOT};

#[error]
const ENoFee: vector<u8> = b"this league charges nothing to be in it";
#[error]
const EWrongAmount: vector<u8> = b"that is not what the season costs";
#[error]
const ENotOwner: vector<u8> = b"only the owner pays for the club";
#[error]
const EPaid: vector<u8> = b"this season is already paid for";
#[error]
const EOtherLeague: vector<u8> = b"that club is in a different league";
#[error]
const ENothingOwed: vector<u8> = b"nothing is owed on this club";
#[error]
const ETooSoon: vector<u8> = b"the owner still has time to pay";

/// the moments after taking a club in which nothing can be demanded of it
const GRACE: u16 = 2;

public struct EntryPaid has copy, drop {
    league: ID, club: ID, club_num: u32, by: address, season: u16, week: u16, amount: u64,
}

public struct ClubReclaimed has copy, drop {
    league: ID, club: ID, club_num: u32, former: address, season: u16, week: u16,
}

/// Is a fee owed on this club this season? Only a club somebody runs can owe one.
public fun owes(l: &League, c: &Club): bool {
    league::entry_fee(l) > 0 && club::owner(c).is_some() && club::paid_for(c) != league::season(l)
}

/// The last matchday on which it can still be paid. Past it the club can be taken back.
public fun deadline(l: &League, c: &Club): u16 {
    let due = league::entry_due(l);
    if (club::taken_in(c) == league::season(l)) {
        let late = club::taken_wk(c) + GRACE;
        if (late > due) late else due
    } else due
}

/// Pay for the season. The coin must be exactly what it costs: giving change is how a fee ends up
/// being a tip.
entry fun pay(t: &mut Treasury, l: &League, c: &mut Club, fee: Coin<SFOOT>, ctx: &mut TxContext) {
    assert!(club::league(c) == object::id(l), EOtherLeague);
    assert!(league::entry_fee(l) > 0, ENoFee);
    let owner = club::owner(c);
    assert!(owner.is_some() && *owner.borrow() == ctx.sender(), ENotOwner);
    assert!(club::paid_for(c) != league::season(l), EPaid);
    let amount = coin::value(&fee);
    assert!(amount == league::entry_fee(l), EWrongAmount);

    sfoot::take(t, fee, b"entry", ctx);
    club::set_paid_for(c, league::season(l));
    club::set_entry_paid(c, true);
    event::emit(EntryPaid {
        league: object::id(l), club: object::id(c), club_num: club::num(c),
        by: ctx.sender(), season: league::season(l), week: league::week(l), amount,
    });
}

/// Take a club back from an owner who did not pay. Anybody may call it.
///
/// The club goes back to the market. Anyone it employed is let go, and any deed the old owner holds
/// stops working, because it was cut for a tenure that has ended.
entry fun reclaim(l: &mut League, c: &mut Club, ctx: &TxContext) {
    assert!(club::league(c) == object::id(l), EOtherLeague);
    assert!(owes(l, c), ENothingOwed);
    assert!(league::week(l) > deadline(l, c), ETooSoon);

    let former = *club::owner(c).borrow();
    // somebody other than the owner who was running the team loses the job with the club
    let coach = club::coach(c);
    if (coach.is_some() && *coach.borrow() != former && club::job(c).is_some()) {
        jobs::ended_with_the_club(l, c, *coach.borrow(), former);
    };

    club::vacate(c);
    club::set_entry_paid(c, false);
    // a club at the foot goes back on the list newcomers are drawn from; one higher up is simply
    // for sale on the usual terms
    if (club::level(c) == league::bottom_level(l)) {
        league::register_free(l, object::id(c), club::series(c));
    };
    event::emit(ClubReclaimed {
        league: object::id(l), club: object::id(c), club_num: club::num(c),
        former, season: league::season(l), week: league::week(l),
    });
}
