const fs=require('fs'); const SF=require('./load.js'); require('../src/i18n.js');
const D=SF.I18N.D; let bad=0;
const src=fs.readFileSync('src/ui.js','utf8')+fs.readFileSync('src/game.js','utf8')+fs.readFileSync('src/actions.js','utf8')+fs.readFileSync('src/ui-owner.js','utf8');
const used=new Set([...src.matchAll(/\bt\('([a-z0-9_]+)'/g)].map(m=>m[1]));
for(const k of used) if(!k.endsWith('_') && !D[k]){console.log('MISSING key',k);bad++;}
// dynamic families
const fam={tab:['home','squad','league','cup','transfers','finance','coach','settings'],pos:['GK','DF','MF','FW'],tac:['def','bal','att'],role:['xi','bench','out'],fac:['youth','train'],sk:['train','tact','neg','youth'],lg:['table','results','scorers'],tr:['market','free','offers']};
for(const [p,ks] of Object.entries(fam)) for(const k of ks){const key=(p==='tr'?'tr_':p+'_')+k; if(!D[key]){console.log('MISSING',key);bad++;}}
for(const k of ['train','tact','neg','youth']) if(!D['sk_'+k+'_d']){console.log('MISSING sk_'+k+'_d');bad++;}
for(const k of SF.Game.CUP_KEYS) if(!D[k]){console.log('MISSING',k);bad++;}
// news keys from engine
const nk=new Set([...fs.readFileSync('src/game.js','utf8').matchAll(/news\(G, '(n_[a-z_]+)'/g)].map(m=>m[1]).concat([...fs.readFileSync('src/actions.js','utf8').matchAll(/news\(G, '(n_[a-z_]+)'/g)].map(m=>m[1]), [...fs.readFileSync('src/owner.js','utf8').matchAll(/news\(G, '(n_[a-z_]+)'/g)].map(m=>m[1]), [...fs.readFileSync('src/boss.js','utf8').matchAll(/news\(G, '(n_[a-z_]+)'/g)].map(m=>m[1])));
for(const k of nk) if(!k.endsWith('_') && !D[k]){console.log('MISSING news',k);bad++;}
for(const k of ['n_sacked','n_resigned']) if(!D[k]){bad++;}
// owner pages: dynamic families
const O8={os:['summary','finance','data','commercial','club','team','rep','hall'],style:['shady','hothead','controller','gambler','builder','patron','loyal','steady'],style_d:['shady','hothead','controller','gambler','builder','patron','loyal','steady'],bt:['zero','endneg','ffp','sponsor','sup','acad','event','idle','orep'],sp:['results','tickets','merch','members','community','museum','naming'],sp_k:['fixed','bonus','naming'],sp_d:['fixed','bonus','naming'],ow_p:['low','normal','premium','high'],ow_merch:['low','normal','premium'],ow_mem:['low','normal','high'],ev:['concert','friendly','tour'],ev_d:['concert','friendly','tour'],ln:['acad','mkt','comm'],ln_d:['acad','mkt','comm'],pj:['roof','lights','museum','med'],pj_d:['roof','lights','museum','med'],ax:['hon','free','mot','pat','amb','sta'],ax_d:['hon','free','mot','pat','amb','sta'],ax_h:['hon','free','mot','pat','amb','sta'],bd:['champion','builder','trainer','balanced','loyal','savior','debtfree','honest'],bd_d:['champion','builder','trainer','balanced','loyal','savior','debtfree','honest'],hl:['worth','growth','rep'],n_project:['roof','lights','museum','med'],n_event:['concert','friendly','tour'],k:['merch','members','museum','academy','marketing','community','project','kit','event','investor','bond','dividend','partner_out','partner_in']};
for(const [p,ks] of Object.entries(O8)) for(const k of ks){const key=p+'_'+k; if(!D[key]){console.log('MISSING',key);bad++;}}
// boss engine errors
for(const k of [...fs.readFileSync('src/boss.js','utf8').matchAll(/err: '([a-z_]+)'/g)].map(m=>'err_'+m[1])) if(!D[k]){console.log('MISSING',k);bad++;}
// errors
const ek=new Set([...fs.readFileSync('src/actions.js','utf8').matchAll(/no\('([a-z_]+)'/g)].map(m=>'err_'+m[1]).concat([...fs.readFileSync('src/bank.js','utf8').matchAll(/err: '([a-z_]+)'/g)].map(m=>'err_'+m[1])));
for(const k of ek) if(!D[k]){console.log('MISSING',k);bad++;}
// bank kinds
for(const k of ['gate','tv','sponsor','prize','loan','bailout','sale_fee','wages','upkeep','repay','stadium','facility','signing','fine','compensation','transfer_in','transfer_out']) if(!D['k_'+k]){console.log('MISSING k_'+k);bad++;}
// all entries have 4 languages, placeholders consistent
for(const [k,v] of Object.entries(D)){ if(v.length!==4||v.some(x=>!x)){console.log('BAD entry',k);bad++;continue;}
  const ph=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
  const base=ph(v[0]); v.forEach((s,i)=>{ if(ph(s)!==base){console.log('placeholder mismatch',k,i,ph(s),'vs',base);bad++;} }); }
console.log(Object.keys(D).length,'keys;',bad?bad+' problems':'all good'); process.exit(bad?1:0);
