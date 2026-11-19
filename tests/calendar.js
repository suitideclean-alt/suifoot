// Game weeks against real time. The calendar never reads the clock: the moment is always passed in,
// so two machines, or a browser and a contract, always reach the same answer.
const SF = require('./load.js');
const { Game, Cal, CFG } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

const jogo = () => Game.newGame({ seed: 5, coaches: [{ name: 'A', role: 'both' }] });
const DIA = 86400000, MIN = 60000;
const QUANDO = Date.UTC(2026, 10, 23); // a Monday, midnight UTC

t('the calendar reads no clock of its own', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'calendar.js'), 'utf8');
  const corpo = src.slice(src.indexOf('(function'));
  eq((corpo.match(/Date\.now|performance\.now/g) || []).length, 0, 'the calendar reaches for the clock;');
  // the one use of Date is to write a moment out as text
  eq((corpo.match(/new Date\(/g) || []).length, 1, 'Date is used for more than printing;');
});

t('a game with no first day has no dates at all', () => {
  const G = jogo();
  truthy(!Cal.dated(G), 'an undated game claims to have dates');
  eq(Cal.kickoff(G, 1), null); eq(Cal.lock(G, 1), null); eq(Cal.table(G).length, 0);
  eq(Cal.phaseAt(G, 1, QUANDO), 'open', 'with no dates everything stays open;');
});

t('a first day sets every matchday at the hours the config names', () => {
  const G = jogo();
  truthy(Cal.start(G, QUANDO + 13 * 3600000).ok, 'the first day was refused'); // mid-afternoon
  eq(G.t0, QUANDO, 'the first day was not snapped to midnight UTC;');
  eq(Cal.text(Cal.kickoff(G, 1)), '2026-11-23T12:00:00Z', 'first whistle;');
  eq(Cal.text(Cal.kickoff(G, 2)), '2026-11-23T20:00:00Z', 'second whistle, the same day;');
  eq(Cal.text(Cal.kickoff(G, 3)), '2026-11-24T12:00:00Z', 'third whistle, the next day;');
  eq(Cal.text(Cal.lock(G, 2)), '2026-11-23T19:30:00Z', 'lineups close half an hour before;');
  eq(Cal.text(Cal.draw(G, 2)), '2026-11-23T19:45:00Z', 'the draw a quarter of an hour before;');
  eq((Cal.kickoff(G, 2) - Cal.kickoff(G, 1)) / 3600000, 8, 'hours between the two of one day;');
  eq((Cal.kickoff(G, 3) - Cal.kickoff(G, 2)) / 3600000, 16, 'hours from the evening to the next midday;');
});

t('how many kick-off hours there are sets how long a season lasts', () => {
  const antes = CFG.kickoffsUtc;
  try {
    const G = jogo();
    Cal.start(G, QUANDO);
    const n = G.sched.length;
    CFG.kickoffsUtc = [20 * 60];
    eq(Cal.days(G), n * CFG.daysPerWeek, 'one a day should take one day for each matchday;');
    CFG.kickoffsUtc = [12 * 60, 20 * 60];
    eq(Cal.days(G), Math.ceil(n / 2), 'two a day should halve the season;');
    CFG.kickoffsUtc = [9 * 60, 14 * 60, 20 * 60];
    eq(Cal.days(G), Math.ceil(n / 3), 'three a day should take a third of it;');
  } finally { CFG.kickoffsUtc = antes; }
});

t('a first day that is not a number is refused', () => {
  const G = jogo();
  for (const v of [NaN, Infinity, 'amanhã', null, undefined, {}, -1]) truthy(!Cal.start(G, v).ok, 'accepted ' + String(v));
  truthy(!Cal.dated(G), 'a refused date still landed');
});

t('a matchday goes open, locked, drawn, played', () => {
  const G = jogo();
  Cal.start(G, QUANDO);
  const k = Cal.kickoff(G, 1);
  eq(Cal.phaseAt(G, 1, k - 60 * MIN), 'open', 'an hour before;');
  eq(Cal.phaseAt(G, 1, k - 31 * MIN), 'open', 'just before lineups close;');
  eq(Cal.phaseAt(G, 1, k - 30 * MIN), 'locked', 'the moment they close;');
  eq(Cal.phaseAt(G, 1, k - 16 * MIN), 'locked', 'before the draw;');
  eq(Cal.phaseAt(G, 1, k - 15 * MIN), 'drawn', 'the moment of the draw;');
  eq(Cal.phaseAt(G, 1, k), 'played', 'the whistle;');
  eq(Cal.phaseAt(G, 1, k + DIA), 'played', 'a day later;');
});

t('the season knows when it is time to play, and never before', () => {
  const G = jogo();
  Cal.start(G, QUANDO);
  truthy(!Cal.ready(G, Cal.kickoff(G, 1) - 1), 'it wanted to play a minute early');
  truthy(Cal.ready(G, Cal.kickoff(G, 1)), 'it would not play on the hour');
  Game.playWeekAuto(G);
  eq(G.week, 2, 'the week did not move on;');
  truthy(!Cal.ready(G, Cal.kickoff(G, 1) + 60 * MIN), 'it wanted to play two matchdays on the same day');
  truthy(Cal.ready(G, Cal.kickoff(G, 2)), 'it would not play the next day');
});

t('a season runs its days and the next starts after the break', () => {
  const G = jogo();
  Cal.start(G, QUANDO);
  const n = G.sched.length;
  truthy(n >= 45 && n <= 55, 'a season should be about fifty matchdays, it has ' + n);
  eq((Cal.nextSeasonStart(G) - G.t0) / DIA, Cal.days(G) + CFG.breakDays, 'the break between seasons is wrong;');
  truthy(Cal.seasonEnd(G) > Cal.kickoff(G, 1), 'the season ends before it starts');
  const horas = CFG.kickoffsUtc.map((m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')).join(' e ');
  console.log(`      (${n} jornadas em ${Cal.days(G)} dias, as ${horas} UTC, de ${Cal.text(Cal.kickoff(G, 1))} a ${Cal.text(Cal.seasonEnd(G))})`);
});

t('the whole season comes out as a list a keeper can work from', () => {
  const G = jogo();
  Cal.start(G, QUANDO);
  const tab = Cal.table(G);
  eq(tab.length, G.sched.length, 'one line per matchday;');
  eq(tab[0].week, 1);
  truthy(tab[0].lock < tab[0].draw && tab[0].draw < tab[0].kickoff, 'the three moments are out of order');
  for (let i = 1; i < tab.length; i++) truthy(tab[i].kickoff > tab[i - 1].kickoff, 'the matchdays are out of order');
  truthy(tab.every((x) => ['L', 'C', 'E'].includes(x.kind)), 'a matchday has no kind');
});

t('the dates survive a save and the state root covers them', () => {
  const G = jogo();
  Cal.start(G, QUANDO);
  const raiz = SF.State.root(G);
  const H = Game.deserialize(Game.serialize(G));
  eq(H.t0, G.t0, 'the first day did not survive;');
  eq(Cal.text(Cal.kickoff(H, 7)), Cal.text(Cal.kickoff(G, 7)), 'a matchday moved across a save;');
  // and changing the calendar changes the root, so nobody can move a deadline quietly
  Cal.start(G, QUANDO + DIA);
  truthy(SF.State.root(G) !== raiz, 'moving the season did not change the state root');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
