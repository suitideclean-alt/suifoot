/// The end of a season: the order of the table, and who goes up and down because of it.
#[test_only]
module suifoot::season_tests;

use suifoot::club::{Self, Club};
use suifoot::season;
use suifoot::world;

/// a club with a season's record already on it
fun with_record(num: u32, level: u8, wins: u16, draws: u16, losses: u16, gf: u16, ga: u16, ctx: &mut TxContext): Club {
    let mut c = world::new_club(num, level, 0, 1, ctx);
    let mut i = 0;
    while (i < wins) { club::record(&mut c, 1, 0); i = i + 1; };
    let mut j = 0;
    while (j < draws) { club::record(&mut c, 0, 0); j = j + 1; };
    let mut k = 0;
    while (k < losses) { club::record(&mut c, 0, 1); k = k + 1; };
    // then put the goals where the test wants them
    club::set_goals_for_testing(&mut c, gf, ga);
    c
}

#[test]
fun points_decide_first_and_goal_difference_second() {
    let mut ctx = tx_context::dummy();
    let mut st = season::open_for_testing(1, 0, 2, 2, 2, &mut ctx);

    let a = with_record(10, 2, 5, 0, 0, 10, 2, &mut ctx);  // 15 points, +8
    let b = with_record(11, 2, 5, 0, 0, 20, 2, &mut ctx);  // 15 points, +18
    let c = with_record(12, 2, 4, 0, 1, 30, 0, &mut ctx);  // 12 points, +30 and still third
    let d = with_record(13, 2, 0, 0, 5, 0, 20, &mut ctx);  // nothing

    season::submit(&mut st, &a);
    season::submit(&mut st, &b);
    season::submit(&mut st, &c);
    season::submit(&mut st, &d);
    season::settle(&mut st, &ctx);

    assert!(season::club_at(&st, 0) == 11, 0); // the better goal difference of the two on fifteen
    assert!(season::club_at(&st, 1) == 10, 1);
    assert!(season::club_at(&st, 2) == 12, 2); // thirty goals do not buy a place above more points
    assert!(season::club_at(&st, 3) == 13, 3);

    club::destroy_for_testing(a); club::destroy_for_testing(b);
    club::destroy_for_testing(c); club::destroy_for_testing(d);
    season::destroy_for_testing(st);
}

#[test]
fun two_clubs_level_on_everything_are_split_by_their_number() {
    let mut ctx = tx_context::dummy();
    let mut st = season::open_for_testing(1, 0, 2, 1, 1, &mut ctx);
    let later = with_record(20, 2, 3, 0, 0, 7, 3, &mut ctx);
    let earlier = with_record(5, 2, 3, 0, 0, 7, 3, &mut ctx);

    season::submit(&mut st, &later);   // reported in first
    season::submit(&mut st, &earlier);
    season::settle(&mut st, &ctx);

    // the order is settled by the clubs, not by who happened to report first
    assert!(season::club_at(&st, 0) == 5, 0);
    assert!(season::club_at(&st, 1) == 20, 1);

    club::destroy_for_testing(later); club::destroy_for_testing(earlier);
    season::destroy_for_testing(st);
}

#[test]
fun the_top_two_go_up_and_the_bottom_two_go_down() {
    let mut ctx = tx_context::dummy();
    let mut st = season::open_for_testing(1, 0, 2, 2, 2, &mut ctx);

    let mut clubs = vector::empty<Club>();
    let mut i = 0u32;
    while (i < 6) {
        // the lower the number, the better the season
        clubs.push_back(with_record(100 + i, 2, (6 - (i as u16)), 0, (i as u16), 10 - (i as u16), (i as u16), &mut ctx));
        i = i + 1;
    };
    let mut k = 0;
    while (k < 6) { season::submit(&mut st, &clubs[k]); k = k + 1; };
    season::settle(&mut st, &ctx);

    let mut m = 0;
    while (m < 6) { season::apply_to(&st, &mut clubs[m], 1, 5); m = m + 1; };

    assert!(club::level(&clubs[0]) == 1, 0); // champions, up a level
    assert!(club::level(&clubs[1]) == 1, 1);
    assert!(club::level(&clubs[2]) == 2, 2); // and the middle stays where it was
    assert!(club::level(&clubs[3]) == 2, 3);
    assert!(club::level(&clubs[4]) == 3, 4); // the last two drop
    assert!(club::level(&clubs[5]) == 3, 5);

    assert!(club::last_pos(&clubs[0]) == 1, 6);
    assert!(club::last_pos(&clubs[5]) == 6, 7);
    assert!(club::played(&clubs[0]) == 0, 8);  // and the new season starts clean
    assert!(club::points(&clubs[0]) == 0, 9);

    while (!clubs.is_empty()) { club::destroy_for_testing(clubs.pop_back()); };
    clubs.destroy_empty();
    season::destroy_for_testing(st);
}

#[test]
fun nobody_is_promoted_out_of_the_top_level() {
    let mut ctx = tx_context::dummy();
    // the first division: nowhere above it, so nothing is promoted and only the last club drops
    let mut st = season::open_for_testing(1, 0, 0, 0, 1, &mut ctx);
    let mut champion = with_record(1, 0, 10, 0, 0, 25, 4, &mut ctx);
    let mut second = with_record(2, 0, 7, 0, 3, 18, 10, &mut ctx);
    let mut third = with_record(3, 0, 4, 0, 6, 11, 17, &mut ctx);
    let mut bottom = with_record(4, 0, 0, 0, 10, 3, 28, &mut ctx);

    season::submit(&mut st, &champion);
    season::submit(&mut st, &second);
    season::submit(&mut st, &third);
    season::submit(&mut st, &bottom);
    season::settle(&mut st, &ctx);
    season::apply_to(&st, &mut champion, 0, 1);
    season::apply_to(&st, &mut second, 0, 1);
    season::apply_to(&st, &mut third, 0, 1);
    season::apply_to(&st, &mut bottom, 0, 1);

    assert!(club::level(&champion) == 0, 0); // there is nowhere above the first division
    assert!(club::last_pos(&champion) == 1, 1);
    assert!(club::level(&second) == 0, 2);
    assert!(club::level(&bottom) == 1, 3);   // but there is somewhere below it
    assert!(club::last_pos(&bottom) == 4, 4);

    club::destroy_for_testing(champion); club::destroy_for_testing(second);
    club::destroy_for_testing(third); club::destroy_for_testing(bottom);
    season::destroy_for_testing(st);
}

#[test]
fun finishing_in_the_bottom_half_is_what_puts_a_club_up_for_sale_next_season() {
    use suifoot::league;
    use suifoot::market;
    let mut ctx = tx_context::dummy();
    let l = league::new(1795046400000, vector[720, 1200], 22, &mut ctx);
    let half = (league::series_size(&l) / 2) as u64; // a series of twelve, so the sixth is the line
    let mut st = season::open_for_testing(1, 0, 2, 0, 0, &mut ctx);

    let mut clubs = vector::empty<Club>();
    let mut i = 0u32;
    while (i < 18) {
        clubs.push_back(with_record(300 + i, 2, (18 - (i as u16)), 0, (i as u16), 20 - (i as u16), (i as u16), &mut ctx));
        i = i + 1;
    };
    let mut k = 0;
    while (k < 18) { season::submit(&mut st, &clubs[k]); k = k + 1; };
    season::settle(&mut st, &ctx);
    let mut m = 0;
    while (m < 18) { season::apply_to(&st, &mut clubs[m], 1, 3); m = m + 1; };

    assert!(!market::in_bottom_half(&l, &clubs[0]), 0);              // champions: not for sale
    assert!(!market::in_bottom_half(&l, &clubs[half - 1]), 1);       // the last of the top half: still not
    assert!(market::in_bottom_half(&l, &clubs[half]), 2);            // the first of the bottom half: for sale
    assert!(market::in_bottom_half(&l, &clubs[17]), 3);              // and last of all, certainly
    league::destroy_for_testing(l);

    while (!clubs.is_empty()) { club::destroy_for_testing(clubs.pop_back()); };
    clubs.destroy_empty();
    season::destroy_for_testing(st);
}
