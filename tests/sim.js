const SF = require('./load.js');
const seasons = +process.argv[2] || 5, seed = +process.argv[3] || 1;
const G = SF.Game.newGame({seed, coaches:[{name:'T'}]});
let t0=Date.now(), lastFl={};
for (let s=0;s<seasons;s++){
  SF.Game.simulateSeason(G);
  const str=[0,1,2,3].map(d=>(G.divs[d].reduce((x,id)=>x+SF.Econ.strength(G,G.clubs[id]),0)/12).toFixed(1));
  const bal=[0,1,2,3].map(d=>Math.round(G.divs[d].reduce((x,id)=>x+SF.Bank.bal(G,id),0)/12/1000)+'k');
  const neg=G.clubIds.filter(id=>SF.Bank.bal(G,id)<0).length;
  const f=G.bank.flows; const bo=(f.bailout||0)-(lastFl.bailout||0); lastFl={bailout:f.bailout||0};
  let age=0,n=0,sq=0; for(const id of G.clubIds){sq+=G.clubs[id].squad.length; for(const p of G.clubs[id].squad){age+=G.players[p].age;n++}}
  console.log('S'+G.season,'str',str.join('/'),'avgBal',bal.join('/'),'neg',neg,'bailout+',Math.round(bo/1e3)+'k','supply',Math.round(SF.Bank.supply(G)/1e6)+'M','age',(age/n).toFixed(1),'sq',(sq/48).toFixed(1),'FA',G.free.length);
  SF.Game.newSeason(G);
}
console.log('ms',Date.now()-t0);
