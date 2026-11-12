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
