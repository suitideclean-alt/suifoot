/// What a season does to the men who play it, and whether a world of them survives twenty of them.
#[test_only]
module suifoot::progress_tests;

use suifoot::club::{Self, Club};
use suifoot::league;
use suifoot::player;
use suifoot::progress;
use suifoot::world;

const DAY: u64 = 86400000;
const T0: u64 = 1800000000000 / DAY * DAY;

fun a_league(ctx: &mut TxContext): league::League {
    league::new(T0, vector[12 * 60, 20 * 60], 34, ctx)
}

fun totals(c: &Club): (u64, u64, u64, u64) {
    let n = club::squad_size(c);
    let mut ovr = 0;
    let mut age = 0;
    let mut oldest = 0;
    let mut i = 0;
    while (i < n) {
        let p = club::player_at(c, i);
        ovr = ovr + (player::ovr(p) as u64);
        age = age + (player::age(p) as u64);
        if ((player::age(p) as u64) > oldest) oldest = (player::age(p) as u64);
        i = i + 1;
    };
    (n, ovr / n, age / n, oldest)
}

#[test]
fun ninety_minutes_tires_the_men_who_played_them() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut home = world::new_club(1, 3, 0, 11, &mut ctx);
    let mut away = world::new_club(2, 3, 0, 22, &mut ctx);

    let mut i = 0;
    while (i < club::squad_size(&home)) { assert!(player::cond(club::player_at(&home, i)) == 100, i); i = i + 1; };

    league::play_for_testing(&l, &mut home, &mut away, 5);

    // eleven started and came off nine points worse; whoever never got off the bench is untouched
    let mut tired = 0;
    let mut fresh = 0;
    let mut played = 0;
    let mut j = 0;
    while (j < club::squad_size(&home)) {
        let p = club::player_at(&home, j);
        if (player::cond(p) == 100) fresh = fresh + 1 else tired = tired + 1;
        if (player::apps(p) > 0) played = played + 1;
        j = j + 1;
    };
    assert!(tired >= 11, tired);
    assert!(fresh > 0, fresh);       // a squad is more than a team
    assert!(played == tired, played); // tired and credited are the same men

    club::destroy_for_testing(home);
    club::destroy_for_testing(away);
    league::destroy_for_testing(l);
}

#[test]
fun whoever_scored_has_it_on_his_name() {
    let mut ctx = tx_context::dummy();
    let l = a_league(&mut ctx);
    let mut home = world::new_club(1, 0, 0, 7, &mut ctx);   // a strong side
    let mut away = world::new_club(2, 3, 0, 7, &mut ctx);   // against a weak one
    let (hg, _ag) = league::play_for_testing(&l, &mut home, &mut away, 3);

    let mut scored = 0;
    let mut i = 0;
    while (i < club::squad_size(&home)) {
        scored = scored + (player::goals(club::player_at(&home, i)) as u64);
        i = i + 1;
    };
    assert!(scored == (hg as u64), scored); // every goal has exactly one name against it

    club::destroy_for_testing(home);
    club::destroy_for_testing(away);
    league::destroy_for_testing(l);
}

#[test]
fun a_week_of_training_brings_legs_back_and_an_easy_week_brings_more() {
    let mut ctx = tx_context::dummy();
    let mut easy = world::new_club(1, 3, 0, 9, &mut ctx);
    let mut hard = world::new_club(2, 3, 0, 9, &mut ctx);

    let mut i = 0;
    while (i < 22) {
        player::set_cond(club::player_mut(&mut easy, i), 50);
        player::set_cond(club::player_mut(&mut hard, i), 50);
        i = i + 1;
    };
    club::set_training(&mut easy, 0);
    club::set_training(&mut hard, 2);
    progress::train_week(&mut easy);
    progress::train_week(&mut hard);

    assert!(player::cond(club::player_at(&easy, 0)) == 62, 0); // twelve back
    assert!(player::cond(club::player_at(&hard, 0)) == 54, 1); // four
    // and a hard week costs a man something of his mood
    assert!(player::mood(club::player_at(&hard, 0)) < player::mood(club::player_at(&easy, 0)), 2);

    club::destroy_for_testing(easy);
    club::destroy_for_testing(hard);
}

#[test]
fun nobody_recovers_past_being_fully_fit() {
    let mut ctx = tx_context::dummy();
    let mut c = world::new_club(1, 3, 0, 9, &mut ctx);
    progress::train_week(&mut c);
    progress::train_week(&mut c);
    assert!(player::cond(club::player_at(&c, 0)) == 100, 0);
    club::destroy_for_testing(c);
}

#[test]
fun a_club_nobody_runs_eases_off_when_its_legs_have_gone() {
    let mut ctx = tx_context::dummy();
    let mut worn = world::new_club(1, 3, 0, 9, &mut ctx);
    let mut i = 0;
    while (i < 22) { player::set_cond(club::player_mut(&mut worn, i), 40); i = i + 1; };
    progress::choose_training(&mut worn);
    assert!(club::training(&worn) == 0, 0); // light

    let mut fresh = world::new_club(2, 3, 0, 9, &mut ctx);
    progress::choose_training(&mut fresh);
    assert!(club::training(&fresh) == 2, 1); // and a fresh squad is worked hard

    club::destroy_for_testing(worn);
    club::destroy_for_testing(fresh);
}

#[test]
fun the_turn_of_a_season_ages_everyone_and_sends_up_the_next_lot() {
    let mut ctx = tx_context::dummy();
    let mut c = world::new_club(1, 2, 0, 31, &mut ctx);
    let (before_n, _, before_age, _) = totals(&c);

    progress::season_turn(&mut c, 4242);

    let (after_n, _, after_age, _) = totals(&c);
    assert!(after_age >= before_age, after_age);   // a year older, less whoever went
    assert!(after_n >= before_n - 3, after_n);     // and nobody is emptied out in one summer
    assert!(player::cond(club::player_at(&c, 0)) == 100, 0); // a summer puts everybody right

    // somebody young arrived
    let mut youngest = 99;
    let mut i = 0;
    while (i < club::squad_size(&c)) {
        let a = (player::age(club::player_at(&c, i)) as u64);
        if (a < youngest) youngest = a;
        i = i + 1;
    };
    assert!(youngest <= 19, youngest);
    club::destroy_for_testing(c);
}

#[test]
fun last_seasons_goals_belong_to_last_season() {
    let mut ctx = tx_context::dummy();
    let mut c = world::new_club(1, 2, 0, 31, &mut ctx);
    progress::scored(&mut c, player::num(club::player_at(&c, 20)));
    assert!(player::goals(club::player_at(&c, 20)) == 1, 0);
    progress::season_turn(&mut c, 1);
    let mut total = 0;
    let mut i = 0;
    while (i < club::squad_size(&c)) { total = total + (player::goals(club::player_at(&c, i)) as u64); i = i + 1; };
    assert!(total == 0, total);
    club::destroy_for_testing(c);
}

#[test]
fun the_young_improve_and_the_old_decline() {
    let mut ctx = tx_context::dummy();
    let mut c = world::new_club(1, 2, 0, 77, &mut ctx);

    // one of each, with room to grow and a long way past it
    let young = player::new(900, player::mf(), player::pro(), 19, 50, 80, 500, 156);
    let old = player::new(901, player::df(), player::pro(), 35, 70, 70, 2000, 52);
    club::add_player(&mut c, young);
    club::add_player(&mut c, old);
    let young_at = club::find(&c, 900);
    let old_at = club::find(&c, 901);

    let mut r = suifoot::rng::new(5);
    let mut i = 0;
    while (i < 20) { progress::grow(&mut r, club::player_mut(&mut c, young_at)); i = i + 1; };
    let mut j = 0;
    while (j < 20) { progress::grow(&mut r, club::player_mut(&mut c, old_at)); j = j + 1; };

    assert!(player::ovr(club::player_at(&c, young_at)) > 50, 0);  // he closed on what he could be
    assert!(player::ovr(club::player_at(&c, old_at)) < 70, 1);    // and the years took the other one
    club::destroy_for_testing(c);
}

#[test]
fun a_squad_survives_twenty_seasons_without_rotting() {
    let mut ctx = tx_context::dummy();
    let mut c = world::new_club(1, 2, 0, 1234, &mut ctx);

    let mut season = 1u32;
    while (season <= 20) {
        progress::season_turn(&mut c, 1000 + season);
        let (n, ovr, _age, oldest) = totals(&c);
        // a squad that empties or doubles is a world that has gone wrong
        assert!(n >= 11, n * 1000 + (season as u64));
        assert!(n <= 40, n * 1000 + (season as u64));
        // and nobody plays on for ever
        assert!(oldest <= 45, oldest * 1000 + (season as u64));
        // nor does the whole league quietly turn into world beaters or into nobody
        assert!(ovr >= 25 && ovr <= 85, ovr * 1000 + (season as u64));
        season = season + 1;
    };
    club::destroy_for_testing(c);
}
