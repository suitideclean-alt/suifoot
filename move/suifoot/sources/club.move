/// A football club, as an object of its own on chain.
///
/// One object per club rather than one object for the whole league, and that is the decision the
/// whole design rests on. Two matches on the same matchday touch four different clubs, so the chain
/// can run them at the same time; put the league in a single object and every match in the world
/// would have to queue behind the one before it. Hundreds of people playing the same season is a
/// storage question, not a speed one, only because of this.
///
/// The club holds what a browser must never be trusted with: the squad, the money, and the row in
/// the table. The browser reads these and draws them. It never asserts them.
module suifoot::club;

use std::string::String;
use suifoot::player::{Self, Player};
use suifoot::lineup::{Self, Lineup};

#[error]
const ENotYours: vector<u8> = b"only the person who runs this club may do that";
#[error]
const ENoSuchPlayer: vector<u8> = b"no player of that number is at this club";
#[error]
const ETooPoor: vector<u8> = b"the club does not have that much";
#[error]
const ENoSeal: vector<u8> = b"nothing was sealed for this matchday";
#[error]
const ESealMismatch: vector<u8> = b"this lineup is not the one that was sealed";
#[error]
const ENotInSquad: vector<u8> = b"a named player is not in this squad";

public struct Club has key, store {
    id: UID,
    /// the club's number, which is also the seed its name and colours are drawn from
    num: u32,
    name: String,
    level: u8,
    series: u16,
    squad: vector<Player>,
    /// in-game dollars; the real token is never mixed in here
    balance: u64,
    owner: Option<address>,
    coach: Option<address>,
    /// where it finished last season, which is what the bottom-half rule reads before a table means anything
    last_pos: u8,
    /// the row in this season's table
    played: u16,
    won: u16,
    drawn: u16,
    lost: u16,
    goals_for: u16,
    goals_against: u16,
    points: u16,
    /// whether the entry fee for this season was paid, which decides a claim on the prize pool
    entry_paid: bool,
    /// the lineup sealed for a matchday, and the one revealed
    seal: vector<u8>,
    seal_week: u16,
    current: Option<Lineup>,
    current_week: u16,
    /// the last lineup actually played, which stands in for anyone who reveals nothing
    last_played: Option<Lineup>,
}

public fun new(num: u32, name: String, level: u8, series: u16, balance: u64, ctx: &mut TxContext): Club {
    Club {
        id: object::new(ctx),
        num, name, level, series,
        squad: vector::empty(),
        balance,
        owner: option::none(),
        coach: option::none(),
        last_pos: 0,
        played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0,
        entry_paid: false,
        seal: vector::empty(),
        seal_week: 0,
        current: option::none(),
        current_week: 0,
        last_played: option::none(),
    }
}

// ---------- reading ----------

public fun num(c: &Club): u32 { c.num }
public fun name(c: &Club): &String { &c.name }
public fun level(c: &Club): u8 { c.level }
public fun series(c: &Club): u16 { c.series }
public fun balance(c: &Club): u64 { c.balance }
public fun squad(c: &Club): &vector<Player> { &c.squad }
public fun squad_size(c: &Club): u64 { c.squad.length() }
public fun owner(c: &Club): Option<address> { c.owner }
public fun coach(c: &Club): Option<address> { c.coach }
public fun points(c: &Club): u16 { c.points }
public fun played(c: &Club): u16 { c.played }
public fun goals_for(c: &Club): u16 { c.goals_for }
public fun goals_against(c: &Club): u16 { c.goals_against }
public fun last_pos(c: &Club): u8 { c.last_pos }
public fun entry_paid(c: &Club): bool { c.entry_paid }

/// nobody runs it: free to be given to a newcomer or sold to a buyer
public fun is_free(c: &Club): bool { c.owner.is_none() && c.coach.is_none() }

/// whoever is allowed to pick the team here
public fun runs_it(c: &Club, who: address): bool {
    (c.coach.is_some() && *c.coach.borrow() == who) || (c.owner.is_some() && *c.owner.borrow() == who)
}

public fun find(c: &Club, num: u32): u64 {
    let mut i = 0;
    while (i < c.squad.length()) {
        if (player::num(&c.squad[i]) == num) return i;
        i = i + 1;
    };
    abort ENoSuchPlayer
}
public fun has_player(c: &Club, num: u32): bool {
    let mut i = 0;
    while (i < c.squad.length()) {
        if (player::num(&c.squad[i]) == num) return true;
        i = i + 1;
    };
    false
}
public fun player_at(c: &Club, i: u64): &Player { &c.squad[i] }

// ---------- the club's own doing ----------

public(package) fun add_player(c: &mut Club, p: Player) { c.squad.push_back(p) }
public(package) fun take_player(c: &mut Club, num: u32): Player { let i = find(c, num); c.squad.remove(i) }
public(package) fun player_mut(c: &mut Club, i: u64): &mut Player { &mut c.squad[i] }

public(package) fun credit(c: &mut Club, amount: u64) { c.balance = c.balance + amount }
public(package) fun debit(c: &mut Club, amount: u64) {
    assert!(c.balance >= amount, ETooPoor);
    c.balance = c.balance - amount;
}

public(package) fun set_owner(c: &mut Club, who: Option<address>) { c.owner = who }
public(package) fun set_coach(c: &mut Club, who: Option<address>) { c.coach = who }
public(package) fun set_entry_paid(c: &mut Club, paid: bool) { c.entry_paid = paid }
public(package) fun set_level(c: &mut Club, level: u8, series: u16) { c.level = level; c.series = series }

/// what a matchday does to the row
public(package) fun record(c: &mut Club, scored: u16, conceded: u16) {
    c.played = c.played + 1;
    c.goals_for = c.goals_for + scored;
    c.goals_against = c.goals_against + conceded;
    if (scored > conceded) { c.won = c.won + 1; c.points = c.points + 3 }
    else if (scored == conceded) { c.drawn = c.drawn + 1; c.points = c.points + 1 }
    else { c.lost = c.lost + 1 }
}

/// a new season: the row is wiped and where the club finished is remembered
public(package) fun new_season(c: &mut Club, finished: u8) {
    c.last_pos = finished;
    c.played = 0; c.won = 0; c.drawn = 0; c.lost = 0;
    c.goals_for = 0; c.goals_against = 0; c.points = 0;
    c.entry_paid = false;
    c.seal = vector::empty(); c.seal_week = 0;
    c.current = option::none(); c.current_week = 0;
}

// ---------- the lineup, sealed and then shown ----------

/// Before the deadline: publish the seal and nothing else. Whether the deadline has passed is the
/// league's business, which is why a time is not read here.
public(package) fun put_seal(c: &mut Club, who: address, week: u16, seal: vector<u8>) {
    assert!(runs_it(c, who), ENotYours);
    c.seal = seal;
    c.seal_week = week;
}

/// After it: show the lineup and the number, and let the contract itself check them.
public(package) fun reveal(c: &mut Club, who: address, week: u16, l: Lineup, salt: u64) {
    assert!(runs_it(c, who), ENotYours);
    assert!(c.seal_week == week && c.seal.length() == 32, ENoSeal);
    assert!(lineup::matches(&l, salt, &c.seal), ESealMismatch);
    assert!(all_in_squad(c, &l), ENotInSquad);
    c.current = option::some(l);
    c.current_week = week;
}

/// every name on the sheet has to be a player this club actually holds
fun all_in_squad(c: &Club, l: &Lineup): bool {
    let xi = lineup::xi(l);
    let mut i = 0;
    while (i < xi.length()) { if (!has_player(c, xi[i])) return false; i = i + 1; };
    let b = lineup::bench(l);
    let mut j = 0;
    while (j < b.length()) { if (!has_player(c, b[j])) return false; j = j + 1; };
    true
}

/// What the club puts out this matchday: what it revealed, or failing that the last team it played.
/// Revealing nothing is simply not turning up to change anything, not a way to field a better side.
public fun team_for(c: &Club, week: u16): Option<Lineup> {
    if (c.current_week == week && c.current.is_some()) c.current
    else c.last_played
}

public(package) fun remember_team(c: &mut Club, l: Lineup) { c.last_played = option::some(l) }

public fun has_sealed(c: &Club, week: u16): bool { c.seal_week == week && c.seal.length() == 32 }
public fun has_revealed(c: &Club, week: u16): bool { c.current_week == week && c.current.is_some() }

#[test_only]
public fun share_for_testing(c: Club) { transfer::share_object(c) }
