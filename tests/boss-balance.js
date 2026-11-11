// Balance check for the owner business layer: compares policies over several seasons.
const SF = require('./load.js');
const { Game, Bank: B, Owner: O, Boss: Bo } = SF;
const N = +process.argv[2] || 5, SEEDS = +process.argv[3] || 6;
function season(G, co) { let g = 0; while (G.phase === 'play' && g++ < 80) { Game.playWeekAuto(G); for (const a of (G.approvals || [])) if (a.status === 'open') O.decide(G, co, a.id, true); } }
function run(policy, seed, div) {
  const G = Game.newGame({ seed, coaches: [{ name: 'T', role: 'owner' }] });
  const co = G.coaches[0]; let club = G.clubs[co.club];
  const res = { net: [], val: [], bal: [], fans: [], sup: [] };
  for (let s = 0; s < N; s++) {
    club = G.clubs[co.club];
    policy(G, co, club);
    const b0 = B.bal(G, club.id);
    season(G, co);
    res.net.push(B.bal(G, club.id) - b0); res.val.push(Bo.value(G, club)); res.fans.push(club.fans); res.sup.push(Math.round(club.boss.sup));
    if (G.phase === 'seasonEnd') Game.newSeason(G);
  }
  return res;
}
const keep = () => {};
const policies = {
  none: keep,
  lines3: (G, co, club) => { for (const k of ['acad', 'mkt', 'comm']) Bo.setLine(G, co, k, 3); },
  lines1: (G, co, club) => { for (const k of ['acad', 'mkt', 'comm']) Bo.setLine(G, co, k, 1); },
  mkt2: (G, co, club) => { Bo.setLine(G, co, 'mkt', 2); },
  premium: (G, co, club) => { Bo.setMerch(G, co, 'premium'); Bo.setMember(G, co, 'high'); },
  cheap: (G, co, club) => { Bo.setMerch(G, co, 'low'); Bo.setMember(G, co, 'low'); },
  sponsor: (G, co, club) => { if (!club.boss.spon) Bo.signSponsor(G, co, 1); },
  naming: (G, co, club) => { if (!club.boss.spon) Bo.signSponsor(G, co, 3); },
  events: (G, co, club) => { Bo.event(G, co, 'concert'); Bo.event(G, co, 'tour'); },
};
const sum = (a) => a.reduce((x, y) => x + y, 0), avg = (a) => sum(a) / a.length;
for (const [name, p] of Object.entries(policies)) {
  const rs = []; for (let i = 0; i < SEEDS; i++) rs.push(run(p, 100 + i, 3));
  const net = avg(rs.map((r) => sum(r.net))), val = avg(rs.map((r) => r.val[r.val.length - 1])), sup = avg(rs.map((r) => avg(r.sup))), fans = avg(rs.map((r) => r.fans[r.fans.length - 1]));
  console.log(name.padEnd(8), 'cash', Math.round(net).toString().padStart(9), ' value', Math.round(val).toString().padStart(9), ' sup', sup.toFixed(0), ' fans', Math.round(fans));
}
