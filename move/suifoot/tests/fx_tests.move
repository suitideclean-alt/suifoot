/// Every number below came out of src/fixed.js, the specification this module was translated from.
/// Not "close to" it - the same bits. If a line of fx.move drifts, one of these stops matching here
/// instead of in a season that quietly went its own way.
#[test_only]
module suifoot::fx_tests;

use suifoot::fx;

fun p(m: u64): fx::Fx { fx::from_raw(m, false) }
fun n(m: u64): fx::Fx { fx::from_raw(m, true) }
fun same(a: &fx::Fx, m: u64, neg: bool, code: u64) {
    assert!(fx::raw(a) == m, code);
    assert!(fx::is_neg(a) == neg, code + 1000);
}

#[test]
fun the_four_operations() {
    assert!(fx::raw(&fx::add(&p(4294967296), &p(4294967296))) == 8589934592, 0);
    same(&fx::add(&p(100), &n(300)), 200, true, 1);
    same(&fx::add(&n(300), &p(300)), 0, false, 2); // zero never keeps a sign
    same(&fx::sub(&p(100), &p(300)), 200, true, 3);
    // a half times a half is a quarter
    assert!(fx::raw(&fx::mul(&p(2147483648), &p(2147483648))) == 1073741824, 4);
    same(&fx::mul(&p(2147483648), &n(2147483648)), 1073741824, true, 5);
    same(&fx::mul(&n(2147483648), &n(2147483648)), 1073741824, false, 6);
    assert!(fx::raw(&fx::div(&p(4294967296), &p(8589934592))) == 2147483648, 7);
    assert!(fx::is_zero(&fx::div(&p(4294967296), &fx::zero())), 8); // divide by nothing, get nothing
}

#[test]
fun ordering_puts_negatives_below_everything() {
    assert!(fx::lt(&n(100), &p(1)), 0);
    assert!(fx::lt(&n(300), &n(100)), 1); // further from zero is smaller
    assert!(fx::lt(&fx::zero(), &p(1)), 2);
    assert!(fx::lt(&n(1), &fx::zero()), 3);
    assert!(!fx::lt(&p(5), &p(5)), 4);
    assert!(fx::eq(&fx::clamp(n(900), n(100), p(100)), &n(100)), 5);
    assert!(fx::eq(&fx::clamp(p(900), n(100), p(100)), &p(100)), 6);
    assert!(fx::eq(&fx::clamp(p(50), n(100), p(100)), &p(50)), 7);
}

#[test]
fun exp_matches_the_specification() {
    same(&fx::exp(&n(6141803233)), 1027823994, false, 0);   // e^-1.43
    same(&fx::exp(&n(2147483648)), 2605029345, false, 10);  // e^-0.5
    same(&fx::exp(&fx::zero()), 4294967296, false, 20);     // e^0 = 1
    same(&fx::exp(&p(1073741824)), 5514847169, false, 30);  // e^0.25
    same(&fx::exp(&p(4294967296)), 11674931546, false, 40); // e^1
    same(&fx::exp(&p(10737418240)), 52323413136, false, 50); // e^2.5
    same(&fx::exp(&p(22677427323)), 843402192128, false, 60); // e^5.28, the widest the engine reaches
}

#[test]
fun ln_matches_the_specification() {
    same(&fx::ln(&p(429497)), 39558107990, true, 0);     // ln 0.0001
    same(&fx::ln(&p(1073741824)), 5954088944, true, 10); // ln 0.25
    same(&fx::ln(&p(4294967296)), 0, false, 20);         // ln 1 = 0
    same(&fx::ln(&p(6442450944)), 1741459372, false, 30); // ln 1.5
    same(&fx::ln(&p(8589934592)), 2977044472, false, 40); // ln 2
    same(&fx::ln(&p(11674931553)), 4294967288, false, 50); // ln e, one short of exactly 1
    same(&fx::ln(&p(15247133901)), 5441498512, false, 60); // ln 3.55
}

#[test]
fun sqrt_matches_the_specification() {
    same(&fx::sqrt(&p(1717987)), 85899347, false, 0);
    same(&fx::sqrt(&p(1073741824)), 2147483648, false, 10);
    same(&fx::sqrt(&p(4294967296)), 4294967296, false, 20);
    same(&fx::sqrt(&p(8589934592)), 6074000999, false, 30);
    same(&fx::sqrt(&p(38654705664)), 12884901888, false, 40);
    same(&fx::sqrt(&p(83150566851)), 18897856102, false, 50);
    assert!(fx::is_zero(&fx::sqrt(&n(4294967296))), 60); // nothing below zero has one
}

#[test]
fun cos_matches_the_specification() {
    same(&fx::cos(&fx::zero()), 4294967296, false, 0);
    same(&fx::cos(&p(2147483648)), 3769188403, false, 10);
    same(&fx::cos(&p(4294967296)), 2320580733, false, 20);
    same(&fx::cos(&p(6746518852)), 1, false, 30);            // a quarter turn, all but zero
    same(&fx::cos(&p(13493037705)), 4294967296, true, 40);   // half a turn, minus one
    same(&fx::cos(&p(19327352832)), 905361065, true, 50);
    same(&fx::cos(&p(26986075409)), 4294967296, false, 60);  // all the way round, back to one
}

#[test]
fun pow_matches_the_specification() {
    same(&fx::pow(&p(8589934592), &p(42949672960)), 4398046511104, false, 0); // 2^10 = 1024
    same(&fx::pow(&p(8589934592), &p(12884901888)), 34359738368, false, 10);  // 2^3 = 8
    // the shape the engine actually asks for: a goalkeeper factor, something to the power 0.6
    same(&fx::pow(&p(1760936591), &p(2576980378)), 2515533901, false, 20);
    same(&fx::pow(&p(15247133901), &p(2576980378)), 9185374592, false, 30);
    same(&fx::pow(&p(7730941133), &p(2576980378)), 6111155912, false, 40);
    assert!(fx::raw(&fx::pow(&p(8589934592), &fx::zero())) == 4294967296, 50); // anything^0 = 1
    assert!(fx::is_zero(&fx::pow(&fx::zero(), &p(2576980378))), 60); // and nothing^anything = nothing
}

#[test]
fun whole_number_roots_and_logs_are_exact() {
    assert!(fx::isqrt(0) == 0, 0);
    assert!(fx::isqrt(1) == 1, 1);
    assert!(fx::isqrt(2) == 1, 2); // the specification said 2 here until this port asked
    assert!(fx::isqrt(15) == 3, 3);
    assert!(fx::isqrt(16) == 4, 4);
    assert!(fx::isqrt(1000000) == 1000, 5);
    assert!(fx::isqrt(4294967295) == 65535, 6);
    assert!(fx::ilog2(1) == 0, 7);
    assert!(fx::ilog2(1024) == 10, 8);
    assert!(fx::ilog2(1023) == 9, 9);
}

#[test]
fun the_ends_saturate_instead_of_aborting() {
    assert!(fx::is_zero(&fx::exp(&n(100 << 32))), 0);          // e^-100 is below the smallest step
    assert!(fx::raw(&fx::exp(&p(100 << 32))) == 18446744073709551615, 1); // and e^100 is above the ceiling
    assert!(fx::is_neg(&fx::ln(&fx::zero())), 2);
}
