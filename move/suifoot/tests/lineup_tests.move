/// The seal in the first test was computed in JavaScript with Node's own SHA-256 over the same
/// encoding. If the two sides ever stop agreeing on the bytes, no revealed lineup would check out
/// against the seal published before the deadline, and nobody could play.
#[test_only]
module suifoot::lineup_tests;

use suifoot::lineup;

fun eleven(): vector<u32> { vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
fun five(): vector<u32> { vector[12, 13, 14, 15, 16] }

#[test]
fun the_seal_is_the_one_the_browser_computes() {
    let l = lineup::new(eleven(), five(), lineup::bal());
    let want = vector[0x4au8, 0x94, 0x59, 0x60, 0x3e, 0xff, 0xdc, 0x67, 0x0e, 0x10, 0x2d, 0x58, 0x14, 0xcd,
        0xb3, 0x09, 0x52, 0x5b, 0x6d, 0x8a, 0x53, 0xf8, 0x6a, 0xc3, 0x7d, 0xb4, 0xca, 0x09, 0x88, 0xc4, 0x46, 0x33];
    assert!(lineup::seal_of(&l, 123456789) == want, 0);
    assert!(lineup::matches(&l, 123456789, &want), 1);
}

#[test]
fun the_encoding_is_the_length_it_should_be() {
    let l = lineup::new(eleven(), five(), lineup::bal());
    // 1 + 11*4 + 1 + 5*4 + 1 + 8
    assert!(lineup::encode(&l, 123456789).length() == 75, 0);
}

#[test]
fun a_different_secret_number_is_a_different_seal() {
    let l = lineup::new(eleven(), five(), lineup::bal());
    assert!(lineup::seal_of(&l, 1) != lineup::seal_of(&l, 2), 0);
    assert!(!lineup::matches(&l, 2, &lineup::seal_of(&l, 1)), 1);
}

#[test]
fun changing_the_lineup_after_sealing_is_caught() {
    let sealed = lineup::new(eleven(), five(), lineup::bal());
    let seal = lineup::seal_of(&sealed, 999);

    // the same eleven but set up to attack: a different seal, so the swap is refused
    let other_tactic = lineup::new(eleven(), five(), lineup::att());
    assert!(!lineup::matches(&other_tactic, 999, &seal), 0);

    // one player swapped off the bench: likewise
    let swapped = lineup::new(vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12], vector[11, 13, 14, 15, 16], lineup::bal());
    assert!(!lineup::matches(&swapped, 999, &seal), 1);

    // and the order of the eleven is part of it too
    let reordered = lineup::new(vector[11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1], five(), lineup::bal());
    assert!(!lineup::matches(&reordered, 999, &seal), 2);
}

#[test]
fun a_bench_may_be_empty() {
    let l = lineup::new(eleven(), vector[], lineup::def());
    assert!(lineup::encode(&l, 0).length() == 1 + 44 + 1 + 0 + 1 + 8, 0);
}

#[test, expected_failure(abort_code = lineup::EWrongSize)]
fun ten_players_is_not_a_lineup() {
    lineup::new(vector[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], vector[], lineup::bal());
}

#[test, expected_failure(abort_code = lineup::EWrongSize)]
fun a_bench_of_eight_is_too_many() {
    lineup::new(eleven(), vector[12, 13, 14, 15, 16, 17, 18, 19], lineup::bal());
}

#[test, expected_failure(abort_code = lineup::ERepeated)]
fun the_same_man_cannot_be_named_twice() {
    lineup::new(vector[1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11], vector[], lineup::bal());
}

#[test, expected_failure(abort_code = lineup::ERepeated)]
fun nor_on_the_pitch_and_the_bench_at_once() {
    lineup::new(eleven(), vector[11, 13], lineup::bal());
}

#[test, expected_failure(abort_code = lineup::EBadTactic)]
fun there_are_only_three_tactics() {
    lineup::new(eleven(), vector[], 7);
}
