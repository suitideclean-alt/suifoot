const SF=require('./load.js'); const G=SF.Game.newGame({seed:99,coaches:[{name:'A'}]});
let et=0,pens=0,n=3000,hw=0; const goals=[];
for(let i=0;i<n;i++){ const a=G.clubIds[i%48], b=G.clubIds[(i*7+5)%48]; if(a===b) continue;
  const m=new SF.Match(G, SF.Game.specFor(G,a), SF.Game.specFor(G,b), {knockout:true}); m.run();
  if(!m.done) throw new Error('not done'); const w=m.winner(); if(!w) throw new Error('no winner'); if(m.et)et++; if(m.pens)pens++; if(w==='h')hw++; goals.push(m.h.goals+m.a.goals);
  if(m.min>120) throw new Error('minute '+m.min); }
console.log('knockouts',n,'extra time %',(100*et/n).toFixed(1),'pens %',(100*pens/n).toFixed(1),'home win %',(100*hw/n).toFixed(1));
