/// Everything a person chooses, written down in order.
///
/// The league and its matches need the contract to hold very little: the clubs as they were made,
/// who runs each, and one drawn number a matchday. Everything that follows is worked out from
/// those, the same way by everyone. The Cup, Europe, the training, the transfers and the tickets
/// are no different in kind - they are not things the contract has to *do*, they are things people
/// *choose*, and a choice is a small record.
///
/// So this module is the whole of the rest of the game, and it is one function. A decision is
/// checked for two things and two only:
///
///   - whose it is. Only whoever runs a club may decide for that club.
///   - when it came. A team sheet handed in after the draw is worth nothing, and so is a bid made
///     after the window shut.
///
/// What the decision *means* is deliberately not the contract's business. Whether you had the money
/// for that player, whether that man was yours to sell, whether the price was fair - those are
/// rules of the game, and the game is worked out from this log by everyone who looks at it. An
/// illegal decision is not rejected here; it is recorded here and refused by the working-out, in
/// every browser alike, for the same reason. The contract guards authority and timing, which cannot
/// be derived. It does not guard arithmetic, which can.
///
/// Decisions are events rather than stored fields. An event costs a fraction of what a field costs
/// to keep, stays in the order the chain put it in, and is never contradicted. A club that has made
/// a thousand decisions is no heavier than one that has made none.
module suifoot::decide;

use sui::clock::{Self, Clock};
use sui::event;
use suifoot::club::{Self, Club};
use suifoot::league::{Self, League};

#[error]
const ENotYours: vector<u8> = b"only whoever runs this club may decide for it";
#[error]
const EShut: vector<u8> = b"that window has closed for this matchday";
#[error]
const ENotThisLeague: vector<u8> = b"that club does not play in this league";
#[error]
const ETooMuch: vector<u8> = b"a decision carries a note, not a document";

/// the most a decision may carry with it, so that the log cannot be used as storage
const MAX_DATA: u64 = 256;

/// What a decision is about. The contract knows these apart only to know when each is too late;
/// what they do is worked out from the log, not here.
const TEAM: u8 = 1;        // the team sheet, sealed
const SHOW: u8 = 2;        // the same team sheet, shown
const TRAIN: u8 = 3;       // what the week is spent working on
const TICKET: u8 = 4;      // what it costs to come and watch
const LIST: u8 = 5;        // a man put up for sale
const BID: u8 = 6;         // an offer for somebody else's man
const ANSWER: u8 = 7;      // yes or no to an offer
const SKILL: u8 = 8;       // where a coach spends what he has learned
const INVEST: u8 = 9;      // an owner putting money into the ground or the academy
const RENEW: u8 = 10;      // keeping a man who was running out of contract

public fun team(): u8 { TEAM }
public fun show(): u8 { SHOW }
public fun train(): u8 { TRAIN }
public fun ticket(): u8 { TICKET }
public fun list(): u8 { LIST }
public fun bid(): u8 { BID }
public fun answer(): u8 { ANSWER }
public fun skill(): u8 { SKILL }
public fun invest(): u8 { INVEST }
public fun renew(): u8 { RENEW }

/// A thing somebody chose, and when.
///
/// `a` and `b` carry whatever two numbers the decision needs - a player's number and a price, a
/// skill and a level - and `data` whatever does not fit in two numbers, such as a sealed team
/// sheet. Read together, in the order the chain put them in, they are the game.
public struct Decided has copy, drop {
    club: ID,
    club_num: u32,
    by: address,
    season: u16,
    week: u16,
    at: u64,
    kind: u8,
    a: u64,
    b: u64,
    data: vector<u8>,
}

public fun decided_kind(d: &Decided): u8 { d.kind }
public fun decided_week(d: &Decided): u16 { d.week }

/// Write a decision down.
///
/// The club is taken by shared reference rather than mutably, so two people deciding for two clubs
/// in the same moment do not queue behind each other - there is nothing here to change.
entry fun decide(
    l: &League, c: &Club, kind: u8, a: u64, b: u64, data: vector<u8>, clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(data.length() <= MAX_DATA, ETooMuch);
    let who = ctx.sender();
    assert!(club::runs_it(c, who), ENotYours);
    assert!(league::holds(l, club::num(c), club::series(c)), ENotThisLeague);

    let week = league::week(l);
    let now = clock::timestamp_ms(clock);
    assert!(open_for(l, kind, week, now), EShut);

    event::emit(Decided {
        club: object::id(c),
        club_num: club::num(c),
        by: who,
        season: league::season(l),
        week,
        at: now,
        kind,
        a,
        b,
        data,
    });
}

/// Is it still in time?
///
/// While the league is played by hand there are no hours to be late for: a matchday happens when
/// somebody presses the button, and anything decided before they press it counts. Once the league
/// runs to the clock, the team sheet closes before the draw - otherwise a sheet could be handed in
/// knowing the dice - and the buying and selling close with it, so that nobody signs a player on
/// seeing who they are about to face.
public fun open_for(l: &League, kind: u8, week: u16, now: u64): bool {
    if (league::manual(l)) return true;
    if (kind == SHOW) return league::phase_at(l, week, now) >= league::played();
    league::phase_at(l, week, now) < league::drawn()
}
