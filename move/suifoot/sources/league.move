/// The season, the clock everyone shares, and the matchday itself.
///
/// Offline a season is a list of weeks and nothing more. Online every matchday needs an hour the
/// whole world agrees on, and three moments inside it:
///
///   T-30  lineups stop being accepted. Up to here you publish only a seal.
///   T-15  the window to show your lineup closes. Nobody can still be deciding after this.
///   T     the whistle. Only now is the random number drawn, so neither manager could have known it
///         while there was still anything he could change.
///
/// That order is the whole reason the game can be played between strangers for money. Draw the
/// number any earlier and whoever saw it first would know whether to turn up.
module suifoot::league;

use sui::clock::{Self, Clock};
use sui::event;
use sui::random::{Self, Random};
use suifoot::club::{Self, Club};
use suifoot::lineup::{Self, Lineup};
use suifoot::match_play::{Self, Result};
use suifoot::money;
use suifoot::progress;
use suifoot::player::Player;

const DAY: u64 = 86400000;
const MIN: u64 = 60000;

const OPEN: u8 = 0;
const LOCKED: u8 = 1;
const DRAWN: u8 = 2;
const PLAYED: u8 = 3;

#[error]
const ETooLate: vector<u8> = b"lineups for this matchday are closed";
#[error]
const ETooEarly: vector<u8> = b"this matchday has not kicked off yet";
#[error]
const ENotYet: vector<u8> = b"it is not time to show a lineup yet";
#[error]
const EAlreadyPlayed: vector<u8> = b"one of these clubs has already played this matchday";
#[error]
const ESameClub: vector<u8> = b"a club cannot play itself";
#[error]
const ENotAdmin: vector<u8> = b"only the league may do that";
#[error]
const EWrongWeek: vector<u8> = b"that is not the matchday being played";

public struct League has key {
    id: UID,
    season: u16,
    week: u16,
    /// midnight UTC of the first matchday
    t0: u64,
    /// the hours a matchday is played at, in minutes past midnight UTC, in order
    kickoffs: vector<u64>,
    days_per_week: u64,
    lock_before: u64,
    draw_before: u64,
    weeks_in_season: u16,
    admin: address,
    /// which level is the foot of the pyramid, where newcomers start
    bottom_level: u8,
    /// the free clubs at that foot, so a newcomer can be given one without the chain having to go
    /// looking for them: a shared object cannot be searched for, only handed over
    free_at_foot: vector<ID>,
}

/// what the browser listens for: everything it needs to replay the ninety minutes it did not watch
public struct MatchPlayed has copy, drop {
    season: u16,
    week: u16,
    home: u32,
    away: u32,
    home_goals: u8,
    away_goals: u8,
    seed: u32,
}

public fun new(t0_ms: u64, kickoffs: vector<u64>, weeks_in_season: u16, ctx: &mut TxContext): League {
    League {
        id: object::new(ctx),
        season: 1,
        week: 1,
        t0: (t0_ms / DAY) * DAY, // snapped to midnight, so a season never starts mid-day
        kickoffs,
        days_per_week: 1,
        lock_before: 30,
        draw_before: 15,
        weeks_in_season,
        admin: ctx.sender(),
        bottom_level: 3,
        free_at_foot: vector::empty(),
    }
}

entry fun create(t0_ms: u64, kickoffs: vector<u64>, weeks_in_season: u16, bottom_level: u8, ctx: &mut TxContext) {
    let mut l = new(t0_ms, kickoffs, weeks_in_season, ctx);
    l.bottom_level = bottom_level;
    transfer::share_object(l);
}

public fun share(l: League) { transfer::share_object(l) }

public fun season(l: &League): u16 { l.season }
public fun admin(l: &League): address { l.admin }
public fun bottom_level(l: &League): u8 { l.bottom_level }
public fun free_at_foot(l: &League): u64 { l.free_at_foot.length() }

/// A club at the foot that nobody runs goes on the list newcomers are drawn from.
public(package) fun register_free(l: &mut League, id: ID) {
    if (!l.free_at_foot.contains(&id)) l.free_at_foot.push_back(id);
}

/// and comes off it the moment somebody takes it
public(package) fun forget_free(l: &mut League, id: &ID) {
    let (found, i) = l.free_at_foot.index_of(id);
    if (found) { l.free_at_foot.remove(i); };
}

public(package) fun free_at(l: &League, i: u64): ID { l.free_at_foot[i] }
public fun week(l: &League): u16 { l.week }
public fun t0(l: &League): u64 { l.t0 }

// ---------- the clock ----------

/// when the whistle goes for a matchday, counting from one
public fun kickoff_at(l: &League, week: u16): u64 {
    let slots = l.kickoffs.length();
    let w = (week as u64) - 1;
    let day = (w / slots) * l.days_per_week;
    l.t0 + day * DAY + l.kickoffs[w % slots] * MIN
}
public fun lock_at(l: &League, week: u16): u64 { kickoff_at(l, week) - l.lock_before * MIN }
public fun draw_at(l: &League, week: u16): u64 { kickoff_at(l, week) - l.draw_before * MIN }

public fun phase_at(l: &League, week: u16, now: u64): u8 {
    if (now >= kickoff_at(l, week)) PLAYED
    else if (now >= draw_at(l, week)) DRAWN
    else if (now >= lock_at(l, week)) LOCKED
    else OPEN
}
public fun open(): u8 { OPEN }
public fun locked(): u8 { LOCKED }
public fun drawn(): u8 { DRAWN }
public fun played(): u8 { PLAYED }

// ---------- what a manager does ----------

/// Before the deadline: publish the seal of your lineup and nothing else.
public fun commit(l: &League, c: &mut Club, week: u16, seal: vector<u8>, clock: &Clock, ctx: &TxContext) {
    assert!(phase_at(l, week, clock::timestamp_ms(clock)) == OPEN, ETooLate);
    club::put_seal(c, ctx.sender(), week, seal);
}

/// After it: show the lineup and your number. The contract checks them against the seal itself, so
/// nobody has to be trusted and nobody has to be watching.
public fun reveal(
    l: &League, c: &mut Club, week: u16,
    xi: vector<u32>, bench: vector<u32>, tactic: u8, salt: u64,
    clock: &Clock, ctx: &TxContext,
) {
    let now = clock::timestamp_ms(clock);
    assert!(now >= lock_at(l, week), ENotYet);
    assert!(now < draw_at(l, week), ETooLate);
    club::reveal(c, ctx.sender(), week, lineup::new(xi, bench, tactic), salt);
}

// ---------- the matchday ----------

/// Play a fixture.
///
/// Anyone may call this once the whistle has gone - it takes no side and needs no permission, so a
/// season does not stop because the people who run it were asleep. The random number is drawn here
/// and nowhere earlier. This is an entry function on purpose: that is what stops it being wrapped in
/// a larger transaction that looks at the result and throws the whole thing away if it does not like
/// it, which would turn one draw into as many as somebody cared to pay for.
entry fun play_fixture(
    l: &League, home: &mut Club, away: &mut Club, r: &Random, clock: &Clock, ctx: &mut TxContext,
) {
    assert!(club::num(home) != club::num(away), ESameClub);
    let week = l.week;
    assert!(phase_at(l, week, clock::timestamp_ms(clock)) == PLAYED, ETooEarly);
    assert!(club::last_week(home) < week && club::last_week(away) < week, EAlreadyPlayed);

    let mut gen = random::new_generator(r, ctx);
    let seed = random::generate_u32(&mut gen);

    let (h_xi, h_bench, h_tac) = team_of(home, week);
    let (a_xi, a_bench, a_tac) = team_of(away, week);
    let h_nums = numbers_of(&h_xi);
    let a_nums = numbers_of(&a_xi);

    let result = match_play::play(h_xi, h_bench, h_tac, 0, a_xi, a_bench, a_tac, 0, seed);
    let hg = match_play::home_goals(&result);
    let ag = match_play::away_goals(&result);

    club::record(home, (hg as u16), (ag as u16));
    club::record(away, (ag as u16), (hg as u16));
    club::set_last_week(home, week);
    club::set_last_week(away, week);
    money::collect_gate(home, false); // the home club takes the gate; the away club takes nothing
    mark_the_players(home, away, &h_nums, &a_nums, &result);

    event::emit(MatchPlayed {
        season: l.season, week,
        home: club::num(home), away: club::num(away),
        home_goals: hg, away_goals: ag, seed,
    });
}

fun numbers_of(xi: &vector<Player>): vector<u32> {
    let mut out = vector[];
    let mut i = 0;
    while (i < xi.length()) { out.push_back(suifoot::player::num(&xi[i])); i = i + 1; };
    out
}

/// What the ninety minutes did to the men who played them.
///
/// Whoever started is credited with the game and comes off it tired; whoever came on is credited too
/// and comes off it less tired. Whoever scored has it on his name. Without this a season would be
/// played by men who end it exactly as they began it.
fun mark_the_players(
    home: &mut Club, away: &mut Club,
    h_start: &vector<u32>, a_start: &vector<u32>,
    result: &Result,
) {
    let mut h_played = *h_start;
    let mut a_played = *a_start;
    let h_started = h_start.length();
    let a_started = a_start.length();

    let events = match_play::events(result);
    let mut i = 0;
    while (i < events.length()) {
        let e = &events[i];
        let kind = match_play::ev_kind(e);
        let who = match_play::ev_who(e);
        if (kind == match_play::sub()) {
            if (match_play::ev_side(e) == HOME) h_played.push_back(who) else a_played.push_back(who);
        } else if (kind == match_play::goal()) {
            if (match_play::ev_side(e) == HOME) progress::scored(home, who) else progress::scored(away, who);
        };
        i = i + 1;
    };

    progress::played_match(home, &h_played, h_started);
    progress::played_match(away, &a_played, a_started);
}

/// What a club actually puts out: what it showed for this matchday, failing that the last team it
/// played, and failing that the best eleven in the squad. A manager who never turns up still has a
/// team on the pitch, because the rest of the league has a season to get through.
fun team_of(c: &Club, week: u16): (vector<suifoot::player::Player>, vector<suifoot::player::Player>, u8) {
    let team = club::team_for(c, week);
    if (team.is_some()) {
        let l: Lineup = *team.borrow();
        let (xi, bench) = club::team_players(c, &l);
        if (xi.length() == 11) return (xi, bench, lineup::tactic(&l))
    };
    let (xi, bench) = club::best_eleven(c);
    (xi, bench, lineup::bal())
}

/// The week's books for one club: wages and upkeep out, television and the sponsor in. One club at a
/// time, so a league of any size is still a string of small transactions rather than one huge one.
public fun settle_week(l: &League, c: &mut Club, ctx: &TxContext) {
    assert!(ctx.sender() == l.admin, ENotAdmin);
    money::settle_week(c);
}

/// A week of training: legs come back by as much as the week allowed them to. A club nobody runs
/// has its training picked for it, by how worn its first team looks.
public fun train(l: &League, c: &mut Club, ctx: &TxContext) {
    assert!(ctx.sender() == l.admin, ENotAdmin);
    if (club::is_free(c)) progress::choose_training(c);
    progress::train_week(c);
}

/// the matchday is over and the next one begins
public fun advance(l: &mut League, ctx: &TxContext) {
    assert!(ctx.sender() == l.admin, ENotAdmin);
    l.week = l.week + 1;
}

/// A year older for everybody at one club, and the academy sends up what it has. One club at a
/// time, because a league turning over at once would be a transaction nobody could afford.
entry fun turn_season(l: &League, c: &mut Club, r: &sui::random::Random, ctx: &mut TxContext) {
    assert!(ctx.sender() == l.admin, ENotAdmin);
    let mut gen = sui::random::new_generator(r, ctx);
    progress::season_turn(c, sui::random::generate_u32(&mut gen));
}

public fun start_next_season(l: &mut League, ctx: &TxContext) {
    assert!(ctx.sender() == l.admin, ENotAdmin);
    l.season = l.season + 1;
    l.week = 1;
    l.t0 = l.t0 + ((l.weeks_in_season as u64) / l.kickoffs.length()) * l.days_per_week * DAY;
}

#[test_only]
public fun play_for_testing(
    l: &League, home: &mut Club, away: &mut Club, seed: u32,
): (u8, u8) {
    let week = l.week;
    let (h_xi, h_bench, h_tac) = team_of(home, week);
    let (a_xi, a_bench, a_tac) = team_of(away, week);
    let h_nums = numbers_of(&h_xi);
    let a_nums = numbers_of(&a_xi);
    let result = match_play::play(h_xi, h_bench, h_tac, 0, a_xi, a_bench, a_tac, 0, seed);
    let hg = match_play::home_goals(&result);
    let ag = match_play::away_goals(&result);
    club::record(home, (hg as u16), (ag as u16));
    club::record(away, (ag as u16), (hg as u16));
    club::set_last_week(home, week);
    club::set_last_week(away, week);
    money::collect_gate(home, false);
    mark_the_players(home, away, &h_nums, &a_nums, &result);
    (hg, ag)
}

#[test_only]
public fun destroy_for_testing(l: League) {
    let League { id, season: _, week: _, t0: _, kickoffs: _, days_per_week: _, lock_before: _,
        draw_before: _, weeks_in_season: _, admin: _, bottom_level: _, free_at_foot: _ } = l;
    id.delete();
}
