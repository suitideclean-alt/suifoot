/// Who picks the team, and on what terms.
///
/// Nearly everything in this game is worked out rather than stored: the chain keeps what people
/// decided and the rules say what follows. Employment is the exception, and for a reason worth
/// stating. Whether somebody may act for a club is the question the contract itself has to answer
/// before it will take their signature - so it cannot be the answer to a sum done afterwards by
/// whoever is looking. Ownership is held on the chain for the same reason, and a job is ownership
/// of the team sheet.
///
/// What is kept is therefore the least that cannot be derived: who holds the job, and the terms
/// two people agreed. What a dismissal costs, whether there was just cause, what is owed on the
/// way out - all of that follows from those numbers and from the season, identically for everyone,
/// so keeping it here would only be a second place for it to be wrong.
///
/// A job between two people takes two signatures, like a transfer: one offers and the other
/// accepts, and nothing is settled in between. A club nobody owns has nobody to offer, so its job
/// is there to be taken, and what it pays is what the game says such a club pays.
module suifoot::jobs;

use sui::event;
use suifoot::club::{Self, Club};
use suifoot::league::{Self, League};

#[error]
const ENotTheOwner: vector<u8> = b"only the owner of this club may do that";
#[error]
const ENotTheCoach: vector<u8> = b"only whoever holds this job may do that";
#[error]
const ETaken: vector<u8> = b"somebody already picks this team";
#[error]
const ENotForYou: vector<u8> = b"that job was put to somebody else";
#[error]
const ENoOffer: vector<u8> = b"there is no job here to take";
#[error]
const ENotThisLeague: vector<u8> = b"that club does not play in this league";
#[error]
const EHasOwner: vector<u8> = b"this club has an owner, so its job is his to give";
#[error]
const ETooLong: vector<u8> = b"nobody is hired for longer than five seasons";

const WEEKS_IN_SEASON: u16 = 34;
const MAX_WEEKS: u16 = WEEKS_IN_SEASON * 5;

/// Whatever happened to somebody's employment, in the order it happened.
///
/// The career is read from these. A person who has never owned a club still has a record - every
/// job they took, what it paid, how it ended - which is the whole point: it is how somebody with
/// nothing to show but their work shows it.
public struct JobEvent has copy, drop {
    league: ID,
    club: ID,
    club_num: u32,
    who: address,
    by: address,
    season: u16,
    week: u16,
    kind: u8,     // 1 offered, 2 accepted, 3 resigned, 4 dismissed, 5 taken from a vacant club
    wage: u64,
    weeks: u16,
    win: u64,
}

const OFFERED: u8 = 1;
const ACCEPTED: u8 = 2;
const RESIGNED: u8 = 3;
const DISMISSED: u8 = 4;
const TAKEN: u8 = 5;

fun owns(c: &Club, who: address): bool {
    let o = club::owner(c);
    o.is_some() && *o.borrow() == who
}

fun coaches(c: &Club, who: address): bool {
    let k = club::coach(c);
    k.is_some() && *k.borrow() == who
}

fun belongs(l: &League, c: &Club) {
    assert!(club::league(c) == object::id(l), ENotThisLeague);
}

/// A club lost its keeper and the people it employed went with it. Written down as a dismissal, so
/// the career of whoever coached it ends the way every other one does.
public(package) fun ended_with_the_club(l: &League, c: &Club, who: address, by: address) {
    tell(l, c, who, by, 4, 0, 0, 0);
}

fun tell(l: &League, c: &Club, who: address, by: address, kind: u8, wage: u64, weeks: u16, win: u64) {
    event::emit(JobEvent {
        league: object::id(l), club: object::id(c), club_num: club::num(c),
        who, by, season: league::season(l), week: league::week(l),
        kind, wage, weeks, win,
    });
}

/// Put a job to somebody. The owner's to give, and theirs to take or leave.
entry fun offer(l: &League, c: &mut Club, to: address, wage: u64, weeks: u16, win: u64, ctx: &mut TxContext) {
    belongs(l, c);
    let by = ctx.sender();
    assert!(owns(c, by), ENotTheOwner);
    assert!(weeks > 0 && weeks <= MAX_WEEKS, ETooLong);
    club::set_offer(c, option::some(club::new_offer(to, wage, weeks, win)));
    tell(l, c, to, by, OFFERED, wage, weeks, win);
}

/// Take the job that was put to you. Nothing was settled until this.
entry fun accept(l: &League, c: &mut Club, ctx: &mut TxContext) {
    belongs(l, c);
    let who = ctx.sender();
    let held = club::offer(c);
    assert!(held.is_some(), ENoOffer);
    let o = *held.borrow();
    assert!(club::offer_to(&o) == who, ENotForYou);
    /* An owner who also picks the team is not somebody else occupying the job, so handing it over
     * is allowed; anybody else already in it has to leave first. */
    let k = club::coach(c);
    assert!(k.is_none() || owns(c, *k.borrow()), ETaken);

    club::set_coach(c, option::some(who));
    club::set_job(c, option::some(club::new_job(
        club::offer_wage(&o), club::offer_weeks(&o), club::offer_win(&o), league::season(l), true)));
    club::set_offer(c, option::none());
    tell(l, c, who, who, ACCEPTED, club::offer_wage(&o), club::offer_weeks(&o), club::offer_win(&o));
}

/// Take the job at a club nobody owns.
///
/// There is nobody to offer it, so it is there for whoever wants it, and it pays what the game
/// says a club of that standing pays somebody of that record - which is not a term anybody can
/// dispute, because it is not a term anybody chose. A club with an owner is not available this
/// way: his job is his to give.
entry fun take_vacant(l: &League, c: &mut Club, ctx: &mut TxContext) {
    belongs(l, c);
    assert!(club::owner(c).is_none(), EHasOwner);
    assert!(club::coach(c).is_none(), ETaken);
    let who = ctx.sender();
    club::set_coach(c, option::some(who));
    club::set_job(c, option::some(club::new_job(0, WEEKS_IN_SEASON * 2, 0, league::season(l), false)));
    tell(l, c, who, who, TAKEN, 0, WEEKS_IN_SEASON * 2, 0);
}

/// Walk away. What it costs is the rules' business, not this module's.
entry fun resign(l: &League, c: &mut Club, ctx: &mut TxContext) {
    belongs(l, c);
    let who = ctx.sender();
    assert!(coaches(c, who), ENotTheCoach);
    assert!(!owns(c, who), ENotTheCoach); // an owner does not resign from himself
    club::set_coach(c, option::none());
    club::set_job(c, option::none());
    tell(l, c, who, who, RESIGNED, 0, 0, 0);
}

/// Let somebody go. What is owed follows from the terms and the season, and is paid by the rules.
entry fun dismiss(l: &League, c: &mut Club, ctx: &mut TxContext) {
    belongs(l, c);
    let by = ctx.sender();
    assert!(owns(c, by), ENotTheOwner);
    let k = club::coach(c);
    assert!(k.is_some(), ENotTheCoach);
    let who = *k.borrow();
    assert!(who != by, ENotTheCoach); // an owner cannot dismiss himself; he gives the club up
    club::set_coach(c, option::some(by)); // the owner picks the team again until he finds somebody
    club::set_job(c, option::none());
    tell(l, c, who, by, DISMISSED, 0, 0, 0);
}

/// Withdraw a job nobody has answered.
entry fun withdraw(l: &League, c: &mut Club, ctx: &mut TxContext) {
    belongs(l, c);
    assert!(owns(c, ctx.sender()), ENotTheOwner);
    club::set_offer(c, option::none());
}
