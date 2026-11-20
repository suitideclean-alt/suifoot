# The contract

Where the Move package stands, what has been proved about it, and what has not.

The package lives in `move/suifoot`. It is compiled and tested by the `move` workflow on every push,
against a pinned Sui toolchain, because the machine it is written on has two cores and no toolchain
of its own. A round trip is about a minute.

## What is built

| Module | What it is | What is proved |
|---|---|---|
| `fx` | signed Q32.32 arithmetic: exp, ln, pow, sqrt, cos | bit for bit against `src/fixed.js` |
| `rng` | the game's random number generator | bit for bit against the browser's `SF.R` |
| `player` | a footballer and what he is worth on the pitch | within 1.3e-9 of the engine's doubles |
| `lineup` | sealed lineups, commit then reveal | the seal matches the one Node computes |
| `club` | a club as an object of its own | squad, money, table, replay guard |
| `engine` | what eleven men are worth | bit for bit against the same sums in JavaScript |
| `match_play` | ninety minutes | **the same match the browser plays** |
| `league` | the season, the shared clock, the matchday | the three deadlines, to the minute |
| `world` | clubs, squads and the men in them, drawn on chain | six thousand clubs, six thousand names |
| `market` | being given a club, or buying one | a ticket names one club and only that one |
| `season` | the table, and who goes up and down | the order, and that a champion is never dropped |
| `money` | wages, upkeep, television, a sponsor, the gate | a derby is worth a third again |

## The two things that had to be true

**The same numbers.** The generator is mulberry32 carried over step for step. JavaScript wraps its
32-bit integers silently where Move aborts on overflow, so every add and multiply is done in 64 bits
and masked back down. The browser's `f()` is the 32-bit output over 2^32 and a Q32.32 number is its
value times 2^32, so a draw's fixed-point form is the raw output widened: nothing rounds on the way
across.

**The same match.** Proved in two steps rather than one.

1. The match loop was written out again in JavaScript using whole numbers only, mirroring
   `src/match.js` draw for draw, and played against the real engine: twenty thousand matches each,
   the same squads. 2.785 goals a game against 2.815; yellows 3.36 against 3.37; reds 0.443 against
   0.448; substitutions 2.42 against 2.43; the same scorelines in the same order. It plays the same
   football.
2. That mirror was ported to Move and held to exact agreement. Eighteen men a side written out by
   hand, four seeds, and for seed 42 all seventeen events check out: the minute, the side, the kind,
   who did it and who helped.

The order the draws are taken in is as much a part of the rules as the probabilities. Move one draw
and every match after that point is a different match.

## The shape of a matchday

    T-30   lineups stop being accepted; up to here only a seal is published
    T-15   the window to show a lineup closes
    T      the whistle, and only now is the random number drawn

Drawing any earlier would let whoever saw it first decide whether to turn up. `play_fixture` is an
`entry` function on purpose: that is what stops it being wrapped in a larger transaction which
inspects the result and throws the whole thing away, turning one draw into as many as somebody cared
to pay for.

Anyone may call it once the whistle has gone. A season does not stop because the people who run it
were asleep. A manager who never turns up plays the team he last played, or failing that the best
eleven in his squad.

## One club, one object

A club is its own object rather than a row in a league object. Two matches on the same matchday touch
four different clubs, so the chain runs them at the same time; with one object for the league every
match in the world would queue behind the one before it. Hundreds of people in one season is then a
storage question rather than a speed one.

## What a match costs

Measured on the Sui testnet, not estimated. The `testnet` workflow publishes the package from
nothing, makes a league and two clubs on it and plays a match, whenever it is asked to.

| | before | after | |
|---|---|---|---|
| publishing the package | 2,830,000 | 2,830,000 | once, ever |
| making the league | 1,000,000 | 1,000,000 | once a league |
| making a club and its twenty-two men | ~90,000,000 | **~8,100,000** | eleven times cheaper |
| **playing ninety minutes** | 210,700,000 | **100,600,000** | **twice as cheap** |

Figures in MIST, where a SUI is a thousand million of them. Storage on a match is about 12,661,600
and almost all of it comes back as rebate, so computation is the whole of it.

At the reference gas price a match is about **101,000 computation units against the 5,000,000 one
transaction may spend** - two per cent. Some fifty matches would fit in a single transaction.

What it adds up to, for one series of eighteen clubs:

| | |
|---|---|
| a matchday, nine matches | 0.91 SUI |
| a season, thirty-four matchdays | **31 SUI** |
| per club, per season | **1.7 SUI** |

Setting the series up in the first place - eighteen clubs with their squads - is 0.15 SUI, once.

### Where the saving came from

Nothing was approximated and no rule was touched. The whole of it was work that was being done more
than once:

- **The series stop when their terms reach zero.** The exponential is written with sixteen terms and
  the logarithm with twenty-four, but at this scale the term falls to exactly zero by the ninth and
  the tenth at the very widest the engine reaches. A term of zero makes every term after it zero, so
  stopping leaves nothing out. This was most of it, and it is why making a club fell elevenfold: a
  squad is twenty-two men drawn from bell curves, and a bell curve is a logarithm, a square root and
  a cosine each.
- **The eleven are read where they stand** rather than copied into a fresh vector every time a side
  is weighed: two hundred and sixty-four player copies a match, for nothing.
- **The chances drawn against every minute are written out** instead of being worked out five
  hundred and forty times a match to reach the same nine numbers.
- **A side's card factor is settled when the side is named**, because it never changes afterwards.

The seed-42 test still demands all seventeen of that match's events in order, with the same scorers
at the same minutes. None of this could have changed a number without it saying so.

## What is not built

- **Prizes.** Wages, upkeep, television, a sponsor and the gate all move money now. Prizes do not,
  because they are paid in the token and the token does not exist.
- **Transfers.** Nobody can buy or sell a player.
- **The token.** Nothing of SFOOT exists. It is a package of its own and comes after this one.
- **The browser talking to the chain.** Today the game is still one browser, one world, one person.
  Nothing connects the two. This is now the largest thing missing.
- **Knockouts.** Extra time and penalty shootouts are not ported; league matches are.

## Two bugs this work found

`isqrt(2)` returned 2 in `src/fixed.js`, the file the port is written from. The starting guess
`(n>>1)+1` looks the same as `(n+1)>>1` and is not: at n = 2 it lands on the answer it is supposed to
improve, so the loop never runs. The engine's own `isqrt` was right, so the game was never affected -
but the contract would have inherited it. The specification is now checked against the engine for
every value up to 3000 instead of at three points.

A sending off or a substitution has to make both sides be weighed again at once. The browser engine
does it inside `remove()`. Leaving it out of the port meant a side playing a man short carried its
old strength until the next quarter-hour mark: no draw moved, but every probability after it was
wrong.
