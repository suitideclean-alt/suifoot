/// Making a world: clubs, squads, and the footballers in them.
///
/// Everything here is drawn by the contract from a seed the chain gave it. That is the whole point.
/// A squad the browser hands over is a squad the browser chose, and four lines in a console once
/// took one from 51 to 94; a squad the contract drew is a squad nobody chose.
///
/// A club is made one transaction at a time rather than a league at a time. Eighteen clubs of
/// twenty-two men each is a lot of work to ask of a single transaction, and there is no reason to:
/// the league is built up over as many transactions as it takes.
module suifoot::world;

use std::string::{Self, String};
use suifoot::club::{Self, Club};
use suifoot::fx::{Self, Fx};
use suifoot::player::{Self, Player};
use suifoot::rng::{Self, Rng};
use sui::random::{Self, Random};
use suifoot::league::{Self, League};

/// how many of each the squad holds: twenty-two men, two of them keepers
const N_GK: u64 = 2;
const N_DF: u64 = 7;
const N_MF: u64 = 7;
const N_FW: u64 = 6;

/// the mean rating of a player at each level, best division first
const DIV_OVR: vector<u64> = vector[71, 62, 54, 47];
/// and what a club at that level starts with in the bank
const START_CASH: vector<u64> = vector[900000, 380000, 150000, 60000];
/// how many follow a club at that level, how many its ground holds, and what it charges in cents
const FANS: vector<u64> = vector[24000, 12000, 6000, 3000];
const CAPACITY: vector<u64> = vector[28000, 15000, 8000, 4500];
const TICKET_CENTS: vector<u64> = vector[300, 240, 190, 150];

/// a rating at or above this makes a man a star, and stars are paid more
const STAR_OVR: u16 = 80;

// ---------- drawing numbers with a shape ----------

/// A draw from a bell curve, by the Box-Muller method the browser uses: two flat draws turned into
/// one that clusters around the middle. This is why the logarithm and the cosine were ported.
public fun gauss(r: &mut Rng, mean: Fx, sd: Fx): Fx {
    let mut u = rng::next_u32(r);
    while (u == 0) u = rng::next_u32(r); // the logarithm of nothing has no answer
    let v = rng::next_u32(r);

    let uf = fx::from_raw((u as u64), false);
    let vf = fx::from_raw((v as u64), false);
    let radius = fx::sqrt(&fx::mul_int(&fx::abs(&fx::ln(&uf)), 2)); // ln u is below zero, so -2 ln u is above it
    let angle = fx::cos(&fx::mul(&fx::from_ratio(628318531, 100000000), &vf));
    fx::add(&mean, &fx::mul(&sd, &fx::mul(&radius, &angle)))
}

/// a flat draw between two whole numbers, both ends included
fun between(r: &mut Rng, lo: u64, hi: u64): u64 { rng::int(r, lo, hi) }

fun clamp_u64(v: Fx, lo: u64, hi: u64): u64 {
    if (fx::is_neg(&v)) return lo;
    let n = fx::to_int_round(&v);
    if (n < lo) lo else if (n > hi) hi else n
}

// ---------- what a man is paid ----------

/// 120 a week at a rating of thirty, and about seven per cent more for every point above it, rounded
/// to the nearest ten. A star is paid a third again on top.
public fun wage_for(ovr: u16): u64 {
    let o = (ovr as u64);
    let exponent = if (o >= 30) fx::mul(&fx::from_ratio(65, 1000), &fx::from_int(o - 30))
        else fx::negate(&fx::mul(&fx::from_ratio(65, 1000), &fx::from_int(30 - o)));
    let base = fx::mul(&fx::from_int(120), &fx::exp(&exponent));
    let star = if (ovr >= STAR_OVR) fx::mul(&base, &fx::from_ratio(135, 100)) else base;
    let tens = fx::to_int_round(&fx::div_int(&star, 10)) * 10;
    if (tens < 40) 40 else tens
}

// ---------- a footballer ----------

/// One player. His age clusters on twenty-six, his rating on whatever the club is worth, and what he
/// might still become depends on how much of his career is left.
public fun new_player(r: &mut Rng, num: u32, pos: u8, mean_ovr: Fx): Player {
    let age = clamp_u64(gauss(r, fx::from_int(26), fx::from_ratio(45, 10)), 17, 36);
    let ovr = (clamp_u64(gauss(r, mean_ovr, fx::from_int(6)), 25, 93) as u16);

    // a young man has room to grow, and the younger he is the more of it
    let mut pot = ovr;
    if (age < 28) {
        let years_left = 27 - (if (age > 27) 27 else age);
        let spread = fx::add(&fx::from_ratio(4, 10), &fx::mul(&fx::from_raw((rng::next_u32(r) as u64), false), &fx::from_ratio(11, 10)));
        let growth = fx::to_int_round(&fx::mul(&fx::from_int(years_left), &spread));
        let p = (ovr as u64) + growth;
        pot = (if (p > 95) 95 else p as u16);
    };

    let temper = draw_temper(r, pos);
    let contract_weeks = (between(r, 1, 4) as u16) * 52;
    player::new(num, pos, temper, (age as u8), ovr, pot, wage_for(ovr), contract_weeks)
}

/// Fewer keepers go in hard than defenders do, and the shares differ by position.
fun draw_temper(r: &mut Rng, pos: u8): u8 {
    let (gent, pro) = if (pos == player::gk()) (40, 55)
        else if (pos == player::df()) (18, 50)
        else if (pos == player::fw()) (30, 52)
        else (25, 50);
    let roll = rng::int(r, 0, gent + pro + (100 - gent - pro) - 1);
    if (roll < gent) player::gent() else if (roll < gent + pro) player::pro() else player::hard()
}

// ---------- a club ----------

/// A club and the twenty-two men in it. The squad is drawn around what the level is worth, with the
/// third keeper and the deeper reserves a notch below the rest, as a real squad thins out.
public fun new_club(
    num: u32, level: u8, series: u16, seed: u32, ctx: &mut TxContext,
): Club {
    let mut r = rng::new(seed);
    let mean = DIV_OVR[(level as u64)];
    let cash = START_CASH[(level as u64)];

    // clubs of the same level are not all alike: some are a few points better than their neighbours
    let offset = gauss(&mut r, fx::zero(), fx::from_ratio(26, 10));
    let club_mean = fx::add(&fx::from_int(mean), &offset);

    // and the money they start with varies by a fifth either way
    let spread = fx::add(&fx::from_ratio(8, 10), &fx::mul(&fx::from_raw((rng::next_u32(&mut r) as u64), false), &fx::from_ratio(45, 100)));
    let balance = fx::to_int_round(&fx::mul(&fx::from_int(cash), &spread));

    // a following and a ground, neither of them the same as the club next door's
    let fan_spread = fx::add(&fx::from_ratio(8, 10), &fx::mul(&fx::from_raw((rng::next_u32(&mut r) as u64), false), &fx::from_ratio(45, 100)));
    let fans = fx::to_int_round(&fx::mul(&fx::from_int(FANS[(level as u64)]), &fan_spread));
    let cap_spread = fx::add(&fx::from_ratio(85, 100), &fx::mul(&fx::from_raw((rng::next_u32(&mut r) as u64), false), &fx::from_ratio(35, 100)));
    let seats = fx::to_int_round(&fx::div_int(&fx::mul(&fx::from_int(CAPACITY[(level as u64)]), &cap_spread), 500)) * 500;

    let mut c = club::new_with_ground(
        num, club_name(num), level, series, balance,
        (fans as u32), (seats as u32), TICKET_CENTS[(level as u64)], ctx,
    );

    let mut pid = num * 100; // the player numbers of a club sit under the club's own
    fill(&mut c, &mut r, &mut pid, player::gk(), N_GK, &club_mean);
    fill(&mut c, &mut r, &mut pid, player::df(), N_DF, &club_mean);
    fill(&mut c, &mut r, &mut pid, player::mf(), N_MF, &club_mean);
    fill(&mut c, &mut r, &mut pid, player::fw(), N_FW, &club_mean);
    c
}

fun fill(c: &mut Club, r: &mut Rng, pid: &mut u32, pos: u8, n: u64, mean: &Fx) {
    let mut i = 0;
    while (i < n) {
        // past the first three of a position you are into the reserves, who are a few points worse
        let m = if (i >= 3) fx::sub(mean, &fx::from_int(3)) else *mean;
        club::add_player(c, new_player(r, *pid, pos, m));
        *pid = *pid + 1;
        i = i + 1;
    };
}

// ---------- names ----------

const PRE: vector<vector<u8>> = vector[b"Aster", b"Bryn", b"Cald", b"Dun", b"Elm", b"Fen", b"Glen", b"Hal",
    b"Iron", b"Kes", b"Lark", b"Mar", b"Nor", b"Oak", b"Pen", b"Quil", b"Ros", b"Sel", b"Thorn", b"Ulm",
    b"Vale", b"Wyn", b"Yar", b"Zan"];
const SUF: vector<vector<u8>> = vector[b"ford", b"mouth", b"ton", b"haven", b"wick", b"dale", b"bridge",
    b"port", b"field", b"stead", b"holm", b"crest"];
const KIND: vector<vector<u8>> = vector[b"FC", b"United", b"Athletic", b"Rovers", b"Wanderers", b"Town",
    b"Sporting", b"Union", b"Racing", b"Rangers"];

/// A club's name, drawn from its number alone so that it never has to be stored anywhere else or
/// agreed with anybody, and never shared with another club.
///
/// There are 24 x 12 x 10 = 2880 names. Hashing into them would have given about one collision in
/// five across two thousand clubs, which is not a hash problem but a counting one. So the number is
/// mapped onto a name instead: multiplying by 1123, which shares no factor with 2880, shuffles the
/// order without ever landing twice on the same name. Past 2880 clubs a numeral is added, the way a
/// second club of the same name in the same town would be told apart.
public fun club_name(num: u32): String {
    let n = (num as u64);
    let block = n / 2880;
    let m = ((n % 2880) * 1123) % 2880;
    let mut s = string::utf8(PRE[m % 24]);
    s.append(string::utf8(SUF[(m / 24) % 12]));
    s.append(string::utf8(b" "));
    s.append(string::utf8(KIND[m / 288]));
    if (block > 0) {
        s.append(string::utf8(b" "));
        s.append(digits(block + 1));
    };
    s
}

fun digits(mut n: u64): String {
    if (n == 0) return string::utf8(b"0");
    let mut back = vector::empty<u8>();
    while (n > 0) { back.push_back(((48 + (n % 10)) as u8)); n = n / 10; };
    let mut out = vector::empty<u8>();
    let mut i = back.length();
    while (i > 0) { i = i - 1; out.push_back(back[i]); };
    string::utf8(out)
}

// ---------- setting a league up ----------


#[error]
const ENotAdmin: vector<u8> = b"only the league may add a club to it";

/// Add a club to the league. The seed is drawn here, so the squad is not something anybody chose -
/// not the person running the league either.
entry fun create_club(l: &mut League, num: u32, level: u8, series: u16, r: &Random, ctx: &mut TxContext) {
    assert!(ctx.sender() == league::admin(l), ENotAdmin);
    let mut gen = random::new_generator(r, ctx);
    let seed = random::generate_u32(&mut gen);
    let c = new_club(num, level, series, seed, ctx);
    if (level == league::bottom_level(l)) league::register_free(l, object::id(&c), series);
    transfer::public_share_object(c);
}

/// Open a new series at the foot of the pyramid.
///
/// Anyone may do this, and that is the point: the league has to be able to take the hundred and
/// first person without waiting for whoever runs it to wake up. It costs about a fifth of a SUI,
/// paid by whoever opens it - which in practice is the person who wanted in and found no room.
///
/// The new series joins the season already being played. It does not start a season of its own, so
/// there is never a second calendar, never a second league, and never a club in a different year
/// from everybody else. Its first season is simply a short one.
entry fun open_series(l: &mut League, r: &Random, ctx: &mut TxContext) {
    assert!(league::free_at_foot(l) == 0, league::still_room_error());

    let mut gen = random::new_generator(r, ctx);
    let level = league::bottom_level(l);
    let series = league::next_foot_series(l);
    let size = (league::series_size(l) as u64);

    // club numbers carry on from the series, so no two clubs anywhere share one
    let base = ((series as u32) + 1) * 1000;
    let mut i = 0;
    while (i < size) {
        let seed = random::generate_u32(&mut gen);
        let c = new_club(base + (i as u32), level, series, seed, ctx);
        league::register_free(l, object::id(&c), series);
        transfer::public_share_object(c);
        i = i + 1;
    };
}
