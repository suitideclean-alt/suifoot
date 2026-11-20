#[test_only]
module suifoot::fx_tests;

use suifoot::fx;

#[test]
fun whole_numbers_survive_the_round_trip() {
    assert!(fx::to_int(fx::from_int(0)) == 0, 0);
    assert!(fx::to_int(fx::from_int(1)) == 1, 1);
    assert!(fx::to_int(fx::from_int(4294967295)) == 4294967295, 2);
}

#[test]
fun one_is_the_identity_for_multiplication() {
    let x = fx::from_cents(137);
    assert!(fx::mul(x, fx::one()) == x, 0);
    assert!(fx::div(x, fx::one()) == x, 1);
}

#[test]
fun a_half_times_a_half_is_a_quarter() {
    let half = fx::from_cents(50);
    assert!(fx::mul(half, half) == fx::from_cents(25), 0);
}

#[test]
fun rounding_goes_to_the_nearest_whole_number() {
    assert!(fx::round(fx::from_cents(149)) == 1, 0);
    assert!(fx::round(fx::from_cents(150)) == 2, 1);
    assert!(fx::round(fx::from_cents(999)) == 10, 2);
}
