/* Several people, with real wallets, really playing (tools/agents.js).
 *
 * Everything else in the suite proves the rules. This proves the system: that a person with a
 * wallet can take a club, press every button there is, and have the league come out the way the
 * screen said it would - with real signatures, real gas and a real node, on a league nobody
 * prepared for the occasion.
 *
 * Each agent is a throwaway key. It joins, claims its club, and then every matchday decides a
 * batch of things a person might decide, signing each for itself. Afterwards the chain is read
 * back, the season is worked out from it, and three questions are asked:
 *
 *   - did the transaction land at all, and what did it cost?
 *   - did what landed do what the agent meant? Where the game refuses, that is an answer and not
 *     a failure - but a decision that lands and then does nothing is a hole.
 *   - do two readings of the same chain give the same league? If they ever disagree, that is the
 *     worst thing this design can do, and it has to be caught here rather than by a player.
 *
 * What it finds goes into a report, unvarnished.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

globalThis.SF = {};
for (const f of ['q', 'core', 'hash', 'calendar', 'identity', 'seal', 'market', 'bank', 'body',
  'world', 'match', 'game', 'owner', 'boss', 'actions', 'extras', 'chain', 'genesis', 'replay', 'bridge'])
  require(path.join(__dirname, '..', 'src', f + '.js'));
require(path.join(__dirname, 'brain.js'));
const SF = globalThis.SF;
const C = SF.Chain;

const PKG = process.env.PKG;
const LEAGUE = process.env.LEAGUE;
const CLUBS = (process.env.CLUBS || '').trim().split(/\s+/).filter(Boolean);
const WEEKS = +(process.env.WEEKS || 4);
const AGENTS = +(process.env.AGENTS || 3);
const PER_WEEK = +(process.env.PER_WEEK || 6);

C.net.pkg = PKG; C.net.league = LEAGUE; C.net.clubs = CLUBS;

const sui = (args, quiet) => {
  try {
    return execFileSync('sui', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] });
  } catch (e) { return { bad: true, out: (e.stdout || '') + (e.stderr || '') }; }
};
const json = (args) => { const r = sui(args, true); if (r.bad) return { bad: true, out: r.out }; try { return JSON.parse(r); } catch (_) { return { bad: true, out: String(r).slice(0, 400) }; } };

const report = { started: new Date().toISOString(), agents: [], steps: [], findings: [], gas: { calls: 0, mist: 0 } };
const find = (what, detail) => { report.findings.push({ what, detail }); console.log(`  !! ${what}: ${detail}`); };

const gasOf = (r) => {
  const g = r && r.effects && r.effects.gasUsed;
  if (!g) return 0;
  return Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate);
};

/** wait for the node that answers questions to catch up with the chain that already moved */
async function settle(ms) { await new Promise((r) => setTimeout(r, ms || 2500)); }

async function readLeague() {
  for (let i = 0; i < 25; i++) {
    try {
      const world = await C.world();
      const decisions = await C.decisions();
      if (world.clubs.length) return { world, decisions };
    } catch (_) { /* the node is behind; ask again */ }
    await settle(2000);
  }
  throw new Error('the node never answered with a league');
}

(async () => {
  console.log(`package ${PKG}\nleague  ${LEAGUE}\n${CLUBS.length} clubs, ${AGENTS} agents, ${WEEKS} matchdays\n`);

  // ---- the people ----
  for (let i = 0; i < AGENTS; i++) {
    const made = json(['client', 'new-address', 'ed25519', '--json']);
    const addr = made.address || (made.bad ? null : null);
    if (!addr) { find('a wallet could not be made', JSON.stringify(made).slice(0, 200)); continue; }
    report.agents.push({ n: i + 1, addr, club: null, role: ['owner', 'coach', 'both'][i % 3], done: 0, refused: 0, failed: 0 });
    console.log(`agent ${i + 1} (${['owner', 'coach', 'both'][i % 3]}) is ${addr}`);
  }

  for (const a of report.agents) {
    sui(['client', 'switch', '--address', a.addr], true);
    /* Two goes each: one SUI covers a few dozen decisions, but taking a club and then signing a
     * matchday's worth of them on top is more than one comfortably carries. */
    for (let g = 0; g < 2; g++) {
      const f = sui(['client', 'faucet', '--url', 'https://faucet.testnet.sui.io'], true);
      if (f.bad && g === 1) find('the faucet refused an agent', `${a.addr}: ${String(f.out).slice(0, 160)}`);
      await settle(12000);
    }
  }
  await settle(9000);

  // ---- each takes a club ----
  for (const a of report.agents) {
    sui(['client', 'switch', '--address', a.addr], true);
    const join = json(['client', 'call', '--package', PKG, '--module', 'market', '--function', 'request_join',
      '--args', LEAGUE, '0x8', '--gas-budget', '500000000', '--json']);
    if (join.bad) { find('taking a club failed outright', `agent ${a.n}: ${String(join.out).slice(0, 300)}`); a.failed++; continue; }
    report.gas.calls++; report.gas.mist += gasOf(join);

    const ticket = (join.objectChanges || []).find((c) => c.objectType && /::market::JoinTicket$/.test(c.objectType));
    if (!ticket) { find('no ticket came back from the draw', `agent ${a.n}`); a.failed++; continue; }
    const obj = json(['client', 'object', ticket.objectId, '--json']);
    const club = JSON.stringify(obj).match(/"club":"(0x[0-9a-f]{64})"/);
    if (!club) { find('the ticket did not name a club', `agent ${a.n}`); a.failed++; continue; }

    const claim = json(['client', 'call', '--package', PKG, '--module', 'market', '--function', 'claim',
      '--args', ticket.objectId, LEAGUE, club[1], '--gas-budget', '500000000', '--json']);
    if (claim.bad) { find('the ticket could not be turned in', `agent ${a.n}: ${String(claim.out).slice(0, 300)}`); a.failed++; continue; }
    report.gas.calls++; report.gas.mist += gasOf(claim);
    a.clubId = club[1];
    console.log(`agent ${a.n} took ${club[1].slice(0, 10)}…`);
  }
  await settle(6000);

  // which club number each agent ended up with
  let { world, decisions } = await readLeague();
  for (const a of report.agents) {
    const c = world.clubs.find((x) => x.id === a.clubId);
    a.club = c ? c.num : null;
    a.name = c ? c.name : null;
    if (!a.club) find('an agent took a club the league does not show', `agent ${a.n} ${a.clubId}`);
  }

  // ---- the season ----
  const tried = new Set();
  for (let week = 1; week <= WEEKS; week++) {
    console.log(`\n--- matchday ${week} ---`);
    const G = SF.Replay.run(world, decisions);

    for (const a of report.agents) {
      if (!a.club) continue;
      sui(['client', 'switch', '--address', a.addr], true);
      const plan = SF.Brain.plan(G, a.club, 7777 + week, week).slice(0, PER_WEEK);
      for (const p of plan) {
        tried.add(p.kind);
        const r = json(['client', 'call', '--package', PKG, '--module', 'decide', '--function', 'decide',
          '--args', LEAGUE, a.clubId, String(p.kind), String(p.a), String(p.b), '[]', '0x6',
          '--gas-budget', '200000000', '--json']);
        if (r.bad) {
          a.failed++;
          report.steps.push({ week, agent: a.n, kind: p.kind, note: p.note, landed: false, why: String(r.out).slice(0, 200) });
          find('a decision could not be signed', `agent ${a.n} kind ${p.kind} (${p.note}): ${String(r.out).slice(0, 160)}`);
        } else {
          a.done++;
          report.gas.calls++; report.gas.mist += gasOf(r);
          report.steps.push({ week, agent: a.n, kind: p.kind, note: p.note, landed: true, gas: gasOf(r) });
        }
      }
    }

    // and the matchday itself, which anybody may draw while the league is played by hand
    sui(['client', 'switch', '--address', report.agents[0].addr], true);
    const draw = json(['client', 'call', '--package', PKG, '--module', 'league', '--function', 'draw_week',
      '--args', LEAGUE, '0x8', '0x6', '--gas-budget', '500000000', '--json']);
    if (draw.bad) find('the matchday could not be drawn', String(draw.out).slice(0, 200));
    else { report.gas.calls++; report.gas.mist += gasOf(draw); }

    await settle(6000);
    ({ world, decisions } = await readLeague());

    // two readings of the same chain have to be the same league
    const a1 = SF.Replay.run(world, decisions);
    const a2 = SF.Replay.run(world, decisions);
    if (JSON.stringify(a1.table) !== JSON.stringify(a2.table)) find('two readings gave two leagues', `matchday ${week}: the tables differ`);
    if (JSON.stringify(a1.bank.acc) !== JSON.stringify(a2.bank.acc)) find('two readings gave two sets of books', `matchday ${week}`);

    const played = Math.max(...a1.clubIds.map((id) => a1.table[id].p));
    console.log(`  drawn: ${(world.league.seeds || []).length} · decisions on chain: ${decisions.length} · played: ${played}`);
    const refusedNow = a1.refused.length;
    if (refusedNow) console.log(`  refused by the rules: ${a1.refused.slice(0, 4).map((x) => x.kind + ':' + x.why).join(', ')}${refusedNow > 4 ? ` (+${refusedNow - 4})` : ''}`);
  }

  // ---- what came of it ----
  const G = SF.Replay.run(world, decisions);
  report.refused = G.refused.map((r) => ({ club: r.num, kind: r.kind, why: r.why }));

  // a decision that lands and changes nothing is a hole, so every kind tried is accounted for
  const landed = new Set(report.steps.filter((s) => s.landed).map((s) => s.kind));
  const refusedKinds = new Set(G.refused.map((r) => r.kind));
  const never = SF.Brain.everyKind().filter((k) => !tried.has(k));
  report.coverage = {
    kinds: SF.Brain.everyKind().length,
    tried: tried.size,
    landed: landed.size,
    never,
    alwaysRefused: Array.from(landed).filter((k) => refusedKinds.has(k) && G.refused.filter((r) => r.kind === k).length === report.steps.filter((s) => s.landed && s.kind === k).length),
  };
  if (never.length) find('kinds of decision nobody tried', never.join(', '));
  for (const k of report.coverage.alwaysRefused) find('a decision that always lands and never does anything', `kind ${k}`);

  for (const a of report.agents) {
    const club = a.club ? G.clubs['c' + a.club] : null;
    a.ended = club ? { name: club.name, cap: club.cap, price: club.price, squad: club.squad.length, money: SF.Bank.bal(G, club.id), board: club.boss ? { lines: club.boss.lines, merch: club.boss.merch, proj: club.boss.proj, bonds: club.boss.bonds.length } : null } : null;
  }
  report.league = G.clubIds.map((id) => ({ name: G.clubs[id].name, ...G.table[id], money: SF.Bank.bal(G, id), owner: G.clubs[id].chainOwner }));
  report.finished = new Date().toISOString();

  fs.writeFileSync('agents-report.json', JSON.stringify(report, null, 1));
  writeMarkdown(report);

  console.log(`\n=== ${report.findings.length} thing(s) to fix ===`);
  for (const f of report.findings) console.log(`  - ${f.what}: ${f.detail}`);
  console.log(`\ngas: ${report.gas.calls} calls, ${(report.gas.mist / 1e9).toFixed(4)} SUI`);
  process.exit(0);
})().catch((e) => { console.log('the run itself fell over: ' + e.message); console.log(e.stack); process.exit(1); });

function writeMarkdown(r) {
  const L = [];
  L.push(`# What the agents found\n`);
  L.push(`${r.agents.length} wallets, ${r.steps.length} decisions signed, ${(r.gas.mist / 1e9).toFixed(4)} SUI of gas.\n`);
  L.push(`## To fix\n`);
  if (!r.findings.length) L.push(`Nothing. Every decision landed and the league came out the same on every reading.\n`);
  for (const f of r.findings) L.push(`- **${f.what}** — ${f.detail}`);
  L.push(`\n## Who played\n`);
  L.push(`| agent | role | club | decisions | refused by the rules | would not sign |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const a of r.agents) {
    const refused = (r.refused || []).filter((x) => x.club === a.club).length;
    L.push(`| ${a.n} | ${a.role} | ${a.name || '—'} | ${a.done} | ${refused} | ${a.failed} |`);
  }
  L.push(`\n## Every kind of decision\n`);
  L.push(`${r.coverage.tried} of ${r.coverage.kinds} tried, ${r.coverage.landed} landed on the chain.`);
  if (r.coverage.never.length) L.push(`\nNever tried: ${r.coverage.never.join(', ')}`);
  L.push(`\n## The league they left behind\n`);
  L.push(`| club | p | w | d | l | goals | pts | money |`);
  L.push(`|---|---|---|---|---|---|---|---|`);
  for (const c of (r.league || []).sort((a, b) => b.pts - a.pts)) {
    L.push(`| ${c.name}${c.owner ? ' *(taken)*' : ''} | ${c.p} | ${c.w} | ${c.d} | ${c.l} | ${c.gf}:${c.ga} | ${c.pts} | $${c.money.toLocaleString('en-US')} |`);
  }
  fs.writeFileSync('agents-report.md', L.join('\n') + '\n');
}
