/// A world the contract drew, rather than one a browser handed over.
#[test_only]
module suifoot::world_tests;

use std::string;
use suifoot::club;
use suifoot::fx;
use suifoot::player;
use suifoot::rng;
use suifoot::world;

#[test]
fun every_club_number_gets_a_name_of_its_own() {
    assert!(world::club_name(0) == string::utf8(b"Asterford FC"), 0);
    assert!(world::club_name(1) == string::utf8(b"Ulmholm Rovers"), 1);
    assert!(world::club_name(18) == string::utf8(b"Glenton FC"), 2);
    assert!(world::club_name(100) == string::utf8(b"Elmcrest Rangers"), 3);
    assert!(world::club_name(2879) == string::utf8(b"Fenmouth Sporting"), 4);
    // past the names there are, a numeral is added rather than a name repeated
    assert!(world::club_name(2880) == string::utf8(b"Asterford FC 2"), 5);
    assert!(world::club_name(5760) == string::utf8(b"Asterford FC 3"), 6);
}

#[test]
fun a_squad_is_twenty_two_men_with_two_keepers() {
    let mut ctx = tx_context::dummy();
    let c = world::new_club(0, 3, 0, 12345, &mut ctx);
    assert!(club::squad_size(&c) == 22, 0);

    let mut keepers = 0;
    let mut backs = 0;
    let mut mids = 0;
    let mut fronts = 0;
    let mut i = 0;
    while (i < 22) {
        let p = club::player_at(&c, i);
        let pos = player::pos(p);
        if (pos == player::gk()) keepers = keepers + 1
        else if (pos == player::df()) backs = backs + 1
        else if (pos == player::mf()) mids = mids + 1
        else fronts = fronts + 1;
        i = i + 1;
    };
    assert!(keepers == 2, 1);
    assert!(backs == 7, 2);
    assert!(mids == 7, 3);
    assert!(fronts == 6, 4);
    club::destroy_for_testing(c);
}

#[test]
fun the_men_are_footballers_and_not_nonsense() {
    let mut ctx = tx_context::dummy();
    let c = world::new_club(7, 2, 0, 999, &mut ctx);
    let mut i = 0;
    while (i < club::squad_size(&c)) {
        let p = club::player_at(&c, i);
        assert!(player::age(p) >= 17 && player::age(p) <= 36, i);
        assert!(player::ovr(p) >= 25 && player::ovr(p) <= 93, 100 + i);
        assert!(player::pot(p) >= player::ovr(p), 200 + i); // nobody's ceiling is below his floor
        assert!(player::pot(p) <= 95, 300 + i);
        assert!(player::wage(p) >= 40, 400 + i);
        assert!(player::cond(p) == 100, 500 + i);
        i = i + 1;
    };
    club::destroy_for_testing(c);
}

#[test]
fun the_better_division_has_the_better_players() {
    let mut ctx = tx_context::dummy();
    let mut top = 0u64;
    let mut bottom = 0u64;
    let mut seed = 1u32;
    while (seed <= 6) {
        let a = world::new_club(seed, 0, 0, seed, &mut ctx);
        let b = world::new_club(seed + 100, 3, 0, seed, &mut ctx);
        let mut i = 0;
        while (i < 22) {
            top = top + (player::ovr(club::player_at(&a, i)) as u64);
            bottom = bottom + (player::ovr(club::player_at(&b, i)) as u64);
            i = i + 1;
        };
        club::destroy_for_testing(a);
        club::destroy_for_testing(b);
        seed = seed + 1;
    };
    // seventy-one against forty-seven is the gap it was asked for, and the squads show it
    assert!(top > bottom + 20 * 22 * 6 / 10, top);
    club::destroy_for_testing(world::new_club(999, 0, 0, 1, &mut ctx));
}

#[test]
fun the_same_seed_makes_the_same_club_and_another_makes_another() {
    let mut ctx = tx_context::dummy();
    let a = world::new_club(5, 2, 0, 4242, &mut ctx);
    let b = world::new_club(5, 2, 0, 4242, &mut ctx);
    let c = world::new_club(5, 2, 0, 4243, &mut ctx);

    let mut same = true;
    let mut differs = false;
    let mut i = 0;
    while (i < 22) {
        if (player::ovr(club::player_at(&a, i)) != player::ovr(club::player_at(&b, i))) same = false;
        if (player::ovr(club::player_at(&a, i)) != player::ovr(club::player_at(&c, i))) differs = true;
        i = i + 1;
    };
    assert!(same, 0);
    assert!(differs, 1);
    assert!(club::balance(&a) == club::balance(&b), 2);
    club::destroy_for_testing(a);
    club::destroy_for_testing(b);
    club::destroy_for_testing(c);
}

#[test]
fun a_bell_curve_clusters_where_it_should() {
    let mut r = rng::new(77);
    let mut near = 0;
    let mut far = 0;
    let mut i = 0;
    while (i < 60) {
        let g = world::gauss(&mut r, fx::from_int(50), fx::from_int(10));
        let v = fx::to_int_round(&g);
        if (v >= 40 && v <= 60) near = near + 1;          // inside one spread
        if (v < 20 || v > 80) far = far + 1;              // beyond three
        i = i + 1;
    };
    assert!(near > 35, near); // about two in three should land inside one spread
    assert!(far <= 1, far);   // and almost nothing beyond three
}

#[test]
fun wages_rise_with_rating_and_jump_for_a_star() {
    assert!(world::wage_for(30) == 120, 0);
    assert!(world::wage_for(40) > world::wage_for(30), 1);
    assert!(world::wage_for(60) > world::wage_for(50), 2);
    assert!(world::wage_for(20) == 40, 3); // nobody is paid less than the floor
    // crossing eighty is worth a third again on top of the curve
    let below = world::wage_for(79);
    let above = world::wage_for(80);
    assert!(above > below * 13 / 10, 4);
}
