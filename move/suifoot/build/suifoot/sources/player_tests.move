/// The numbers here are the exact fixed-point answers, worked out with the same primitives the
/// module uses rather than with doubles rounded afterwards. Measured against the browser engine's
/// own doubles across every mood, every condition and the whole range of minutes, the widest these
/// stray is 1.3e-9 - eleven orders below the 9.5e-7 that measuring showed a season can feel.
#[test_only]
module suifoot::player_tests;

use suifoot::fx;
use suifoot::player;

fun man(pos: u8, temper: u8, ovr: u16): player::Player {
    player::new(1, pos, temper, 25, ovr, ovr, 1000, 52)
}
fun signed(a: &fx::Fx, m: u64, neg: bool, code: u64) {
    assert!(fx::raw(a) == m, code);
    assert!(fx::is_neg(a) == neg, code + 1000);
}

#[test]
fun an_unhappy_player_plays_worse_and_a_content_one_is_unaffected() {
    let mut p = man(player::mf(), player::pro(), 54);
    assert!(fx::is_zero(&player::mood_adj(&p)), 0);      // 70, content
    player::set_mood(&mut p, 35);
    assert!(fx::is_zero(&player::mood_adj(&p)), 1);      // 35, the line itself costs nothing
    player::set_mood(&mut p, 34);
    signed(&player::mood_adj(&p), 357913941, true, 2);   // a twelfth of a point
    player::set_mood(&mut p, 20);
    signed(&player::mood_adj(&p), 5368709120, true, 10);
    player::set_mood(&mut p, 0);
    signed(&player::mood_adj(&p), 12526987946, true, 20);
}

#[test]
fun being_tired_costs_rating_only_below_eighty_five() {
    let mut p = man(player::df(), player::pro(), 54);
    assert!(fx::is_zero(&player::cond_adj(&p)), 0);      // 100
    player::set_cond(&mut p, 85);
    assert!(fx::is_zero(&player::cond_adj(&p)), 1);
    player::set_cond(&mut p, 84);
    signed(&player::cond_adj(&p), 429496729, true, 2);   // a tenth of a point
    player::set_cond(&mut p, 60);
    signed(&player::cond_adj(&p), 10737418240, true, 10); // two and a half
    player::set_cond(&mut p, 0);
    signed(&player::cond_adj(&p), 36507222016, true, 20);
}

#[test]
fun legs_go_after_the_hour_and_sooner_for_a_tired_man() {
    let mut p = man(player::fw(), player::pro(), 54);
    assert!(fx::is_zero(&player::fatigue(&p, 55)), 0);   // nothing before the fifty-fifth minute
    signed(&player::fatigue(&p, 70), 2945120430, false, 1);
    signed(&player::fatigue(&p, 90), 6871947674, false, 2);
    player::set_cond(&mut p, 60);
    signed(&player::fatigue(&p, 90), 10798774915, false, 10); // the same minutes cost a tired man more
    player::set_cond(&mut p, 40);
    signed(&player::fatigue(&p, 120), 23701207279, false, 20); // and extra time is brutal
}

#[test]
fun a_rating_is_the_four_of_them_together() {
    let p = man(player::mf(), player::pro(), 54);
    signed(&player::rating(&p, 0), 231928233984, false, 0); // fresh and content: exactly 54

    let mut worn = man(player::mf(), player::pro(), 54);
    player::set_mood(&mut worn, 34);
    player::set_cond(&mut worn, 60);
    signed(&player::rating(&worn, 90), 210034126888, false, 10); // the same man, late, unhappy and tired

    let strong = man(player::fw(), player::pro(), 80);
    signed(&player::rating(&strong, 70), 340652263250, false, 20);
}

#[test]
fun temperament_decides_cards_and_what_he_fetches() {
    let g = man(player::df(), player::gent(), 54);
    let n = man(player::df(), player::pro(), 54);
    let h = man(player::df(), player::hard(), 54);

    assert!(fx::raw(&player::card_factor(&g)) == 2147483648, 0);  // half as many yellows
    assert!(fx::raw(&player::card_factor(&n)) == 4294967296, 1);
    assert!(fx::raw(&player::card_factor(&h)) == 7730941133, 2);  // and nearly twice

    assert!(fx::raw(&player::red_factor(&g)) == 858993459, 10);   // a fifth of the reds
    assert!(fx::raw(&player::red_factor(&h)) == 12884901888, 11); // against three times

    assert!(fx::raw(&player::value_factor(&g)) == 4724464026, 20); // worth a tenth more
    assert!(fx::raw(&player::value_factor(&h)) == 3650722202, 21); // and worth less
}

#[test]
fun temperament_derived_from_a_number_lands_where_the_browser_lands() {
    assert!(player::temper_from_num(1, player::gk()) == player::pro(), 0);
    assert!(player::temper_from_num(1, player::fw()) == player::pro(), 1);
    assert!(player::temper_from_num(1000, player::df()) == player::hard(), 2);
    assert!(player::temper_from_num(1000, player::gk()) == player::pro(), 3);
    assert!(player::temper_from_num(65535, player::mf()) == player::pro(), 4);
    assert!(player::temper_from_num(1000000, player::gk()) == player::gent(), 5);
    assert!(player::temper_from_num(1000000, player::df()) == player::pro(), 6);
}
