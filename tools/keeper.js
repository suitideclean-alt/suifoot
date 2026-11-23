/* The league's keeper: the one job that has to be done by somebody when the league runs by the clock.
 *
 * By hand, anybody presses a button when they want a matchday played. By the clock the matchday
 * is played at a time everybody agreed, and something has to be there at that time to ask the chain
 * for the dice - and, afterwards, to turn the season, and to take back the clubs whose owners did
 * not pay. This is that something, and it is deliberately small: it holds no money, makes no
 * decision, and every one of its actions is one the contract would refuse unless it was due. If the
 * keeper is slow, the league waits; if it is wrong, the contract says no; if it is gone, anybody
 * with the league's key can do the same by hand.
 *
 *     node tools/keeper.js            one pass: do what is due, print what was done
 *     DRY=1 node tools/keeper.js      say what would be done, and do none of it
 *
 * Meant to be run every few minutes by something that is always on - see .github/workflows/keeper.yml.
 */
const { execFileSync } = require('child_process');
const path = require('path');

/** What is due, given how the league stands and what time it is. Pure: nothing here touches a chain. */
function plan(lg, clubs, now) {
  const todo = [];
  if (!lg) return todo;
  const SF = globalThis.SF;
  /* Anybody may take back a club whose owner is behind, by hand or by the clock; it is the keeper's
   * job only in that somebody has to notice. */
  for (const c of clubs || []) {
    const o = SF.Chain.owes(lg, c);
    if (o && o.late) todo.push({ do: 'reclaim', club: c.id, why: `club ${c.num} has not paid for season ${lg.season}` });
  }
  if (lg.manual) return todo;             // by hand there is no clock to keep

  const drawn = lg.seeds.length - lg.seasonFrom[lg.seasonFrom.length - 1];   // this season's draws
  if (lg.week > lg.weeks) {
    todo.push({ do: 'next_season', why: `season ${lg.season} has run its calendar` });
  } else if (drawn < lg.week && now >= SF.Chain.kickoff(lg, lg.week)) {
    todo.push({ do: 'draw_week', why: `matchday ${lg.week} kicked off` });
  }
  return todo;
}

function load() {
  globalThis.SF = {};
  for (const f of ['q', 'core', 'hash', 'calendar', 'identity', 'seal', 'market', 'bank', 'body',
    'world', 'match', 'game', 'owner', 'boss', 'actions', 'extras', 'chain'])
    require(path.join(__dirname, '..', 'src', f + '.js'));
  return globalThis.SF;
}

function sui(args) {
  const out = execFileSync('sui', ['client', 'call', '--gas-budget', '300000000', '--json', ...args], { encoding: 'utf8' });
  const j = JSON.parse(out);
  return j.effects && j.effects.status && j.effects.status.status;
}

async function main() {
  const SF = load();
  const C = SF.Chain;
  for (const k of ['PKG', 'LEAGUE', 'CLUBS']) if (!process.env[k]) { console.error('missing ' + k); process.exit(2); }
  C.net.pkg = process.env.PKG; C.net.league = process.env.LEAGUE;
  C.net.clubs = process.env.CLUBS.trim().split(/\s+/).filter(Boolean);
  if (process.env.TREASURY) C.net.treasury = process.env.TREASURY;

  const w = await C.world();
  const todo = plan(w.league, w.clubs, Date.now());
  if (!todo.length) { console.log('nothing is due (season ' + w.league.season + ', matchday ' + w.league.week + ')'); return; }

  let failed = 0;
  for (const a of todo) {
    console.log((process.env.DRY ? 'would ' : '') + a.do + ' - ' + a.why);
    if (process.env.DRY) continue;
    try {
      const at = (m, f, args) => sui(['--package', C.net.pkg, '--module', m, '--function', f, '--args', ...args]);
      let status;
      if (a.do === 'draw_week') status = at('league', 'draw_week', [C.net.league, '0x8', '0x6']);
      else if (a.do === 'next_season') status = at('league', 'next_season', [C.net.league]);
      else status = at('entry', 'reclaim', [C.net.league, a.club]);
      console.log('  ' + status);
      if (status !== 'success') failed++;
    } catch (e) {
      /* The contract refusing is an answer, not a fault: another keeper, or a person, may have got
       * there first. It is reported and the pass goes on to the next thing. */
      console.log('  refused: ' + String(e.stderr || e.message).split('\n').filter(Boolean).slice(-1)[0]);
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
}

module.exports = { plan };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
