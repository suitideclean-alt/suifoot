const SF = require('./load.js');
const G = SF.Game.newGame({seed:3, coaches:[{name:'T'}]});
for (let s=0;s<3;s++){
  SF.Game.simulateSeason(G);
  const out=[];
  for(let d=0;d<4;d++){
    let rev=0,wage=0,att=0,cap=0,str=0,age=0,n=0;
    for(const id of G.divs[d]){const c=G.clubs[id]; rev+=c.rev; wage+=c.squad.reduce((x,p)=>x+G.players[p].wage,0)*28; cap+=c.cap; att+=c.fans; str+=SF.Econ.strength(G,c); for(const p of c.squad){age+=G.players[p].age;n++}}
    out.push(`d${d+1}: rev ${Math.round(rev/12/1000)}k wages ${Math.round(wage/12/1000)}k fans ${Math.round(att/12)} cap ${Math.round(cap/12)} str ${(str/12).toFixed(1)} age ${(age/n).toFixed(1)}`);
  }
  console.log('S'+G.season+'\n  '+out.join('\n  '));
  SF.Game.newSeason(G);
}
