const SF = require('./load.js');
const N = +process.argv[2] || 60;
let hw=0,dr=0,aw=0,g=0,m=0; const topWin=[0,0,0,0], meanPos=[0,0,0,0], champPts=[0,0,0,0], r2=[0,0,0,0]; let cups=0, cupTopHalf=0;
for(let s=1;s<=N;s++){
  const G=SF.Game.newGame({seed:s*7919,coaches:[{name:'T'}]});
  const str={}; for(const id of G.clubIds) str[id]=SF.Econ.strength(G,G.clubs[id]);
  // count results
  const wkRes=[];
  while(G.phase==='play'){
    const wk=SF.Game.beginWeek(G);
    for(const mm of wk.matches){SF.Game.simMatch(G,mm); if(mm.k==='L'){m++; g+=mm.res.hg+mm.res.ag; if(mm.res.hg>mm.res.ag)hw++; else if(mm.res.hg===mm.res.ag)dr++; else aw++;}}
    SF.Game.endWeek(G);
  }
  for(let d=0;d<4;d++){
    const st=SF.Game.standings(G,d); // note: positions computed at endSeason with pre-change div; G.divs still old
    const ids=G.divs[d].slice().sort((a,b)=>str[b]-str[a]);
    if(st[0]===ids[0])topWin[d]++;
    meanPos[d]+=st.indexOf(ids[0])+1;
    champPts[d]+=G.table[st[0]].pts;
  }
  if(G.cup.winner){cups++; const rank=G.clubIds.slice().sort((a,b)=>str[b]-str[a]).indexOf(G.cup.winner); if(rank<12)cupTopHalf++;}
}
console.log('goals/game',(g/m).toFixed(2),'home%',(100*hw/m).toFixed(1),'draw%',(100*dr/m).toFixed(1),'away%',(100*aw/m).toFixed(1));
console.log('strongest wins title %',topWin.map(x=>(100*x/N).toFixed(0)).join('/'),' mean pos of strongest',meanPos.map(x=>(x/N).toFixed(1)).join('/'),' champ pts',champPts.map(x=>(x/N).toFixed(0)).join('/'));
console.log('cup winner from top-12 strength %',(100*cupTopHalf/cups).toFixed(0));
