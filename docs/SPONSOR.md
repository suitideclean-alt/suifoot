# Paying the gas for the players

A person who has just arrived should not have to go and find SUI before pressing a button. The
sponsor is a small service that pays the network fee for them. It is optional: with none set up,
everybody pays their own, as now.

## What it is, and what it cannot do

The page builds a transaction and sends its contents - never a key - to the sponsor. The sponsor
checks that it is the game and nothing else, adds a coin of its own to pay with, signs for that
coin, and sends it back. The person signs the same bytes and the chain takes both signatures.

`tools/sponsor.js` refuses, and `tests/sponsor.js` proves it refuses, anything that is not a call
into this package or the cutting and joining of a person's own coins: no transfers, no publishing,
nothing that names the coin it pays with. It sets the budget itself (0.05 SUI at most), allows 60 a
person an hour and 3000 an hour in all, and stops when its own coin falls below 2 SUI.

The worst a hostile caller can do is spend what the limits allow, which is a few SUI an hour of
testnet coins. That is what the float is sized against.

## Running it

It needs a machine that stays on, Node 20, and one dependency:

    npm install @mysten/sui
    PKG=0x...  SPONSOR_KEY=suiprivkey...  ORIGIN=https://suifoot.fun  node tools/sponsor.js

`SPONSOR_KEY` is a key made only for this, holding only what you are willing to see spent. Never the
league's key, never a key that holds anything else. On testnet, fund it from the faucet; later, the
treasury tops it up.

## Turning it on in the page

Two edits, made together, because the page's security policy forbids talking to anywhere it was not
told about:

1. `src/chain.js`: set `sponsor: 'https://where-it-runs.example'` (and `rpc` if not the default).
2. `index.html`: add the sponsor's address and `https://fullnode.testnet.sui.io` to `connect-src`.

If the sponsor is down, resting or rationing, the page quietly falls back to the person paying.

## What is not covered

Transactions that name something the person owns - a coin, a ticket - cannot be built by the page
without asking a node for its version, so they pay their own way: paying the entry fee and claiming
a drawn club. Everything that is only shared objects - every decision, every job, the draw - is
sponsored. The sponsored path has been tested against its policy, not against a live wallet.
