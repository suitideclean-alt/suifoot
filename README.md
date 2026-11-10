<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-dark.png">
    <img src="assets/brand/lockup-light.png" alt="SuiFoot" width="420">
  </picture>
</p>

<p align="center"><b>The football manager for the Sui ecosystem</b><br><a href="https://suitideclean-alt.github.io/suifoot/">Play in your browser</a></p>

A free football-manager game in the spirit of the classic 90s manager games, made for the Sui ecosystem.
Everything runs in the browser: no server, no build step, no dependencies.

**Languages:** English, Français, Português (Brasil), Deutsch.
**Currency:** SFOOT (in-game, closed currency in this version, see "Token roadmap").

## Play

Open `index.html` in a browser, or serve the folder:

```bash
npm run serve        # then open http://localhost:8765
```

To publish on GitHub Pages: push to `main`, then in the repository go to
*Settings → Pages → Source: GitHub Actions*. The included workflow deploys the root folder.

## What is in the game

- 4 divisions x 12 fictional clubs, double round-robin league (22 matchdays) plus a 48-club knockout cup (extra time and penalties).
- Promotion and relegation (2 up, 2 down), season awards and prize money (champions, cup winner, top scorer).
- Minute-by-minute match engine with sectors (GK/DF/MF/FW), formations, tactics, cards, injuries, substitutions. Watch your match live or simulate.
- You are the coach: board confidence, objectives, **sackings**, **job offers from other clubs**, reputation, XP and skills (training, tactics, negotiation, youth).
- Transfers (buy, sell, list for sale, free agents, contract renewals and releases), unsolicited offers from AI clubs.
- Finances: gate receipts, TV, sponsors, wages, ticket price, **stadium expansion**, youth academy and training ground, **bank loans** with interest, overdraft fees.
- Player evolution: young players grow towards a hidden potential, veterans decline and retire, youth intake every season.
- Local multiplayer (hot-seat, 1-4 coaches on the same device). Single-player against the machine.
- **European Champions Cup**: the top 4 of Division 1 join 12 clubs from other countries (4 groups, quarter-finals, semi-finals, final). Full stadiums and big prizes: the winner earns twice the Division 1 champion.
- **Star players** (rating 80+): more expensive, more flair, but a team can only carry about 27% of them (3 in the XI). With more, the dressing room breaks and the whole team declines.
- **Loans**: borrow players or loan yours out for 1 or 2 seasons.
- **Holiday mode**: the game runs by itself, your staff renews contracts, no signings or sales happen while you are away.
- **Finance advisor**: a money map (where you earn and lose) plus concrete advice with one-click actions (ticket price, stadium, wage cuts, loans, selling).
- **Reputation** with an itemised log (what raised or lowered it) and perks (sponsors, job offers).
- Season-end celebration with your club badge: titles, cup, promotion, top scorer, European run, prize money.
- **Player sheet** (click any name): potential, value history chart, goals and games per season, morale, release clause, tag ("young prospect", "veteran", "club idol"...).
- **Morale and dressing room**: playing time, fair wages, too many stars and bad runs move morale; unhappy players play worse, refuse contracts and ask to leave.
- **Scouts**: young players of other clubs show only a potential range; order a scouting report (3 hidden gems) or scout one player. Shortlist with rival-interest alerts.
- **Goals and achievements**: three short goals per season ("win 3 in a row", "win a derby"...) with XP and reputation, plus 17 medals.
- **Round summary** after every matchday: result, scorers, injuries, league position change, promotion/relegation zone.
- **Better live match**: possession and shots bars, named chances, goal banner, half-time pause for tactics and substitutions.
- **Derbies and tactics**: each club has a rival (bigger gate, more board pressure) and a play style; tactics form a triangle (attack beats balanced beats defensive beats attack).
- **Club idols and captain**, **market drama** (release clauses, rival bids with a deadline), **visible academy** with promote buttons.
- **Career end**: retire, enter the Hall of Legends, start a new career with a legacy bonus.
- Charts (form, balance, player value), stadium and shirts in club colours, optional sound (off by default), mobile layout.
- Clean light theme (dark optional) whose colours follow the club you coach.
- Save/load in the browser, export/import save files (saves from 0.1 are upgraded automatically).

## Project layout

```
index.html, styles.css      app shell
src/core.js                 config (all balance numbers), seeded RNG, utilities
src/bank.js                 SFOOT ledger: credit (mint), debit (burn), transfer, loans
src/world.js                invented names, clubs, players, value/wage formulas
src/match.js                match engine
src/game.js                 calendar, league, cup, weekly economy, season rollover, evolution
src/actions.js              everything a human coach can do (market, finance, career)
src/i18n.js                 translations
src/extras.js               morale, scouting, goals, achievements, rivals, academy, legends
src/fx.js                   charts, shirts, stadium, sound
src/ui.js                   interface
tests/                      node tests, balance and economy simulations, browser tests (Playwright)
```

## Tests

```bash
npm test                    # 34 engine tests + translation completeness check
npm run balance             # match-engine statistics over 100 simulated seasons
npm run sim                 # 30 seasons: talent and money supply stay stable
python3 tests/browser8.py   # v0.3 features incl. mobile (also browser.py ... browser7.py); end-to-end with Playwright (needs `python3 -m http.server 8765` running)
```

Measured with the current numbers: about 2.6 goals per game, 43% home wins, 25% draws, the strongest
team of a division finishes on average 2nd-3rd. Over 40 simulated seasons the player-rating levels per
division and the total SFOOT supply stay stable.

## Token roadmap (SFOOT)

`src/bank.js` is deliberately shaped like a Sui `Coin<SFOOT>` treasury: `credit` = mint, `debit` = burn,
`transfer` = move between accounts, and every faucet/sink is tagged (gate, tv, sponsor, prize, wages, ...).
Planned phases:

1. **A (this version):** closed in-game currency, no real value.
2. **B:** a tradable SFOOT token on Sui (Move), with the Bank replaced by an on-chain adapter.
3. **C:** online multiplayer and prizes with real value, only after legal review.

No Move contracts are included yet: none was compiled or tested, so none is shipped.
Nothing in this repository is a token offer. Prizes with monetary value can fall under gambling and
crypto-asset regulation (for example Portuguese gambling law and the EU MiCA regulation); get legal advice
before phase B/C.

## Legal notes

- All clubs, players, badges and colours are invented. Any resemblance to real ones is coincidental.
- The name "SuiFoot" contains "Sui". Check the Sui trademark/brand policy (or ask the Sui Foundation) before
  using it commercially; renaming is a one-line change in `index.html`, `src/ui.js` and `src/i18n.js`.
- This is not legal advice.

## License

MIT, see `LICENSE`.
