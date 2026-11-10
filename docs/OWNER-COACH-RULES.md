# Owner and coach rules (v0.4)

Game rules inspired by real football employment practice. They follow the principles, not any country's law: coaches have no standard contract (it is whatever the contract says), laws differ by country and FIFA reformed its Article 17 recently. Real-world notes are in docs/SUI-RESEARCH.md and the sources at the end. All numbers below are game parameters and live in `CFG.owner` in `src/owner.js`.

## Status (v0.4.0)
Done: coach role with a computer owner (limits, requests, contract, pay-offs, bonuses, profit share), owner-coach role (Owner tab: wallet, withdraw above the reserve, invest), tests including abuse attempts.
Next: the **owner** role (you hire and fire a computer coach, edit the limits, decide requests in an inbox, coach market), then multi-league.

## Roles
- **Coach** (today's game): you coach, the computer is the owner with a default policy sized to the club.
- **Owner-coach**: you own and coach. Limits do not apply to you. You can still sign yourself a contract; it is paid by you to you (no effect), and only coach reputation counts.
- **Owner**: you own the club and hire a computer coach. The coach acts inside your limits. (Second step of v0.4.)

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
