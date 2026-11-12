# Players, condition and training (v0.9.0)

League: 72 clubs, 4 divisions of 18, 34 league matchdays, 2 promoted and 2 relegated per division, cup with 7 rounds.

## Temperament (random per player, by position)
| Kind (EN / FR / PT / DE) | Yellow cards | Red cards | Market value |
|---|---|---|---|
| Gentleman / Gentleman / Cavalheiro / Gentleman | x0.5 | x0.2 | +10% |
| Professional / Pro / Profissional / Profi | x1 | x1 | base |
| Hatchet man / Bagarreur / Caceteiro / Treter | x1.8 | x3 | -15% |
Hard types are more common in defence and midfield. Saves without a temperament get one from a hash of the player id.

## Condition (fatigue)
Temporary, 0-100. A starter loses 9 per match, a substitute 4. Below 85 a player rates 0.1 point lower per missing point, and tires late in the match. Weekly recovery: light 12, balanced 8, intense 4 (+4 if injured).

## Injuries
60% knock (1-2 weeks, no loss), 30% muscle (3-5 weeks, 50% chance of -1), 10% serious (6-14 weeks, -2 to -5 points; x1.3 over 30, x0.7 under 23; the medical centre reduces it). 40% of a loss returns at the next season turn for players under 33. Tired players and intense training raise the injury chance.

## Training (set by the coach; computer chooses for others; owner cannot)
| Mode | Development | Condition | Injuries | Morale |
|---|---|---|---|---|
| Light | x0.70 | recovers fast | x0.75 | +0.1/week |
| Balanced | x1.00 | stable | x1 | +0.2/week |
| Intense | x1.30 | falls | x1.35 | -0.6/week |
The season average of the weekly multiplier is applied at the season-end progression.

## Match
5 substitutions, penalties (about 1.2% of attacks, taker = best finisher, defender may be booked), a simple live pitch.

## Art
Badges: 18 animals x 4 shield shapes = 72 unique, colours from the club. Faces: procedural male faces (8 skin tones, 10 hair styles, 7 beard types). Both are drawn in code from the id, so only the id would need to be stored on-chain.

## Dropping out of the fourth division (v0.9.3)
There is no league below division 4. If a human's club ends in the bottom two there, the coach is sacked with no severance and no further wages (reputation -8), and an owner also loses the club (the club stays in division 4 under the computer; the owner restarts as a coach). Coaches are always drawn into division 4; owners pick any club.

## Facilities and projects (v0.9.3)
Facility levels go to 50. Cost of a level = the old table up to level 4, then +6% per level (x division factor). The effect counts fully up to level 5 and then follows a curve that tops out near 8. Stadium projects go to level 10: price 10, 22 units, then +45% per level; the effect counts fully up to level 2 and half after.

## Negligência do dono (v0.9.6)
Dono (role `owner`) com caixa parada (> 16 unidades semanais de TV+patrocínio da divisão) e sem reinvestir (média móvel de gastos em instalações, projetos, estádio, linhas, contratações, kit, eventos, scouting < 4 unidades) sobe `boss.neg` (0–100, +0,6 a +1,2 por semana); reinvestir desce (−2,5/semana; −1 sem caixa parada). Efeitos a 100: bilheteira −30%, patrocínio −40% (ofertas e contrato), merch/sócios −35%, humor dos adeptos −30, fãs −6%/época, humor do plantel −1,2/semana (a ~25, jogadores pedem saída). Simulação 10 épocas dono passivo: fãs 3,3k→2,6k, saldo época 10 ≈1,2M (antes 2,6M); dono ativo sem alteração.
