const path = require('path');
for (const f of ['q','core','bank','body','world','match','game','owner','boss','actions','extras']) require(path.join(__dirname,'..','src',f+'.js'));
module.exports = globalThis.SF;
