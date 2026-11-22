// How many numbers a season needs drawn.
//
// One per week of the calendar, which is the league's matchdays plus the cup rounds and European
// nights that fall between them. Asked of the game rather than worked out a second time here, so
// that the contract's limit and the calendar it is meant to match cannot drift apart.
const path = require('path');
globalThis.SF = {};
for (const f of ['q', 'core', 'hash', 'calendar', 'identity', 'seal', 'market', 'bank', 'body',
  'world', 'match', 'game', 'owner', 'boss', 'actions', 'extras']) require(path.join(__dirname, '..', 'src', f + '.js'));
const SF = globalThis.SF;
const G = SF.Game.newGame({ seed: 1, coaches: [{ name: 'x' }] });
process.stdout.write(String(G.sched.length));
