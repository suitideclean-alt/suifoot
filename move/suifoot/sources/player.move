/// A footballer, and the handful of sums that turn one into a number the match engine can use.
///
/// This is the part of the game a browser must never be allowed to assert. A tab can be opened and
/// its memory edited: four lines in a console took a squad from 51 to 94 and the game accepted it.
/// So a player's rating lives here, inside an object only the contract can write to, and the browser
/// is reduced to reading it.
///
/// No names are stored. A name is drawn from the player's number by the same tables on both sides,
/// so two thousand strings stay off chain and the storage pays only for what actually matters.
module suifoot::player;

use suifoot::fx::{Self, Fx};

// where he plays
const GK: u8 = 0;
const DF: u8 = 1;
const MF: u8 = 2;
const FW: u8 = 3;

// how he behaves: fewer cards and worth more, ordinary, or hard and cheap
const GENT: u8 = 0;
const PRO: u8 = 1;
const HARD: u8 = 2;

public struct Player has store, copy, drop {
    num: u32,         // his number, which is also the seed his name is drawn from
    pos: u8,
    temper: u8,
    age: u8,
    ovr: u16,         // what he is worth on the pitch today
    pot: u16,         // and what he could still become
    cond: u8,         // 0..100, how fresh he is
    mood: u8,         // 0..100, how happy he is to be here
    wage: u64,
    contract_weeks: u16,
    goals: u16,
    apps: u16,
}

public fun new(num: u32, pos: u8, temper: u8, age: u8, ovr: u16, pot: u16, wage: u64, contract_weeks: u16): Player {
    Player { num, pos, temper, age, ovr, pot, cond: 100, mood: 70, wage, contract_weeks, goals: 0, apps: 0 }
}

public fun gk(): u8 { GK }
public fun df(): u8 { DF }
public fun mf(): u8 { MF }
public fun fw(): u8 { FW }
public fun gent(): u8 { GENT }
public fun pro(): u8 { PRO }
public fun hard(): u8 { HARD }

public fun num(p: &Player): u32 { p.num }
public fun pos(p: &Player): u8 { p.pos }
public fun temper(p: &Player): u8 { p.temper }
public fun age(p: &Player): u8 { p.age }
public fun ovr(p: &Player): u16 { p.ovr }
public fun pot(p: &Player): u16 { p.pot }
public fun cond(p: &Player): u8 { p.cond }
public fun mood(p: &Player): u8 { p.mood }
public fun wage(p: &Player): u64 { p.wage }
public fun goals(p: &Player): u16 { p.goals }
public fun apps(p: &Player): u16 { p.apps }
public fun is_keeper(p: &Player): bool { p.pos == GK }

public(package) fun set_cond(p: &mut Player, c: u8) { p.cond = c }
public(package) fun set_mood(p: &mut Player, m: u8) { p.mood = m }
public(package) fun add_goal(p: &mut Player) { p.goals = p.goals + 1 }
public(package) fun add_app(p: &mut Player) { p.apps = p.apps + 1 }

/// A player who does not want to be here plays worse. Nothing above 35, then a twelfth of a point
/// for each point below it.
public fun mood_adj(p: &Player): Fx {
    if (p.mood >= 35) return fx::zero();
    fx::negate(&fx::div_int(&fx::from_int(((35 - p.mood) as u64)), 12))
}

/// Being tired costs rating. Nothing above 85, then a tenth of a point for each point below it.
public fun cond_adj(p: &Player): Fx {
    if (p.cond >= 85) return fx::zero();
    let gap = fx::from_int(((85 - p.cond) as u64));
    fx::negate(&fx::div_int(&gap, 10))
}

/// Legs go late in a match, and sooner for a player who started it already tired.
/// over = max(0, minutes - 55) / 35, then over * 1.6 * (1 + (100 - cond) / 70)
public fun fatigue(p: &Player, minutes_played: u64): Fx {
    if (minutes_played <= 55) return fx::zero();
    let over = fx::div_int(&fx::from_int(minutes_played - 55), 35);
    let tired = fx::add(&fx::one(), &fx::div_int(&fx::from_int(((100 - (p.cond as u64)) as u64)), 70));
    fx::mul(&fx::mul(&over, &fx::from_cents(160, false)), &tired)
}

/// what he is worth to the engine right now, before the match has worn him down
public fun rating(p: &Player, minutes_played: u64): Fx {
    let base = fx::from_int((p.ovr as u64));
    let with_mood = fx::add(&base, &mood_adj(p));
    let with_cond = fx::add(&with_mood, &cond_adj(p));
    fx::sub(&with_cond, &fatigue(p, minutes_played))
}

/// how readily he collects a yellow: a gentleman half as often, a hard man nearly twice
public fun card_factor(p: &Player): Fx {
    if (p.temper == GENT) fx::from_cents(50, false)
    else if (p.temper == HARD) fx::from_cents(180, false)
    else fx::one()
}

/// and a red, where the gap is far wider
public fun red_factor(p: &Player): Fx {
    if (p.temper == GENT) fx::from_cents(20, false)
    else if (p.temper == HARD) fx::from_cents(300, false)
    else fx::one()
}

/// a gentleman sells for more, a hard man for less
public fun value_factor(p: &Player): Fx {
    if (p.temper == GENT) fx::from_cents(110, false)
    else if (p.temper == HARD) fx::from_cents(85, false)
    else fx::one()
}

/// A temperament drawn from the player's number, the way the browser derives one for a player who
/// has none: the same hash, the same thresholds, so both sides land on the same man.
public fun temper_from_num(num: u32, pos: u8): u8 {
    let h = (((num as u64) * 2654435761) & 0xFFFFFFFF) % 100;
    let (gent_share, pro_share) = if (pos == GK) (40, 55)
        else if (pos == DF) (18, 50)
        else if (pos == FW) (30, 52)
        else (25, 50);
    if (h < gent_share) GENT else if (h < gent_share + pro_share) PRO else HARD
}
