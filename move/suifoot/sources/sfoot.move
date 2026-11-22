/// SFOOT: the game's own coin, and the only thing here that will ever be worth money.
///
/// It is made inside this package on purpose. A coin created outside it leaves the right to print
/// more in somebody's key, and a key can be lost, stolen, or simply used - the holder has to be
/// trusted not to, which is a poor thing to ask of people who came to play football. Here the
/// right to print is sealed into a shared object at publication and never handed to anybody: the
/// contract mints by rule and nobody mints by hand, the author included.
///
/// What the treasury is for, and what it is not:
///
///   - it takes. Entry fees, and whatever else the game charges, go in and stay in.
///   - it pays what the rules say, when the rules can be shown to say it.
///
/// That second line is the hard one and it is not finished. Everything else in this game is worked
/// out rather than stored, which is safe while nobody gains from a wrong answer; a prize is the
/// moment somebody does. So paying out waits on a way for the chain to be shown who won - see the
/// note on challenges below - and until then this module only takes in, which can be got wrong in
/// nobody's favour.
module suifoot::sfoot;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;

/// the coin itself: one type, created once, at publication
public struct SFOOT has drop {}

/// Where the right to print lives, and where what the game takes in sits.
///
/// Shared, so that no one address holds it. The cap inside is never lent out and never returned -
/// there is no function here that hands it to a caller, which is what makes "nobody can mint by
/// hand" a property of the code rather than a promise.
public struct Treasury has key {
    id: UID,
    cap: TreasuryCap<SFOOT>,
    /// what the project has taken and keeps
    kept: Balance<SFOOT>,
    /// what is set aside to be paid out as prizes
    pool: Balance<SFOOT>,
    /// who may wind this up if it is ever needed; set at publication and not transferable
    admin: address,
}

public struct Took has copy, drop { from: address, amount: u64, what: vector<u8>, kept: u64, pool: u64 }

#[error]
const ENotAdmin: vector<u8> = b"only the league's own address may do that";
#[error]
const ENothing: vector<u8> = b"that is not an amount";

/// A fifth of what comes in is kept and the rest waits to be won back. Written here rather than
/// passed in, so that it is the same for everybody and visible to anybody who reads this.
const KEPT_IN_HUNDREDTHS: u64 = 20;

fun init(witness: SFOOT, ctx: &mut TxContext) {
    let (cap, meta) = coin::create_currency(
        witness,
        6,                      // six decimals, as a unit of account people will divide
        b"SFOOT",
        b"SuiFoot",
        b"The coin of a football league that lives in a contract.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(meta);
    transfer::share_object(Treasury {
        id: object::new(ctx),
        cap,
        kept: balance::zero(),
        pool: balance::zero(),
        admin: ctx.sender(),
    });
}

/// Put money in: an entry fee, or anything else the game charges.
///
/// Split where it lands rather than later: what the project keeps and what is waiting to be won
/// are different money, and a single pile that somebody has to divide correctly afterwards is a
/// pile somebody can divide incorrectly.
public fun take(t: &mut Treasury, paid: Coin<SFOOT>, what: vector<u8>, ctx: &TxContext) {
    let amount = coin::value(&paid);
    assert!(amount > 0, ENothing);
    let mut b = coin::into_balance(paid);
    let keep = amount * KEPT_IN_HUNDREDTHS / 100;
    t.kept.join(b.split(keep));
    t.pool.join(b);
    event::emit(Took {
        from: ctx.sender(), amount, what,
        kept: t.kept.value(), pool: t.pool.value(),
    });
}

public fun kept(t: &Treasury): u64 { t.kept.value() }
public fun pool(t: &Treasury): u64 { t.pool.value() }
public fun minted(t: &Treasury): u64 { coin::total_supply(&t.cap) }

/* Paying out is deliberately not here yet.
 *
 * To pay a prize the contract has to know who won, and who won is worked out rather than stored -
 * which is safe for as long as nobody gains by a wrong answer, and stops being safe the moment a
 * prize rides on it. Three ways out, and only one is any good:
 *
 *   - pay by hand, on somebody's say-so. Works tomorrow, and asks every player to trust us.
 *   - have the contract play the season itself. Honest and unaffordable: a single matchday costs
 *     about a fifth of what a transaction may spend, and a season is fifty of them.
 *   - let anybody submit the final table, and anybody else dispute it inside a window by making
 *     the contract replay one matchday - the one they say is wrong. Cheap when nobody lies,
 *     because nothing is computed; expensive only for whoever lied, because the stake goes to
 *     whoever caught them.
 *
 * The third needs the match engine this package already carries, which is the reason it is worth
 * carrying now that the browser works the seasons out. Until it is built, this module takes money
 * in and does not pay any out: an amount taken can be got wrong in nobody's favour, and an amount
 * paid cannot.
 */

/// Wind the treasury down. Here so that a testnet deployment is not a one-way door.
public fun close(t: &mut Treasury, ctx: &mut TxContext): Coin<SFOOT> {
    assert!(ctx.sender() == t.admin, ENotAdmin);
    // read the amounts first: a field cannot be looked at while it is being changed
    let k = t.kept.value();
    let p = t.pool.value();
    let mut b = t.kept.split(k);
    b.join(t.pool.split(p));
    coin::from_balance(b, ctx)
}

#[test_only]
public fun init_for_test(ctx: &mut TxContext) { init(SFOOT {}, ctx) }
