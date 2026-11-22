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
    /// how many people follow it, how many the ground holds, and what a ticket costs in cents
    fans: u32,
    capacity: u32,
    ticket_cents: u64,
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
    /// What the club pays whoever runs the team, and for how long.
    ///
    /// Only the terms two people had to agree on are kept: the wage, the length, and what a win
    /// pays. Everything that follows from them - what a dismissal costs, whether there was just
    /// cause, what is owed on the way out - is worked out from the same numbers by everybody, so
    /// writing it down would only be a second place for it to be wrong.
    ///
    /// `agreed` marks a wage two people settled on. A club nobody owns has nobody to settle with,
    /// so the job it offers pays what the game says such a club pays, and that is not a term
    /// anybody can dispute either.
    job: Option<Job>,
    /// A job put to somebody, which is theirs to take or leave. Held rather than emitted, because
    /// the contract has to be able to check it when they answer - an event it cannot read back.
    offer: Option<Offer>,
    /// Which league this club plays in.
    ///
    /// Not a convenience. Club numbers run from one inside each league, so two leagues both have a
    /// club number one, and a check that asks only "is this number on your list?" says yes to the
    /// wrong club. Anything taking a league and a club together has to be shown they belong to
    /// each other, and this is what shows it.
    league: ID,
    /// the lineup sealed for a matchday, and the one revealed
    seal: vector<u8>,
    seal_week: u16,
    current: Option<Lineup>,
    current_week: u16,
    /// the last lineup actually played, which stands in for anyone who reveals nothing
    last_played: Option<Lineup>,
    /// the last matchday this club actually played, so no fixture can be run through twice
    last_week: u16,
    /// how hard the week's training is: 0 light, 1 balanced, 2 hard
    training: u8,
}

public fun new(num: u32, name: String, level: u8, series: u16, balance: u64, league: ID, ctx: &mut TxContext): Club {
    new_with_ground(num, name, level, series, balance, 3000, 4500, 150, league, ctx)
}

public fun new_with_ground(
    num: u32, name: String, level: u8, series: u16, balance: u64,
    fans: u32, capacity: u32, ticket_cents: u64, league: ID, ctx: &mut TxContext,
): Club {
    Club {
        id: object::new(ctx),
        num, name, level, series,
        squad: vector::empty(),
        balance,
        fans, capacity, ticket_cents,
        owner: option::none(),
        coach: option::none(),
        last_pos: 0,
        played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0,
        entry_paid: false,
        job: option::none(),
        offer: option::none(),
        league,
        seal: vector::empty(),
        seal_week: 0,
        current: option::none(),
        current_week: 0,
        last_played: option::none(),
        last_week: 0,
        training: 1,
    }
}

// ---------- reading ----------

public fun num(c: &Club): u32 { c.num }
public fun name(c: &Club): &String { &c.name }
public fun level(c: &Club): u8 { c.level }
public fun series(c: &Club): u16 { c.series }
public fun balance(c: &Club): u64 { c.balance }
public fun fans(c: &Club): u32 { c.fans }
public fun capacity(c: &Club): u32 { c.capacity }
public fun ticket_cents(c: &Club): u64 { c.ticket_cents }
public(package) fun set_ticket_cents(c: &mut Club, cents: u64) { c.ticket_cents = cents }
public(package) fun set_fans(c: &mut Club, fans: u32) { c.fans = fans }

/// what the whole squad is paid in a week
public fun wage_bill(c: &Club): u64 {
    let mut total = 0;
    let mut i = 0;
    while (i < c.squad.length()) { total = total + player::wage(&c.squad[i]); i = i + 1; };
    total
}
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

/// what a club pays the person who picks its team
public struct Job has store, drop, copy {
    wage: u64,
    weeks: u16,
    win: u64,
    since: u16,
    agreed: bool,
}

/// a job put to somebody who has not answered yet
public struct Offer has store, drop, copy {
    to: address,
    wage: u64,
    weeks: u16,
    win: u64,
}

public fun job(c: &Club): Option<Job> { c.job }
public fun job_wage(j: &Job): u64 { j.wage }
public fun job_weeks(j: &Job): u16 { j.weeks }
public fun job_win(j: &Job): u64 { j.win }
public fun job_since(j: &Job): u16 { j.since }
public fun job_agreed(j: &Job): bool { j.agreed }

public fun offer(c: &Club): Option<Offer> { c.offer }
public fun offer_to(o: &Offer): address { o.to }
public fun offer_wage(o: &Offer): u64 { o.wage }
public fun offer_weeks(o: &Offer): u16 { o.weeks }
public fun offer_win(o: &Offer): u64 { o.win }

public(package) fun new_job(wage: u64, weeks: u16, win: u64, since: u16, agreed: bool): Job {
    Job { wage, weeks, win, since, agreed }
}
public(package) fun new_offer(to: address, wage: u64, weeks: u16, win: u64): Offer {
    Offer { to, wage, weeks, win }
}
public(package) fun set_job(c: &mut Club, j: Option<Job>) { c.job = j }
public(package) fun set_offer(c: &mut Club, o: Option<Offer>) { c.offer = o }

/// which league this club plays in, so that a league and a club can be shown to belong together
public fun league(c: &Club): ID { c.league }
public fun last_week(c: &Club): u16 { c.last_week }
public fun training(c: &Club): u8 { c.training }
public(package) fun set_training(c: &mut Club, mode: u8) { if (mode <= 2) c.training = mode }
public fun squad_mut(c: &mut Club): &mut vector<Player> { &mut c.squad }
public(package) fun drop_player_at(c: &mut Club, i: u64): Player { c.squad.remove(i) }
public(package) fun set_last_week(c: &mut Club, w: u16) { c.last_week = w }

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

/// The eleven and the bench as actual players, looked up out of the squad. A name on the sheet that
/// is no longer at the club - sold since, or injured out - is simply left out, and the engine plays
/// whoever is left; that is better than refusing to play the fixture at all.
public fun team_players(c: &Club, l: &Lineup): (vector<Player>, vector<Player>) {
    (collect(c, lineup::xi(l)), collect(c, lineup::bench(l)))
}

fun collect(c: &Club, nums: &vector<u32>): vector<Player> {
    let mut out = vector::empty<Player>();
    let mut i = 0;
    while (i < nums.length()) {
        let mut j = 0;
        while (j < c.squad.length()) {
            if (player::num(&c.squad[j]) == nums[i]) { out.push_back(c.squad[j]); break };
            j = j + 1;
        };
        i = i + 1;
    };
    out
}

/// whoever is fit and willing when nothing was sealed and nothing was ever played: the best eleven
/// the squad has, a keeper first and then down the list
public fun best_eleven(c: &Club): (vector<Player>, vector<Player>) {
    let mut xi = vector::empty<Player>();
    let mut bench = vector::empty<Player>();
    let mut taken = vector::empty<bool>();
    let n = c.squad.length();
    let mut i = 0;
    while (i < n) { taken.push_back(false); i = i + 1; };

    // a keeper above all, because an eleven without one is thrown away
    let mut k = 0;
    let mut best = 0u16;
    let mut got = false;
    while (k < n) {
        if (player::is_keeper(&c.squad[k])) {
            let o = player::ovr(&c.squad[k]);
            if (!got || o > best) { best = o; got = true; i = k };
        };
        k = k + 1;
    };
    if (got) { xi.push_back(c.squad[i]); *(&mut taken[i]) = true };

    // and then simply the best of the rest
    let mut filled = if (got) 1 else 0;
    while (filled < 18 && filled < n) {
        let mut pick = n;
        let mut pick_o = 0u16;
        let mut m = 0;
        while (m < n) {
            if (!taken[m]) {
                let o = player::ovr(&c.squad[m]);
                if (pick == n || o > pick_o) { pick = m; pick_o = o };
            };
            m = m + 1;
        };
        if (pick == n) break;
        *(&mut taken[pick]) = true;
        if (xi.length() < 11) xi.push_back(c.squad[pick]) else bench.push_back(c.squad[pick]);
        filled = filled + 1;
    };
    (xi, bench)
}

public fun has_sealed(c: &Club, week: u16): bool { c.seal_week == week && c.seal.length() == 32 }
public fun has_revealed(c: &Club, week: u16): bool { c.current_week == week && c.current.is_some() }

#[test_only]
public fun share_for_testing(c: Club) { transfer::share_object(c) }

#[test_only]
public fun set_goals_for_testing(c: &mut Club, gf: u16, ga: u16) { c.goals_for = gf; c.goals_against = ga }

#[test_only]
public fun destroy_for_testing(c: Club) {
    let Club { id, num: _, name: _, level: _, series: _, squad: _, balance: _, owner: _, coach: _,
        fans: _, capacity: _, ticket_cents: _, last_pos: _, played: _, won: _, drawn: _, lost: _, goals_for: _, goals_against: _, points: _,
        training: _, entry_paid: _, job: _, offer: _, league: _, seal: _, seal_week: _, current: _, current_week: _, last_played: _, last_week: _ } = c;
    id.delete();
}
