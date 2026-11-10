# SuiFoot on Sui: research notes (Nov 2026)

Sources: docs.sui.io (objects, transfer policies, randomness, currency standard, closed-loop token, Enoki/zkLogin, gas), move-book.com, Sui blog. Items marked UNVERIFIED still need checking before design is frozen.

## 1. Mapping of game pieces to Sui

| Game piece | Sui building block | Notes |
|---|---|---|
| Player | Move object (`key, store`), address-owned | Mutable stats stored in the object or in dynamic fields (UNVERIFIED: dynamic-field docs not yet read). Burned at retirement; legend card is a separate non-transferable object. |
| Club | Object, address-owned by the Owner (fast path, no consensus) | Squad = player objects owned by the club object ("owned by another object") or a table. |
| Stadium, shirt | Objects attached to the Club | |
| Owner / Coach permissions | Capability objects (`OwnerCap`, `CoachCap`) | Docs warn: referencing a shared object does not mean the caller is authorised; always check caps. Limits (budget, wage cap, min sale price) live in the Club object and are enforced in Move. |
| Coach profile | Non-transferable object (no `store` ability, so custom transfer rules only) | Soulbound-style. |
| SFOOT | `Coin<SFOOT>` via the Coin Registry (`coin_registry::new_currency_with_otw`); `TreasuryCap` mint/burn | Coin Registry replaces the old `coin::create_currency`. Mirrors the local bank ledger (mint/burn/transfer). |
| League treasury (counterparty for AI clubs) | Shared object holding a `Balance<SFOOT>` | Spends only what it holds. Contention: use a few treasuries (per league) rather than one global. |
| Market (player sales) | Kiosk + `TransferPolicy` | Rules (royalty, lock, min price, owner approval) must all pass in one transaction. Use Personal Kiosk to avoid bypass by transferring the `KioskOwnerCap`. |
| Offers / loans / contracts | Escrow shared object or owned-object swap | Docs have a "trustless swap" example in both styles. |
| Academy potential, injuries | `sui::random` (object `0x8`) | See randomness rules below. |
| Onboarding | zkLogin (Google login) + sponsored transactions (Enoki) | No wallet, no SUI needed to start. |
| Match simulation | Off-chain (server), result committed on-chain | See open problem A. |

## 2. Findings that change the plan

1. **Closed-loop tokens are deprecated in favour of PAS.** The docs now say to use the Permissioned Asset Standard in place of Closed-Loop Token. A closed-loop token can only be owned by an account (not stored in an app), which also makes treasury/escrow awkward. Decision needed: plain `Coin<SFOOT>` + our own rules in Move, or PAS. Read the PAS docs before choosing.
2. **Randomness:** functions that take `&Random` must be `entry` (not `public`) to prevent composition attacks, where an attacker's transaction inspects the result and aborts to re-roll. Compiler lints this. Academy intake and injuries must follow this pattern.
3. **Kiosk bypass:** transferring the `KioskOwnerCap` bypasses kiosk rules unless a Personal Kiosk is used. Our "untouchable player", "min price 80%" and "owner approval" rules must be TransferPolicy rules and players must be locked in kiosks.
4. **Owned vs shared:** owned objects use the fast path (cheap, no contention); shared objects need consensus. Keep clubs/players owned; only treasuries, escrows and the league calendar are shared.
5. **Gas:** total = computation + storage - rebate. Deleting objects returns most of the storage fee, so burning retired players and expired offers is cheap or even positive. Sponsored transactions let the game pay gas; Enoki lets you set per-user caps. Exact current prices UNVERIFIED.
6. **Game examples exist:** Mysten's Plinko and Solitaire examples show a game with state in a shared object, randomness, backend-signed "house" calls and Enoki sponsorship. Good templates for our server-signed round results.

## 3. Open problems (need design, not just docs)

- **A. Who runs the match?** Simulating 48-club leagues on-chain per minute is too heavy and expensive. Options: (1) server simulates with a deterministic seed derived from on-chain randomness, publishes result + hash; anyone can replay with the open-source engine (optimistic, with challenge window); (2) pure trusted server first. Recommended: 2 for testnet, 1 later.
- **B. Shared calendar** for several leagues and the Champions League: a shared `Season` object advanced by an authorised cap (server) once per round.
- **C. Unique club names:** a shared registry (Table name -> club id); one rename allowed. Contention is low (names are rare writes).
- **D. Economy:** emission cap, who pays real value in, and whether SFOOT can be cashed out. This is a legal question before a technical one.

## 4. Legal / risk (not legal advice)

Real-money player trading plus a token that can be cashed out can fall under gambling, securities or e-money rules depending on country. Play-money testnet first; get legal review before any real value. Also budget for a Move audit before mainnet.

## 5. Suggested phases

1. v0.4 owner/coach roles in the local game (no chain) to validate rules and abuse cases.
2. Move spec (one page): objects, caps, limits, policies.
3. Move prototype on **testnet**: SFOOT coin, Club, Player, Kiosk + policy, academy mint with `random`, unit tests (`sui move test`).
4. Web client with zkLogin + sponsored tx; server runs matches and posts results.
5. Closed beta with play-money; economy simulation; audit; legal review; only then real value.

## 6. Still to read (UNVERIFIED)

Dynamic fields vs dynamic object fields (Table/Bag), PAS docs, Enoki limits/pricing, current gas prices, Move testing and audit tooling, event indexing for the client.
