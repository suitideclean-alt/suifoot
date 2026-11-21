/// How a person gets a club: given one, or buying one.
///
/// Two ways in, deliberately unalike.
///
/// Joining is free and the club is drawn for you, at the foot of the pyramid. The draw matters: left
/// to choose, people would sit there asking again until the best free club came up.
///
/// Buying is paid and narrow. Never the top level - eighteen places for the whole world are climbed
/// to, not bought - and only a club that finished in the bottom half last season.
///
/// One difference from the browser's rules, taken on purpose. There, what is for sale is judged on
/// the table as it stands once five matchdays have been played. Here it is judged on where the club
/// finished last season, all season long. The reason is mechanical: a club is its own object and
/// knows its own row, but not the rows of the seventeen others, and keeping a league table in one
/// shared object would put every match in the world in a queue behind the one before it. The side
/// effect is an improvement - what is for sale is settled for a whole season instead of moving with
/// every result, so nobody has to watch the table to catch a club before somebody else does.
module suifoot::market;

use sui::random::{Self, Random};
use suifoot::club::{Self, Club};
use suifoot::deed;
use suifoot::league::{Self, League};



#[error]
const ETaken: vector<u8> = b"somebody already runs this club";
#[error]
const ENoneFree: vector<u8> = b"there is no free club at the foot of the pyramid";
#[error]
const ETopNotForSale: vector<u8> = b"the top division is climbed to, not bought";
#[error]
const ETooHigh: vector<u8> = b"only a club that finished in the bottom half is for sale";
#[error]
const EWrongClub: vector<u8> = b"this is not the club that was drawn for you";

/// What a newcomer is handed when the draw is made: it names one club and nothing else, so the draw
/// cannot be taken again until a better one comes up.
public struct JoinTicket has key {
    id: UID,
    club: ID,
}

public fun ticket_club(t: &JoinTicket): ID { t.club }

/// Ask for a club.
///
/// The draw happens here and the club it lands on is taken off the free list at once, so two people
/// asking in the same minute cannot be handed the same one. The ticket is then yours and names that
/// club alone. An entry function, so the draw cannot be wrapped in a larger transaction that looks
/// at which club came up and throws the whole thing away if it is not the one wanted.
entry fun request_join(l: &mut League, r: &Random, ctx: &mut TxContext) {
    let n = league::free_at_foot(l);
    assert!(n > 0, ENoneFree);

    // The series with the fewest places left, and then a club drawn at random inside it. Filling one
    // series before opening the next is what keeps the bill down: a series costs the same whether
    // twelve people are in it or two, and the draw is what stops anybody asking again for a better
    // club.
    let want = league::tightest_series(l);
    let mut pool = vector[];
    let mut k = 0;
    while (k < n) {
        if (league::free_series_at(l, k) == want) pool.push_back(league::free_at(l, k));
        k = k + 1;
    };

    let mut gen = random::new_generator(r, ctx);
    let m = pool.length();
    let i = (random::generate_u32(&mut gen) as u64) * m >> 32;
    let picked = pool[if (i < m) i else m - 1];
    league::forget_free(l, &picked);

    transfer::transfer(JoinTicket { id: object::new(ctx), club: picked }, ctx.sender());
}

/// Hand the ticket back with the club it named, and the club is yours.
public fun claim(t: JoinTicket, l: &League, c: &mut Club, ctx: &mut TxContext) {
    let JoinTicket { id, club } = t;
    id.delete();
    assert!(club == object::id(c), EWrongClub);
    assert!(club::is_free(c), ETaken);
    take(l, c, ctx.sender());
    deed::issue(c, league::season(l), ctx.sender(), ctx);
}

/// Buy a named club. No draw, because you chose it; the rules are what narrow the choice.
public fun buy(l: &mut League, c: &mut Club, ctx: &mut TxContext) {
    assert!(club::is_free(c), ETaken);
    assert!(club::level(c) > 0, ETopNotForSale);
    assert!(in_bottom_half(l, c), ETooHigh);
    league::forget_free(l, &object::id(c));
    take(l, c, ctx.sender());
    deed::issue(c, league::season(l), ctx.sender(), ctx);
}

/// Where it finished last season. A club that has never finished one counts as mid-table, which
/// under this rule means it is not for sale - so in a league's first season nothing is, and the only
/// way in is to be given a club. That is the right way round: there is nothing to judge yet.
public fun in_bottom_half(l: &League, c: &Club): bool {
    let pos = club::last_pos(c);
    pos > league::series_size(l) / 2
}

fun take(l: &League, c: &mut Club, who: address) {
    club::set_owner(c, option::some(who));
    club::set_coach(c, option::some(who));
    // a club taken after the season has started owes no entry fee for it, and so draws nothing from
    // the prize pool either: you did not pay in, you do not take out
    if (league::week(l) > 1) club::set_entry_paid(c, false);
}

#[test_only]
public fun ticket_for_testing(club: ID, ctx: &mut TxContext): JoinTicket {
    JoinTicket { id: object::new(ctx), club }
}
