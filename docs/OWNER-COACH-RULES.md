# Owner and coach rules (v0.4)

Game rules inspired by real football employment practice. They follow the principles, not any country's law: coaches have no standard contract (it is whatever the contract says), laws differ by country and FIFA reformed its Article 17 recently. Real-world notes are in docs/SUI-RESEARCH.md and the sources at the end. All numbers below are game parameters and live in `CFG.owner` in `src/owner.js`.

## Status (v0.5.0)
All three roles are playable: **coach**, **owner-coach** and **owner**. In owner mode a computer coach is hired from a market (12 candidates, refreshed each season), with a contract you set (seasons, break clause, cap on the pay-off, mitigation; clauses raise his salary). He picks the team, trains, signs free agents, buys, sells, renews and promotes academy players inside your limits. Above them he files a request (at most 3 open at once); you approve or decline in the Owner tab, and an approval is used once within 3 game weeks. A legal squad is the one thing he may do outside the limits (cheapest free agents). Firing without cause pays the rest of the contract in weekly instalments (break clause replaces it); mutual termination pays 40-60%; 3 matchdays of unpaid wages let him leave with just cause; he also earns a win/draw match bonus set in his contract; a bigger club can poach him (it pays the break clause or a year of salary); he gets the profit share on sales of players he developed; when the contract ends he returns to the market. Not modelled: just cause for the club (a computer coach cannot breach rules).

## Owner as manager (v0.5.1)
The owner is a spectator who runs the business: no live matches, only simulate. The Owner tab has Office (suggestions, requests, coach, cash), Business (season result, balance chart, profit and loss by season, finance advisor), Team (mood, unhappy, injured, expiring contracts, best players), Objectives (league position, season result, cup; judged at season end, coach reputation moves), Coach chat (ask status, money, squad, plans; direct him to save, be ambitious, focus on youth, or change tactic; he answers from real numbers) plus Limits and Coaches.

## Roles
- **Coach** (today's game): you coach, the computer is the owner with a default policy sized to the club.
- **Owner-coach**: you own and coach. Limits do not apply to you. You can still sign yourself a contract; it is paid by you to you (no effect), and only coach reputation counts.
- **Owner**: you own the club and hire a computer coach. The coach acts inside your limits. Done in v0.5.

## Who decides what
| Level | Actions |
|---|---|
| Free for the coach | lineup, tactic, captain, promote academy players, scouts and watching, decline offers, search |
| Inside the owner's limits | buy, sign free agents, renew, sell, list, loans in and out, release a player |
| Needs owner approval | anything above the limits (a request goes to the owner inbox; it expires after 1 game week and the coach cannot proceed) |
| Owner only | stadium expansion, facilities (the coach can propose), club debt (take, repay), withdraw profit above the reserve, hire and fire the coach, change the limits |

## Limits the owner sets (policy)
Transfer budget per season, max fee per player, max wage per player, max wage bill (per week), min sale price (% of value, default 80%), untouchable list, max loans, minimum cash reserve, approval threshold (value above which a request is needed).

## Coach contract
Term (seasons), weekly salary, bonuses (league title, promotion, Europe), share of the profit on sales of players he developed (default 10%, only players he had at least one season), and clauses:
- **Coach exit clause** (default 50% of the salary still owed).
- **Club break clause** (optional fixed sum the club pays to fire him).
- **Underperformance cap** (optional): if the coach is fired while below the club objective, the pay-off is capped at 12 months of salary.
- **Mitigation** (on by default): if the sacked coach signs a new job, what he earns there reduces what is still owed. A contract can waive it.

## Ending a contract
| Case | Result |
|---|---|
| Owner fires without just cause | Owes the remaining salary, paid in weekly instalments (or a lump sum if the owner chooses). A break clause replaces this with its fixed sum. The underperformance cap applies if it exists. Mitigation applies if on. |
| Just cause by the club | Only objective cases: coach inactive more than N rounds without vacation, or breaking a rule agreed in the contract. No pay-off; keeps bonuses already earned. |
| Coach quits without just cause | Pays his exit clause (or 50% of the remaining salary if none). Cannot sign for another club for 8 weeks and loses reputation. |
| Coach quits with just cause | If the owner is more than 8 game weeks late with wages, or lowers the limits below what the contract agreed, he gets all the remaining salary and no penalty. |
| Mutual agreement | Negotiated sum (default offer 40 to 60% of what is owed). No penalty for either side. |
| Another club wants the coach | It pays compensation to the current club (default: the break clause, or 1 year of salary) and he must accept. Without agreement he cannot sign. |
| Contract ends | No pay-off. Renewal talks. |

## Players
| Case | Result |
|---|---|
| Club terminates without just cause | 100% of the remaining contract value |
| Mutual termination | 40 to 60% (this is what the old "release" button charged: 40%) |
| Player quits without just cause | Club receives at least the remaining contract value |
| Wages more than 8 weeks late | Player leaves free with just cause and is owed the remainder |

## On-chain note
A smart contract cannot judge "just cause". On Sui only objective triggers are enforced (wages more than 8 weeks late, inactivity, limits changed below the agreed minimum). Anything else goes to an arbiter (the game team at first).

## Sources
Mills & Reeve (managerial sackings), Lawyer Monthly (sacking and mitigation), Moore Barlow (remedies for sacked managers), Clarke Willmott (settlement agreements), Farleys (manager compensation), Garrigues and Record (Portuguese sports labour law, Lei 54/2017), Withers and Nirin Bar (FIFA RSTP reform). A secondary source reports that wages more than 60 days late give just cause; check with a lawyer before relying on this outside the game.

## v0.7 — Owner vs coach separation

**Owner tab** (office, business, team, manager): the owner is a spectator and businessperson. Sees P&L, mood, squad, suggestions, approves or declines the coach's requests. Does **not** touch tactics, lineup, training or skills.
**Coach tab** (your coach, objectives, limits, chat, job centre): everything about managing the coach — contract (wage, win/draw bonus, title/promotion/European bonuses, clause), objectives and prizes, spending limits, chat, hire/fire/renew.
**Job centre**: unemployed coaches and the top active ones, with CVs. Approaching a coach under contract means paying his club the clause (negotiation) plus his terms.
**Finance (owner)**: no wage cuts or loans (the coach's job; loans are requested by the coach and approved by the owner). The owner keeps ticket prices, stadium and facilities, unless a **manager** is hired (computer, less effective than an attentive owner, costs a wage).
**Auto-advance**: the owner never has to press OK each matchday; it runs until a request, event or the end of the season.
Deferred: club purchase price by division and squad value.

## Owner absent (multiplayer / on-chain spec)
- The calendar belongs to the server; matchdays run on fixed dates, nobody has to press advance.
- Coach requests that the owner does not answer expire after 1 game week and count as declined; the coach keeps working inside the limits already set.
- If the owner stays inactive for N weeks (to be defined), the coach may **leave the club for just cause**:
  - no penalty to the coach (reputation and points untouched, no clause paid);
  - he becomes unemployed and keeps receiving his wage until the end of the season **or until the club balance runs out**, whichever comes first;
  - match bonuses and prizes stop at the exit.
- **Escrow (decided):** when the contract is signed, the wage owed to the coach is locked on-chain in an escrow tied to the contract. Each matchday releases that week's wage to the coach. If the owner disappears, the coach exits for just cause and the escrow keeps paying until the end of the season or until it is empty. The owner cannot withdraw escrowed funds; any rest goes back to the club when the contract ends. The escrow is topped up at each season renewal and when the contract is renewed. Wage bonuses (win/draw, title, promotion, Europe) are paid from the club balance, not from escrow.
- **N (decided):** the coach may leave for just cause after the owner has been inactive for at least 3 matchdays **and** 7 real days. Inactive = no signed action by the owner (approve/decline, limits, tickets, stadium, contract). Opening the app does not count.
- **Club after the coach leaves (decided):**
  1. Immediately a computer coach takes over so the league never has unplayed games. He works with tighter limits and the club loses prestige for each matchday of absence, so being absent always costs the owner.
  2. If the owner is still absent after M = 10 more matchdays, the club is put on sale at a base price. Another player may buy it; the proceeds go to the absent owner minus what is owed (wages, loans).
  3. If the owner returns before the sale completes, he gets the club back and decides about the computer coach.
