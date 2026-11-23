/// Where a club's money comes from and where it goes.
///
/// All of it is in-game dollars, which are not the token and are never exchanged for it. The dollar
/// is the thing a club budgets in; the token is the thing a person pays with. Keeping them apart is
/// what stops a bad week in the league from being a loss of real money.
///
/// Dollars are whole. Nothing here carries a scale except the ratios, and a ticket price is held in
/// cents so that it too stays a whole number.
module suifoot::money;

use suifoot::club::{Self, Club};
use suifoot::fx::{Self, Fx};

/// what the television pays each week, by level
const TV_WEEKLY: vector<u64> = vector[11000, 5500, 4000, 3000];
/// and what a sponsor does
const SPONSOR_WEEKLY: vector<u64> = vector[12000, 8000, 6500, 5000];
/// the following a club of that level is expected to have, which is what a sponsor measures it against
const REFERENCE_FANS: vector<u64> = vector[24000, 12000, 6000, 3000];
/// what a ticket is expected to cost there, in cents
const REFERENCE_CENTS: vector<u64> = vector[300, 240, 190, 150];
/// keeping a seat standing costs this many cents a week
const UPKEEP_CENTS_PER_SEAT: u64 = 12;
/// a derby fills the ground and lifts the gate by a third
const DERBY_LIFT: u64 = 130;

/// How many turn up.
///
/// Three things decide it: how many follow the club at all, how it is doing, and what it charges.
/// Charging above what the division expects empties the ground faster than it fills the bank, which
/// is the whole point of letting an owner set the price.
///
/// The browser weighs recent form over the last few matches. Here it is the season's points per
/// game, because a club knows its own season and keeping a rolling list of results on chain would
/// cost storage to say almost the same thing. Before a ball is kicked both come to the same place.
public fun attendance(c: &Club): u64 {
    let played = (club::played(c) as u64);
    let per_game = if (played == 0) fx::from_ratio(13, 10)
        else fx::div(&fx::from_int((club::points(c) as u64)), &fx::from_int(played));
    let mood = fx::add(&fx::from_ratio(8, 10), &fx::mul(&fx::from_ratio(1, 10), &per_game));

    let expected = REFERENCE_CENTS[(club::level(c) as u64)];
    let asking = club::ticket_cents(c);
    let price_factor = if (asking == 0) fx::from_int(2)
        else fx::pow(&fx::div(&fx::from_int(expected), &fx::from_int(asking)), &fx::from_ratio(11, 10));

    let turn_up = fx::to_int_round(&fx::mul(&fx::mul(&fx::from_int((club::fans(c) as u64)), &mood), &price_factor));
    let seats = (club::capacity(c) as u64);
    if (turn_up > seats) seats else turn_up // nobody stands who cannot get in
}

/// What the gate is worth: everyone who came, at the price they paid.
public fun gate(c: &Club, derby: bool): u64 {
    let heads = attendance(c);
    let plain = heads * club::ticket_cents(c) / 100;
    if (derby) plain * DERBY_LIFT / 100 else plain
}

/// The home club takes the gate. The away club takes nothing, which is how this league works.
public(package) fun collect_gate(c: &mut Club, derby: bool) {
    let taken = gate(c, derby); // worked out before the club is borrowed to be changed
    club::credit(c, taken);
}

/// What a sponsor pays: the level's rate, scaled by how the following compares with what the level
/// expects. The square root is there so that twice the fans is not twice the money.
public fun sponsorship(c: &Club): u64 {
    let level = (club::level(c) as u64);
    let reference = REFERENCE_FANS[level];
    let ratio = fx::div(&fx::from_int((club::fans(c) as u64)), &fx::from_int(reference));
    fx::to_int_round(&fx::mul(&fx::from_int(SPONSOR_WEEKLY[level]), &fx::sqrt(&ratio)))
}

public fun television(c: &Club): u64 { TV_WEEKLY[(club::level(c) as u64)] }
public fun upkeep(c: &Club): u64 { (club::capacity(c) as u64) * UPKEEP_CENTS_PER_SEAT / 100 }

/// what the week costs before anything is earned
public fun outgoings(c: &Club): u64 { club::wage_bill(c) + upkeep(c) }
public fun incomings(c: &Club): u64 { television(c) + sponsorship(c) }

/// A week's books. Wages and upkeep go out, television and the sponsor come in.
///
/// A club that cannot pay is taken to nothing rather than into a debt it has no way of carrying.
/// What happens to a club that keeps ending the week at nothing is a question for the part of this
/// that does not exist yet; leaving it owing money nobody can collect would be worse.
public(package) fun settle_week(c: &mut Club) {
    let earned = incomings(c);
    let owed = outgoings(c);
    club::credit(c, earned);
    let have = club::balance(c);
    club::debit(c, if (owed > have) have else owed);
}

/// whether the week's earnings cover the week's bills, which is the number an owner actually watches
public fun weekly_profit(c: &Club): (bool, u64) {
    let in_ = incomings(c);
    let out = outgoings(c);
    if (in_ >= out) (true, in_ - out) else (false, out - in_)
}
