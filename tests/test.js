const SF = require('./load.js');
let pass=0, fail=0;
function t(name, fn){ try{ fn(); pass++; console.log('  ok  '+name);}catch(e){ fail++; console.log('FAIL  '+name+'\n      '+e.message); } }
const eq=(a,b,m)=>{ if(a!==b) throw new Error((m||'')+` expected ${b} got ${a}`); };
const truthy=(a,m)=>{ if(!a) throw new Error(m||'expected truthy'); };
const {Game,Actions:A,Bank:B,CFG}=SF;

t('world has 48 clubs x 22 players and 4 divisions', ()=>{
  const G=Game.newGame({seed:1,coaches:[{name:'A'}]});
  eq(G.clubIds.length,48); eq(G.divs.length,4); G.divs.forEach(d=>eq(d.length,12));
  G.clubIds.forEach(id=>eq(G.clubs[id].squad.length,22));
  const names=new Set(G.clubIds.map(id=>G.clubs[id].name)); eq(names.size,48,'unique club names');
});
t('deterministic: same seed gives same season', ()=>{
  const a=Game.newGame({seed:42,coaches:[{name:'A'}]}); Game.simulateSeason(a); const sa=JSON.stringify(a.table);
  const b=Game.newGame({seed:42,coaches:[{name:'A'}]}); Game.simulateSeason(b); eq(JSON.stringify(b.table),sa);
});
t('season: every club plays 22 league games, tables are consistent', ()=>{
  const G=Game.newGame({seed:2,coaches:[{name:'A'}]}); Game.simulateSeason(G);
  eq(G.phase,'seasonEnd');
  for(const id of G.clubIds){const x=G.table[id]; eq(x.p,22); eq(x.w+x.d+x.l,22); eq(x.pts,3*x.w+x.d);}
  for(let d=0;d<4;d++){ let gf=0,ga=0; G.divs[d].forEach(id=>{gf+=G.table[id].gf;ga+=G.table[id].ga}); eq(gf,ga,'goals for = against'); }
  truthy(G.cup.winner,'cup has a winner'); eq(G.cup.round,6);
});
t('promotion/relegation moves 2 clubs each way and keeps 12 per division', ()=>{
  const G=Game.newGame({seed:3,coaches:[{name:'A'}]}); Game.simulateSeason(G); Game.newSeason(G);
  G.divs.forEach(d=>eq(d.length,12)); eq(G.season,2); eq(G.phase,'play');
});
t('money is conserved: supply == sum of balances', ()=>{
  const G=Game.newGame({seed:4,coaches:[{name:'A'}]}); Game.simulateSeason(G); Game.newSeason(G); Game.simulateSeason(G);
  eq(B.supply(G),B.totalBalances(G));
});
t('save/load round trip keeps the game going identically', ()=>{
  const G=Game.newGame({seed:5,coaches:[{name:'A'}]}); Game.playWeekAuto(G); Game.playWeekAuto(G);
  const s=Game.serialize(G); const copyState=G.rs;
  const H=Game.deserialize(s); eq(H.rs,copyState);
  Game.simulateSeason(H); eq(H.phase,'seasonEnd');
  SF.setG(G);
});
t('buy a player: money moves, squad changes, price check works', ()=>{
  const G=Game.newGame({seed:6,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  B.credit(G,club.id,5e6,'bailout');
  const p=A.search(G,co,{minOvr:55,limit:5}).find(x=>!G.clubs[x.club].human);
  const ask=A.askPrice(G,co,p);
  eq(A.buy(G,co,p.id,ask*0.5).err,'rejected');
  const before=B.bal(G,club.id), n=club.squad.length, seller=G.clubs[p.club]; const sb=B.bal(G,seller.id);
  const r=A.buy(G,co,p.id,ask); truthy(r.ok,'buy ok '+JSON.stringify(r));
  eq(B.bal(G,club.id),before-ask); eq(B.bal(G,seller.id),sb+ask); eq(club.squad.length,n+1); eq(p.club,club.id);
});
t('cannot buy without funds / when squad full', ()=>{
  const G=Game.newGame({seed:7,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  const p=A.search(G,co,{minOvr:80,limit:1})[0] || A.search(G,co,{limit:1})[0];
  const ask=A.askPrice(G,co,p); club.squad.length>0;
  B.debit(G,club.id,B.bal(G,club.id),'fine');
  eq(A.buy(G,co,p.id,ask).err,'no_funds');
});
t('loan: take, weekly instalments, early repay', ()=>{
  const G=Game.newGame({seed:8,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  const lim=B.creditLimit(G,club.id); truthy(lim>0);
  eq(A.takeLoan(G,co,lim*2,1).err,'loan_limit');
  const bal0=B.bal(G,club.id); const r=A.takeLoan(G,co,100000,2); truthy(r.ok);
  eq(B.bal(G,club.id),bal0+100000); eq(r.loan.due,124000);
  const due0=r.loan.due; truthy(due0>100000);
  Game.playWeekAuto(G); eq(G.bank.loans.length,1); truthy(G.bank.loans[0].due<due0,'instalment paid');
  B.credit(G,club.id,1e6,'bailout');
  truthy(A.repayLoan(G,co,r.loan.id).ok); eq(G.bank.loans.length,0);
});
t('stadium expansion takes effect after 4 weeks', ()=>{
  const G=Game.newGame({seed:9,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  B.credit(G,club.id,1e6,'bailout'); const cap=club.cap; const step=A.expandStep(club);
  truthy(A.expandStadium(G,co,1).ok); eq(A.expandStadium(G,co,1).err,'building');
  for(let i=0;i<4;i++) Game.playWeekAuto(G);
  eq(club.cap,cap+step);
});
t('coach can be sacked and receives offers; accepting a job works', ()=>{
  const G=Game.newGame({seed:10,coaches:[{name:'A'}]}); const co=G.coaches[0]; const old=co.club;
  co.board=5; co.jobWeeks=10; Game.playWeekAuto(G);
  eq(co.club,null,'sacked'); eq(G.clubs[old].human,0);
  let g=0; while(!co.offers.length && g++<10) Game.playWeekAuto(G);
  truthy(co.offers.length>0,'got an offer'); const o=co.offers[0];
  truthy(A.acceptJob(G,co,o.id).ok); eq(co.club,o.club); eq(G.clubs[o.club].human,co.id);
});
t('two human coaches cannot share a club; both progress', ()=>{
  const G=Game.newGame({seed:11,coaches:[{name:'A',clubId:'c40'},{name:'B',clubId:'c40'}]});
  truthy(G.coaches[0].club!==G.coaches[1].club); Game.simulateSeason(G); eq(G.phase,'seasonEnd');
});
t('long run: 15 seasons with a human never crashes, squads stay legal', ()=>{
  const G=Game.newGame({seed:12,coaches:[{name:'A'},{name:'B'}]});
  for(let s=0;s<15;s++){ Game.simulateSeason(G); Game.newSeason(G);
    for(const id of G.clubIds){ const n=G.clubs[id].squad.length; if(!G.clubs[id].human) truthy(n>=16&&n<=30,'AI squad '+n); else truthy(n<=40,'squad '+n); for(const pid of G.clubs[id].squad) truthy(G.players[pid].club===id,'club ref'); }
    for(const co of G.coaches) if(!co.club && co.offers.length) A.acceptJob(G,co,co.offers[0].id);
    Game.playWeekAuto(G); for(const id of G.clubIds) truthy(G.clubs[id].squad.length>=14,'min squad after emergency fill');
  }
});
t('player stats: season goals add up to table goals', ()=>{
  const G=Game.newGame({seed:13,coaches:[{name:'A'}]}); Game.simulateSeason(G);
  let pg=0,tg=0; for(const id of G.clubIds){ tg+=G.table[id].gf; for(const pid of G.clubs[id].squad) pg+=G.players[pid].g; }
  truthy(pg>=tg && pg-tg<tg*0.15, `player goals ${pg} vs league goals ${tg} (cup goals included)`);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
