# SuiFoot

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
- Save/load in the browser, export/import save files.

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
src/ui.js                   interface
tests/                      node tests, balance and economy simulations, browser tests (Playwright)
```

## Tests

```bash
npm test                    # 14 engine tests + translation completeness check
npm run balance             # match-engine statistics over 100 simulated seasons
npm run sim                 # 30 seasons: talent and money supply stay stable
python3 tests/browser.py    # end-to-end with Playwright (needs `python3 -m http.server 8765` running)
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
