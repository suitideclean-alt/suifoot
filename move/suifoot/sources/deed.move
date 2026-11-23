/// The deed to a club: the thing a person actually owns.
///
/// A club has to be a shared object, because a match reaches into two of them at once and neither
/// manager is there to sign for it. Shared objects cannot sit in a wallet, so if ownership were only
/// a field inside the club, there would be nothing to hold, nothing to show, and nothing to sell:
/// the club would be yours only inside this game, and invisible everywhere else.
///
/// So ownership is a deed. One small object, owned outright, naming one club. It appears in a wallet
/// like anything else, it can be sold on any marketplace on the chain without a line of code from
/// us, and whoever ends up holding it can walk up to the club and say so.
///
/// This is also the honest shape of the thing. You do not buy a footballer to keep in your pocket -
/// you buy the club, and the players come with it. That is what the entry fee has always been for.
module suifoot::deed;

use std::string::{Self, String};
use sui::display;
use sui::package;
use suifoot::club::{Self, Club};

#[error]
const EWrongClub: vector<u8> = b"this deed is not for that club";
#[error]
const ETaken: vector<u8> = b"somebody else already runs that club";
#[error]
const EStale: vector<u8> = b"this deed is for an earlier keeping of the club, which has ended";

/// the one-time witness, which is what proves this module may speak for the package
public struct DEED has drop {}

public struct ClubDeed has key, store {
    id: UID,
    /// the club it names, and the number its badge and colours are drawn from
    club: ID,
    club_num: u32,
    name: String,
    level: u8,
    /// the season it was taken, which is a thing a holder will want to know
    since: u16,
    /// which keeping of the club this deed is for; see `Club.tenure`
    tenure: u32,
}

public fun tenure(d: &ClubDeed): u32 { d.tenure }
public fun club(d: &ClubDeed): ID { d.club }
public fun club_num(d: &ClubDeed): u32 { d.club_num }
public fun name(d: &ClubDeed): &String { &d.name }
public fun level(d: &ClubDeed): u8 { d.level }
public fun since(d: &ClubDeed): u16 { d.since }

/// Publishing claims the right to speak for this package, and nothing else.
///
/// How a wallet should draw a deed is set up afterwards, by a separate call. It was in here once and
/// it aborted, which took the whole publish down with it - a package that will not publish because
/// of a picture is a bad trade. Claiming cannot fail; dressing the thing up can wait.
fun init(otw: DEED, ctx: &mut TxContext) {
    transfer::public_transfer(package::claim(otw, ctx), ctx.sender());
}

/// Set out how a wallet or a marketplace should show one of these.
///
/// The badge is drawn from the club number alone - no image was ever uploaded anywhere - so the
/// picture is simply a file named after that number. Whoever holds the publisher can change any of
/// this later, which is what makes it safe to name a web address here at all.
entry fun publish_display(pub: &package::Publisher, ctx: &mut TxContext) {
    let mut d = display::new<ClubDeed>(pub, ctx);
    d.add(b"name".to_string(), b"{name}".to_string());
    d.add(
        b"description".to_string(),
        b"The deed to {name}, a football club in SuiFoot. Whoever holds this runs the club.".to_string(),
    );
    d.add(b"image_url".to_string(), b"https://suifoot.fun/badges/{club_num}.svg".to_string());
    d.add(b"link".to_string(), b"https://suifoot.fun/?club={club_num}".to_string());
    d.add(b"project_url".to_string(), b"https://suifoot.fun".to_string());
    d.update_version();
    transfer::public_transfer(d, ctx.sender());
}

/// Cut a deed for a club that has just been taken. Only the market may call this, which is what
/// stops anybody minting themselves a deed to a club they never took.
public(package) fun issue(c: &Club, season: u16, to: address, ctx: &mut TxContext) {
    let d = ClubDeed {
        id: object::new(ctx),
        club: object::id(c),
        club_num: club::num(c),
        name: *club::name(c),
        level: club::level(c),
        since: season,
        tenure: club::tenure(c),
    };
    transfer::public_transfer(d, to);
}

/// Walk up to the club with the deed and say so.
///
/// This is what makes a sale on any marketplace work without us writing a word of it: the deed
/// changes hands there, and the new holder calls this. A club that somebody else still runs is not
/// taken from them here - a deed cannot be used to walk in on a going concern.
public fun present(d: &ClubDeed, c: &mut Club, ctx: &TxContext) {
    assert!(d.club == object::id(c), EWrongClub);
    assert!(d.tenure == club::tenure(c), EStale);
    let who = ctx.sender();
    let held = club::owner(c);
    assert!(held.is_none() || *held.borrow() == who || club::is_free(c), ETaken);
    club::set_owner(c, option::some(who));
    club::set_coach(c, option::some(who));
}

/// Give up a club: the deed is destroyed and the club goes back to being nobody's.
public fun give_up(d: ClubDeed, c: &mut Club, ctx: &TxContext) {
    assert!(d.club == object::id(c), EWrongClub);
    assert!(club::runs_it(c, ctx.sender()), ETaken);
    club::set_owner(c, option::none());
    club::set_coach(c, option::none());
    let ClubDeed { id, club: _, club_num: _, name: _, level: _, since: _, tenure: _ } = d;
    id.delete();
}

#[test_only]
public fun issue_for_testing(c: &Club, season: u16, ctx: &mut TxContext): ClubDeed {
    ClubDeed {
        id: object::new(ctx),
        club: object::id(c), club_num: club::num(c), name: *club::name(c),
        level: club::level(c), since: season, tenure: club::tenure(c),
    }
}
#[test_only]
public fun destroy_for_testing(d: ClubDeed) {
    let ClubDeed { id, club: _, club_num: _, name: _, level: _, since: _, tenure: _ } = d;
    id.delete();
}
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(DEED {}, ctx) }
