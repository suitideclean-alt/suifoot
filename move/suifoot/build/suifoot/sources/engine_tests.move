/// The four numbers below each come from running the same sums in JavaScript with the same
/// primitives, over eleven men whose ratings are written out here. They are what the contract has
/// to produce for that eleven, to the bit.
#[test_only]
module suifoot::engine_tests;

use suifoot::engine;
use suifoot::fx;
use suifoot::player::{Self, Player};

fun man(pos: u8, ovr: u16, cond: u8, mood: u8): Player {
    let mut p = player::new(1, pos, player::pro(), 25, ovr, ovr, 1000, 52);
    player::set_cond(&mut p, cond);
    player::set_mood(&mut p, mood);
    p
}
fun fresh(pos: u8, ovr: u16): Player { man(pos, ovr, 100, 70) }

fun ordinary(): vector<Player> {
    vector[
        fresh(player::gk(), 54),
        fresh(player::df(), 51), fresh(player::df(), 50), fresh(player::df(), 48), fresh(player::df(), 45),
        fresh(player::mf(), 54), fresh(player::mf(), 50), fresh(player::mf(), 47), fresh(player::mf(), 44),
        fresh(player::fw(), 52), fresh(player::fw(), 49),
    ]
}
fun starry(): vector<Player> {
    vector[
        fresh(player::gk(), 84),
        fresh(player::df(), 83), fresh(player::df(), 82), fresh(player::df(), 81), fresh(player::df(), 80),
        fresh(player::mf(), 70), fresh(player::mf(), 68), fresh(player::mf(), 66), fresh(player::mf(), 64),
        fresh(player::fw(), 62), fresh(player::fw(), 60),
    ]
}
fun no_keeper(): vector<Player> {
    vector[
        fresh(player::df(), 54),
        fresh(player::df(), 51), fresh(player::df(), 50), fresh(player::df(), 48), fresh(player::df(), 45),
        fresh(player::mf(), 54), fresh(player::mf(), 50), fresh(player::mf(), 47), fresh(player::mf(), 44),
        fresh(player::fw(), 52), fresh(player::fw(), 49),
    ]
}
fun starters(): vector<u64> { vector[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }

fun check(p: &engine::Power, gk: u64, ap: u64, dp: u64, mp: u64, code: u64) {
    assert!(fx::raw(&engine::gk(p)) == gk, code);
    assert!(fx::raw(&engine::ap(p)) == ap, code + 1);
    assert!(fx::raw(&engine::dp(p)) == dp, code + 2);
    assert!(fx::raw(&engine::mp(p)) == mp, code + 3);
}

#[test]
fun an_ordinary_side_balanced_and_fresh() {
    let p = engine::power(&ordinary(), &starters(), 0, 1, 0);
    check(&p, 231928233984, 213335546597, 208584291383, 209867720145, 0);
}

#[test]
fun going_forward_with_a_coach_who_knows_his_tactics() {
    let p = engine::power(&ordinary(), &starters(), 0, 0, 3);
    check(&p, 231928233984, 240770497834, 204892349352, 219311767487, 10);
}

#[test]
fun sitting_back_late_in_the_game_when_legs_have_gone() {
    let p = engine::power(&ordinary(), &starters(), 70, 2, 0);
    check(&p, 228983113554, 193559192057, 220033912933, 206922599715, 20);
}

#[test]
fun tired_and_unhappy_men_are_worth_less() {
    let xi = vector[
        man(player::gk(), 54, 60, 30),
        man(player::df(), 51, 70, 70), man(player::df(), 50, 80, 20), man(player::df(), 48, 100, 70), man(player::df(), 45, 55, 70),
        man(player::mf(), 54, 90, 70), man(player::mf(), 50, 100, 34), man(player::mf(), 47, 65, 70), man(player::mf(), 44, 100, 70),
        man(player::fw(), 52, 75, 70), man(player::fw(), 49, 100, 70),
    ];
    check(&engine::power(&xi, &starters(), 0, 1, 0), 219401246038, 211145678403, 203033311274, 206825451644, 0);
    check(&engine::power(&xi, &starters(), 70, 2, 0), 214773199649, 191083590901, 213171072857, 203306606455, 10);
}

#[test]
fun five_stars_is_two_too_many_and_the_whole_side_pays() {
    let p = engine::power(&starry(), &starters(), 0, 1, 0);
    check(&p, 339130617672, 263803672814, 315979869070, 283177735998, 0);
    // the keeper is an eighty-four and comes out at seventy-nine: six per cent off, for two stars over
    assert!(fx::to_int_round(&engine::gk(&p)) == 79, 100);
}

#[test]
fun a_side_with_nobody_in_goal_puts_a_defender_there() {
    let p = engine::power(&no_keeper(), &starters(), 0, 1, 0);
    check(&p, 81174881916, 213335546597, 251533964344, 220409912599, 0);
    // about a third of the best man on the pitch
    assert!(fx::to_int_round(&engine::gk(&p)) == 19, 100);
}

#[test]
fun a_substitute_is_not_charged_for_the_legs_of_the_man_he_replaced() {
    let xi = ordinary();
    let starters_on = starters();
    let mut fresh_on = starters();
    *&mut fresh_on[10] = 70; // the second forward came on in the seventieth minute

    let worn = engine::power(&xi, &starters_on, 85, 1, 0);
    let rested = engine::power(&xi, &fresh_on, 85, 1, 0);
    assert!(fx::gt(&engine::ap(&rested), &engine::ap(&worn)), 0);
}
