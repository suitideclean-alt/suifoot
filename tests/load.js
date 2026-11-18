const path = require('path');
for (const f of ['q','core','hash','bank','body','world','match','game','owner','boss','actions','extras']) require(path.join(__dirname,'..','src',f+'.js'));
module.exports = globalThis.SF;
