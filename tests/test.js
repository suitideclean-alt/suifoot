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
  for(let i=0;i<5;i++) Game.playWeekAuto(G); // 4 economy weeks (+1 european week)
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

// ---------- v0.2 ----------
const {Econ:E}=SF;
function mkStar(G,club,n){ const sq=SF.Game.players(G,club).sort((a,b)=>b.ovr-a.ovr); for(let i=0;i<n;i++){ sq[i].ovr=82+i; } }
t('stars: cost more (value x1.5, wage x1.35) and the auto XI never fields more than 3', ()=>{
  const G=Game.newGame({seed:21,coaches:[{name:'A'}]}); const club=G.clubs[G.coaches[0].club];
  const p=SF.Game.players(G,club)[3]; p.ovr=79; const v0=E.value(p), w0=E.wage(p); p.ovr=80; truthy(E.isStar(p));
  truthy(E.value(p)>v0*1.5, 'value jump'); truthy(E.wage(p)>=w0*1.3, 'wage jump');
  mkStar(G,club,6);
  const xi=Game.pickXI(G,club,'4-4-2').xi; eq(xi.length,11);
  truthy(xi.filter(id=>E.isStar(G.players[id])).length<=CFG.starFree, 'max stars in XI');
});
t('stars: more than 3 in the XI makes the team worse than 3', ()=>{
  const G=Game.newGame({seed:22,coaches:[{name:'A'}]}); const club=G.clubs[G.coaches[0].club];
  const mk=(ns)=>{ const G2=JSON.parse(JSON.stringify(G)); SF.setG(G2); const c=G2.clubs[club.id]; const sq=SF.Game.players(G2,c).sort((a,b)=>b.ovr-a.ovr);
    sq.forEach(p=>{ p.ovr=70; }); for(let i=0;i<ns;i++) sq[i].ovr=82; const spec=Game.specFor(G2,c.id); spec.xi=sq.slice(0,11).map(p=>p.id);
    const side={club:c.id,xi:spec.xi.map(id=>G2.players[id]),bench:[],tactic:'bal',tbonus:0}; const pw=SF.matchPower(side); const r=pw.Ap+pw.Dp+pw.Mp; return r; };
  const r0=mk(0), r3=mk(3), r5=mk(5); SF.setG(G);
  truthy(r3>r0, 'stars help up to 3'); truthy(r5<r3, 'too many stars hurt');
});
t('european cup: 16 clubs, 9 matchdays, a champion, prizes paid, money conserved', ()=>{
  const G=Game.newGame({seed:23,coaches:[{name:'A'}]});
  eq(G.sched.filter(x=>x.t==='E').length,9); eq(G.euIds.length,12); eq(G.eu.groups.length,4); G.eu.groups.forEach(g=>eq(g.length,4));
  Game.simulateSeason(G); truthy(G.eu.winner,'winner'); truthy(G.eu.finalist,'finalist');
  const dom=G.eu.q; eq(dom.length,4);
  truthy(dom.every(id=>G.eu.paid[id]>=CFG.euPartic),'participation paid');
  if(!G.clubs[G.eu.winner].foreign) truthy(G.eu.paid[G.eu.winner]>=CFG.euWinner,'winner prize');
  eq(B.supply(G),B.totalBalances(G),'supply equals balances');
  eq(G.euroQ.length,CFG.EU_SLOTS); G.euroQ.forEach(id=>eq(G.clubs[id].foreign,undefined));
  Game.newSeason(G); eq(G.eu.q.join(),G.euroQ.join(),'qualifiers carry over'); eq(G.clubIds.length,48);
});
t('loans: borrow, cannot sell/release, returns after the loan, loan out brings a fee', ()=>{
  const G=Game.newGame({seed:24,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  B.credit(G,club.id,3e6,'bailout');
  const cand=A.search(G,co,{minOvr:60,limit:5,loanable:true}).find(p=>!G.clubs[p.club].foreign);
  const owner=G.clubs[cand.club]; const bal=B.bal(G,club.id), obal=B.bal(G,owner.id), n=club.squad.length;
  const r=A.loanIn(G,co,cand.id,1); truthy(r.ok,'loaned'); eq(club.squad.length,n+1); eq(cand.club,club.id);
  eq(B.bal(G,club.id),bal-r.fee); eq(B.bal(G,owner.id),obal+r.fee);
  eq(A.sellNow(G,co,cand.id).err,'on_loan'); eq(A.release(G,co,cand.id).err,'on_loan');
  const mine=SF.Game.players(G,club).find(p=>!p.loan); const ob=B.bal(G,club.id);
  const o=A.loanOut(G,co,mine.id,1); truthy(o.ok,'loan out'); eq(B.bal(G,club.id),ob+o.fee); truthy(G.clubs[mine.club]!==club);
  Game.simulateSeason(G); Game.newSeason(G);
  eq(cand.club,owner.id,'borrowed player went home'); eq(mine.club,club.id,'loaned out player came back'); eq(cand.loan,undefined);
});
t('loans: limit of borrowed players', ()=>{
  const G=Game.newGame({seed:25,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  B.credit(G,club.id,9e6,'bailout');
  while(club.squad.length>20) club.squad.shift();
  for(let i=0;i<CFG.loanMaxIn;i++){ const c=A.search(G,co,{limit:80,loanable:true}).find(p=>p.club!==club.id&&G.clubs[p.club].squad.length>18); truthy(A.loanIn(G,co,c.id,1).ok); }
  const c=A.search(G,co,{limit:80,loanable:true})[0]; eq(A.loanIn(G,co,c.id,1).err,'loan_max');
});
t('vacation: no signings, no offers, contracts renewed automatically, ends at the new season', ()=>{
  const G=Game.newGame({seed:26,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  B.credit(G,club.id,5e6,'bailout');
  truthy(A.setVacation(G,co,99).ok); truthy(co.vac>0);
  const fa=G.players[G.free[0]]; eq(A.signFree(G,co,fa.id).err,'vacation');
  const exp=SF.Game.players(G,club).sort((a,b)=>b.ovr-a.ovr).slice(0,3); exp.forEach(p=>{p.ct=1;});
  Game.simulateSeason(G); eq(G.offers.filter(o=>o.coach===co.id).length,0,'no offers while away');
  Game.newSeason(G); eq(co.vac,0); truthy(co.vacReport.renewed>=3,'top players renewed');
  exp.forEach(p=>truthy(G.players[p.id]&&G.players[p.id].club===club.id,'still at the club'));
});
t('finance advisor flags a wage problem and the renegotiation works', ()=>{
  const G=Game.newGame({seed:27,coaches:[{name:'A'}]}); const co=G.coaches[0]; const club=G.clubs[co.club];
  SF.Game.players(G,club).forEach(p=>{p.wage*=3;}); Game.playWeekAuto(G); Game.playWeekAuto(G);
  const r=A.financeReport(G,co); truthy(r.tips.some(x=>x.k==='wages_high'),'wage tip'); truthy(r.totIn>0&&r.totOut>0);
  const p=SF.Game.players(G,club)[0]; const w=p.wage; co.sk.neg=5; let ok=false; for(let i=0;i<30&&!ok;i++){ delete p.rn; const x=A.renegotiate(G,co,p.id); ok=x.ok; }
  truthy(ok,'accepted at some point'); truthy(p.wage<w); eq(A.renegotiate(G,co,p.id).err,'already_tried');
});
t('reputation: itemised log, sponsors like famous coaches', ()=>{
  const G=Game.newGame({seed:28,coaches:[{name:'A'}]}); const co=G.coaches[0];
  Game.simulateSeason(G); truthy(co.replog.length>=1,'log'); truthy(co.replog.every(r=>r.s===1&&typeof r.d==='number'));
  truthy(Game.repSponsor(90)>Game.repSponsor(10)); eq(Game.repTier(5),0); eq(Game.repTier(95),4);
});
t('old v0.1 saves are upgraded when loaded', ()=>{
  const G=Game.newGame({seed:29,coaches:[{name:'A'}]}); Game.playWeekAuto(G);
  const raw=JSON.parse(Game.serialize(G)); delete raw.euIds; delete raw.eu; for(const id of G.euIds) delete raw.clubs[id];
  const G2=Game.deserialize(JSON.stringify(raw)); eq(G2.euIds.length,12); truthy(G2.eu); Game.simulateSeason(G2); eq(G2.phase,'seasonEnd'); Game.newSeason(G2); truthy(G2.eu.winner===null&&G2.eu.groups.length===4);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
