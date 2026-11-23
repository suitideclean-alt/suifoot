/// A tap for testnet SFOOT, so that people rehearsing the league have something to pay it with.
///
/// SFOOT is made by rule and by nobody's hand, so without this there would be no way for anybody to
/// hold any - and a league that charges an entry fee in a coin nobody can get is a league that takes
/// every club back after matchday three. This is the way in for a rehearsal.
///
/// It is built to be removed. Everything that lets it print is in this file and in one
/// `public(package)` function in `sfoot`, so publishing without this file leaves a coin whose supply
/// nobody can touch. That deletion is a step of publishing for real and is written down as one; the
/// rest of this is what keeps it harmless until then:
///
///   - it starts closed. Nothing flows until the league's address opens it.
///   - one claim an address, once. Opening it does not make it a printing press.
///   - a ceiling on everything it will ever give, set when it is opened.
///   - and it can be sealed, after which it cannot be opened again by anybody.
module suifoot::faucet;

use sui::table::{Self, Table};
use suifoot::sfoot::{Self, Treasury};

#[error]
const ENotAdmin: vector<u8> = b"only the league's own address may do that";
#[error]
const EClosed: vector<u8> = b"the faucet is closed";
#[error]
const ESealed: vector<u8> = b"the faucet has been sealed and cannot be opened again";
#[error]
const EAlready: vector<u8> = b"this address has already had its share";
#[error]
const EDry: vector<u8> = b"the faucet has given all it was set to give";
#[error]
const ENothing: vector<u8> = b"that is not an amount";

public struct Faucet has key {
    id: UID,
    admin: address,
    /// what each address gets, once; nothing while it is closed
    per_claim: u64,
    /// the most it will ever give in all
    ceiling: u64,
    given: u64,
    claimed: Table<address, bool>,
    sealed: bool,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Faucet {
        id: object::new(ctx),
        admin: ctx.sender(),
        per_claim: 0, ceiling: 0, given: 0,
        claimed: table::new(ctx),
        sealed: false,
    });
}

/// Open the tap: what each address may take, and the most it will give altogether.
entry fun open(f: &mut Faucet, per_claim: u64, ceiling: u64, ctx: &TxContext) {
    assert!(ctx.sender() == f.admin, ENotAdmin);
    assert!(!f.sealed, ESealed);
    assert!(per_claim > 0 && ceiling >= per_claim, ENothing);
    f.per_claim = per_claim;
    f.ceiling = ceiling;
}

/// Close it for good. There is no opening a sealed faucet, by anybody.
entry fun seal(f: &mut Faucet, ctx: &TxContext) {
    assert!(ctx.sender() == f.admin, ENotAdmin);
    f.per_claim = 0;
    f.sealed = true;
}

/// Take your share. Once an address; the coin goes straight to it.
entry fun claim(f: &mut Faucet, t: &mut Treasury, ctx: &mut TxContext) {
    assert!(f.per_claim > 0, EClosed);
    assert!(!f.claimed.contains(ctx.sender()), EAlready);
    assert!(f.given + f.per_claim <= f.ceiling, EDry);
    f.claimed.add(ctx.sender(), true);
    f.given = f.given + f.per_claim;
    transfer::public_transfer(sfoot::mint(t, f.per_claim, ctx), ctx.sender());
}

public fun per_claim(f: &Faucet): u64 { f.per_claim }
public fun given(f: &Faucet): u64 { f.given }
public fun sealed(f: &Faucet): bool { f.sealed }
public fun has_claimed(f: &Faucet, who: address): bool { f.claimed.contains(who) }

#[test_only]
public fun init_for_test(ctx: &mut TxContext) { init(ctx) }
