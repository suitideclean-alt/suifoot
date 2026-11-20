/// Ending a season: working out the table, and moving clubs up and down.
///
/// This is the one job that genuinely needs to see a whole series at once, and a club is its own
/// object precisely so that nothing else does. So it is done in three steps rather than one
/// transaction holding eighteen clubs:
///
///   1. each club is submitted, and only its row is copied in - six numbers
///   2. the rows are put in order once
///   3. each club is handed back its finishing position, and moved up or down
///
/// The table object is written to eighteen times at the end of a season and never touched during
/// one, so it is not in the way of anything. Matches never go near it.
module suifoot::season;

use suifoot::club::{Self, Club};
use suifoot::league::{Self, League};

#[error]
const ENotAdmin: vector<u8> = b"only the league may settle a season";
#[error]
const EAlreadyIn: vector<u8> = b"that club is already in this table";
#[error]
const ENotSettled: vector<u8> = b"the table has not been put in order yet";
#[error]
const EAlreadySettled: vector<u8> = b"this table is settled and takes no more clubs";
#[error]
const ENotInTable: vector<u8> = b"that club is not in this table";
#[error]
const EWrongSeries: vector<u8> = b"that club does not play in this series";

public struct Row has copy, drop, store {
    club: u32,
    points: u16,
    goals_for: u16,
    goals_against: u16,
    played: u16,
}

public struct Standings has key {
    id: UID,
    season: u16,
    series: u16,
    level: u8,
    /// how many climb out of this series, and how many drop out of it
    promote: u64,
    relegate: u64,
    rows: vector<Row>,
    settled: bool,
    admin: address,
}

public fun season(s: &Standings): u16 { s.season }
public fun series(s: &Standings): u16 { s.series }
public fun settled(s: &Standings): bool { s.settled }
public fun size(s: &Standings): u64 { s.rows.length() }
public fun club_at(s: &Standings, i: u64): u32 { s.rows[i].club }
public fun points_at(s: &Standings, i: u64): u16 { s.rows[i].points }

entry fun open_table(l: &League, series: u16, level: u8, promote: u64, relegate: u64, ctx: &mut TxContext) {
    assert!(ctx.sender() == league::admin(l), ENotAdmin);
    transfer::share_object(Standings {
        id: object::new(ctx),
        season: league::season(l),
        series, level, promote, relegate,
        rows: vector::empty(),
        settled: false,
        admin: ctx.sender(),
    });
}

/// Step one: a club reports in. Anyone may submit any club - there is nothing to gain by it, since
/// the numbers are read off the club itself and a club cannot be entered twice.
public fun submit(s: &mut Standings, c: &Club) {
    assert!(!s.settled, EAlreadySettled);
    assert!(club::series(c) == s.series, EWrongSeries);
    assert!(!holds(s, club::num(c)), EAlreadyIn);
    s.rows.push_back(Row {
        club: club::num(c),
        points: club::points(c),
        goals_for: club::goals_for(c),
        goals_against: club::goals_against(c),
        played: club::played(c),
    });
}

fun holds(s: &Standings, num: u32): bool {
    let mut i = 0;
    while (i < s.rows.length()) { if (s.rows[i].club == num) return true; i = i + 1; };
    false
}

/// Step two: put them in order. Points first, then goal difference, then goals scored, and finally
/// the club number, so that two clubs level on everything still have a settled order rather than one
/// that depends on who reported in first.
public fun settle(s: &mut Standings, ctx: &TxContext) {
    assert!(ctx.sender() == s.admin, ENotAdmin);
    assert!(!s.settled, EAlreadySettled);
    let n = s.rows.length();
    let mut i = 1;
    while (i < n) { // insertion sort: eighteen rows, once a season
        let mut j = i;
        while (j > 0 && above(&s.rows[j], &s.rows[j - 1])) {
            s.rows.swap(j, j - 1);
            j = j - 1;
        };
        i = i + 1;
    };
    s.settled = true;
}

fun above(a: &Row, b: &Row): bool {
    if (a.points != b.points) return a.points > b.points;
    let a_diff = (a.goals_for as u64) + 1000 - (a.goals_against as u64); // kept positive, since these are unsigned
    let b_diff = (b.goals_for as u64) + 1000 - (b.goals_against as u64);
    if (a_diff != b_diff) return a_diff > b_diff;
    if (a.goals_for != b.goals_for) return a.goals_for > b.goals_for;
    a.club < b.club
}

/// where a club came, counting from one
public fun position_of(s: &Standings, num: u32): u8 {
    let mut i = 0;
    while (i < s.rows.length()) { if (s.rows[i].club == num) return ((i + 1) as u8); i = i + 1; };
    abort ENotInTable
}

/// Step three: the club is told where it finished and moved if it has to be. Its table is wiped for
/// the new season at the same time, which is also what makes it buyable or not for the year ahead.
public fun apply_to(s: &Standings, c: &mut Club, up_to: u16, down_to: u16) {
    assert!(s.settled, ENotSettled);
    assert!(club::series(c) == s.series, EWrongSeries);
    let pos = position_of(s, club::num(c));
    let n = s.rows.length();

    if ((pos as u64) <= s.promote && s.level > 0) {
        club::set_level(c, s.level - 1, up_to);
    } else if ((pos as u64) > n - s.relegate) {
        club::set_level(c, s.level + 1, down_to);
    };
    club::new_season(c, pos);
}
