/// A season has to send everyone to everyone, twice, and nobody twice on the same day.
#[test_only]
module suifoot::fixtures_tests;

use suifoot::fixtures;

fun twelve(): vector<u32> { vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }

#[test]
fun a_season_is_everyone_against_everyone_twice() {
    assert!(fixtures::weeks_for(12) == 22, 0);
    assert!(fixtures::weeks_for(18) == 34, 1);
    assert!(fixtures::matches_per_week(12) == 6, 2);
}

#[test]
fun every_club_plays_once_on_every_matchday_and_never_itself() {
    let roster = twelve();
    let mut week = 1;
    while (week <= 22) {
        let ps = fixtures::pairs(&roster, week);
        assert!(ps.length() == 6, week);

        let mut seen = vector[];
        let mut i = 0;
        while (i < ps.length()) {
            let h = ps[i][0];
            let a = ps[i][1];
            assert!(h != a, week * 100 + i);              // nobody plays himself
            assert!(!seen.contains(&h), week * 100 + i);  // and nobody plays twice in a day
            assert!(!seen.contains(&a), week * 100 + i);
            seen.push_back(h);
            seen.push_back(a);
            i = i + 1;
        };
        assert!(seen.length() == 12, week);               // and nobody sits one out
        week = week + 1;
    };
}

#[test]
fun over_a_season_everyone_meets_everyone_once_at_home_and_once_away() {
    let roster = twelve();
    // count how many times each ordered pair comes up
    let mut home_counts = vector[];
    let mut i = 0;
    while (i < 144) { home_counts.push_back(0u64); i = i + 1; };

    let mut week = 1;
    while (week <= 22) {
        let ps = fixtures::pairs(&roster, week);
        let mut k = 0;
        while (k < ps.length()) {
            let h = (ps[k][0] as u64) - 1;
            let a = (ps[k][1] as u64) - 1;
            let at = h * 12 + a;
            *(&mut home_counts[at]) = home_counts[at] + 1;
            k = k + 1;
        };
        week = week + 1;
    };

    let mut h = 0;
    while (h < 12) {
        let mut a = 0;
        while (a < 12) {
            let n = home_counts[h * 12 + a];
            if (h == a) assert!(n == 0, h * 100 + a)       // never himself
            else assert!(n == 1, h * 100 + a);             // exactly once at his ground
            a = a + 1;
        };
        h = h + 1;
    };
}

#[test]
fun the_same_matchday_always_gives_the_same_fixtures() {
    let roster = twelve();
    let a = fixtures::pairs(&roster, 7);
    let b = fixtures::pairs(&roster, 7);
    assert!(a == b, 0);
    assert!(fixtures::pairs(&roster, 7) != fixtures::pairs(&roster, 8), 1);
}

#[test]
fun a_fixture_can_be_checked_by_anybody() {
    let roster = twelve();
    let ps = fixtures::pairs(&roster, 3);
    assert!(fixtures::is_fixture(&roster, 3, ps[0][0], ps[0][1]), 0);
    // the same two clubs the other way round is not this week's fixture
    assert!(!fixtures::is_fixture(&roster, 3, ps[0][1], ps[0][0]), 1);
    // nor is a pairing from another week
    let other = fixtures::pairs(&roster, 10);
    assert!(!fixtures::is_fixture(&roster, 3, other[0][0], other[0][1]), 2);
}

#[test]
fun a_club_can_find_out_who_it_plays_and_where() {
    let roster = twelve();
    let (found, who, at_home) = fixtures::opponent_of(&roster, 1, 1);
    assert!(found, 0);
    assert!(who != 1, 1);
    // and the other club says the same thing from its side
    let (found2, who2, at_home2) = fixtures::opponent_of(&roster, 1, who);
    assert!(found2 && who2 == 1, 2);
    assert!(at_home != at_home2, 3);

    let (missing, _, _) = fixtures::opponent_of(&roster, 1, 99);
    assert!(!missing, 4);
}

#[test, expected_failure(abort_code = fixtures::ENoSuchWeek)]
fun there_is_no_twenty_third_matchday() {
    fixtures::pairs(&twelve(), 23);
}

#[test, expected_failure(abort_code = fixtures::EOddSeries)]
fun an_odd_series_cannot_be_paired_off() {
    fixtures::pairs(&vector[1, 2, 3], 1);
}
