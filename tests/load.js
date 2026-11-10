const path = require('path');
for (const f of ['core','bank','world','match','game','actions','extras']) require(path.join(__dirname,'..','src',f+'.js'));
module.exports = globalThis.SF;
