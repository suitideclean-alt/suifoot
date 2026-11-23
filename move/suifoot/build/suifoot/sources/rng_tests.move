/// These numbers were taken out of the browser engine and pasted in. They are the whole point of the
/// module: if a line of rng.move ever drifts, one of these stops matching and the drift is caught
/// here rather than in a season that quietly went its own way.
#[test_only]
module suifoot::rng_tests;

use suifoot::rng;

#[test]
fun eight_draws_from_seed_one_match_the_browser() {
    let mut r = rng::new(1);
    let want = vector[2693262067u32, 11749833, 2265367787, 4213581821, 4159151403, 1207330352, 2632122864, 3095568220];
    let mut i = 0;
    while (i < want.length()) {
        assert!(rng::next_u32(&mut r) == want[i], i);
        i = i + 1;
    }
}

#[test]
fun eight_draws_from_seed_forty_two_match_the_browser() {
    let mut r = rng::new(42);
    let want = vector[2581720956u32, 1925393290, 3661312704, 2876485805, 750819978, 2261697747, 1173505300, 2683257857];
    let mut i = 0;
    while (i < want.length()) {
        assert!(rng::next_u32(&mut r) == want[i], i);
        i = i + 1;
    }
}

#[test]
fun a_big_seed_and_the_largest_one_match_the_browser() {
    let mut r = rng::new(123456789);
    let want = vector[1107202814u32, 4169434471, 3372958138, 885470128, 1301683845, 3208624240, 3344635568, 1221959552];
    let mut i = 0;
    while (i < want.length()) { assert!(rng::next_u32(&mut r) == want[i], i); i = i + 1; };

    let mut r2 = rng::new(4294967295);
    let want2 = vector[3850105811u32, 813802916, 3073704848, 4054706436, 3630262831, 2315588663, 2922715533, 2042566601];
    let mut j = 0;
    while (j < want2.length()) { assert!(rng::next_u32(&mut r2) == want2[j], j + 100); j = j + 1; };
}

#[test]
fun whole_numbers_in_a_range_match_the_browser() {
    let mut r = rng::new(1);
    let want = vector[62u64, 0, 52, 98, 96, 28, 61, 72];
    let mut i = 0;
    while (i < want.length()) { assert!(rng::int(&mut r, 0, 99) == want[i], i); i = i + 1; };

    let mut r2 = rng::new(123456789);
    let want2 = vector[25u64, 97, 78, 20, 30, 74, 77, 28];
    let mut j = 0;
    while (j < want2.length()) { assert!(rng::int(&mut r2, 0, 99) == want2[j], j + 100); j = j + 1; };
}

#[test]
fun the_state_carries_so_a_season_can_be_put_down_and_picked_up() {
    let mut r = rng::new(42);
    rng::next_u32(&mut r); rng::next_u32(&mut r); rng::next_u32(&mut r);
    assert!(rng::state(&r) == 1199730185, 0); // the browser's G.rs after three draws

    let mut again = rng::from_state(rng::state(&r));
    let mut straight = rng::new(42);
    rng::next_u32(&mut straight); rng::next_u32(&mut straight); rng::next_u32(&mut straight);
    assert!(rng::next_u32(&mut again) == rng::next_u32(&mut straight), 1);
}

#[test]
fun a_draw_is_already_a_fixed_point_fraction_of_one() {
    let mut r = rng::new(1);
    assert!(rng::next_fx(&mut r) == 2693262067, 0); // 0.6271... in Q32.32, nothing rounded
    let mut r2 = rng::new(1);
    assert!(rng::next_fx(&mut r2) < (1u64 << 32), 1); // and always under one
}
