/// Who plays whom, on which matchday.
///
/// Without this the contract can play two clubs against each other but has no idea whether they were
/// supposed to meet today. That is not a season, it is a pile of friendlies - and it is also a hole:
/// anybody could pick the two clubs whose result suited them and run that one.
///
/// So the fixtures are worked out rather than stored. Twelve clubs in a round robin is the oldest
/// arrangement there is: one club stands still and the rest rotate past it, and after eleven
/// matchdays everyone has met everyone. Then it runs again with the grounds swapped, which is
/// twenty-two matchdays and a season.
///
/// Nothing is written down because nothing needs to be: given the clubs in a series and the matchday,
/// the answer is the same for everyone who asks, for ever.
module suifoot::fixtures;

#[error]
const EOddSeries: vector<u8> = b"a series needs an even number of clubs to be paired off";
#[error]
const ENoSuchWeek: vector<u8> = b"that matchday is not in the season";

/// how many matchdays a season of this many clubs takes: everyone meets everyone, twice
public fun weeks_for(clubs: u64): u64 {
    if (clubs < 2) 0 else (clubs - 1) * 2
}

/// how many matches are played on one matchday
public fun matches_per_week(clubs: u64): u64 { clubs / 2 }

/// The pairs for one matchday, home club first.
///
/// `week` counts from one. The first half of the season gives everyone a home match and an away
/// match in turn; the second half is the same again with the grounds the other way round.
public fun pairs(roster: &vector<u32>, week: u64): vector<vector<u32>> {
    let n = roster.length();
    assert!(n % 2 == 0, EOddSeries);
    let rounds = n - 1;
    assert!(week >= 1 && week <= rounds * 2, ENoSuchWeek);

    let r = week - 1;
    let back = r >= rounds;       // the second time round, the grounds swap
    let turn = r % rounds;

    // one club stands still and the others rotate past it
    let mut arranged = vector[roster[0]];
    let mut i = 1;
    while (i < n) {
        arranged.push_back(roster[1 + ((i - 1 + turn) % rounds)]);
        i = i + 1;
    };

    let mut out = vector[];
    let mut k = 0;
    while (k < n / 2) {
        let a = arranged[k];
        let b = arranged[n - 1 - k];
        // the club that stands still would otherwise be at home every week, so its match alternates
        let flip = (k == 0 && turn % 2 == 1) != back;
        out.push_back(if (flip) vector[b, a] else vector[a, b]);
        k = k + 1;
    };
    out
}

/// Is this the fixture for this matchday? Anybody can ask, and the answer does not depend on who.
public fun is_fixture(roster: &vector<u32>, week: u64, home: u32, away: u32): bool {
    let ps = pairs(roster, week);
    let mut i = 0;
    while (i < ps.length()) {
        if (ps[i][0] == home && ps[i][1] == away) return true;
        i = i + 1;
    };
    false
}

/// which matchday of the season a club's next match is, counting from one
public fun opponent_of(roster: &vector<u32>, week: u64, club: u32): (bool, u32, bool) {
    let ps = pairs(roster, week);
    let mut i = 0;
    while (i < ps.length()) {
        if (ps[i][0] == club) return (true, ps[i][1], true);   // found, who, at home
        if (ps[i][1] == club) return (true, ps[i][0], false);
        i = i + 1;
    };
    (false, 0, false)
}
