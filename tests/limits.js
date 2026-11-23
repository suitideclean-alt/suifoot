/* What the network will refuse to publish, checked where it is cheap to find out.
 *
 * The Move compiler and its unit tests accept a struct of any size. The network does not: a struct
 * may have at most 32 fields, and a package that has one is refused when it is published, with an
 * error that names no struct - "VMVerificationOrDeserializationError in command 0". Club had 31 and
 * was given four more; every test passed and publishing failed. Finding that out by publishing costs
 * a deployment, and this costs nothing. */
const fs = require('fs');
const path = require('path');

const MAX_FIELDS = 32;
const dir = path.join(__dirname, '..', 'move', 'suifoot', 'sources');
let pass = 0, fail = 0, worst = [];

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.move'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
  const re = /struct\s+(\w+)[^{]*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const n = (m[2].match(/^\s*\w+\s*:/gm) || []).length;
    worst.push([n, f + '::' + m[1]]);
    if (n > MAX_FIELDS) { fail++; console.log('  FAIL ' + f + '::' + m[1] + ' has ' + n + ' fields; the network allows ' + MAX_FIELDS); }
    else pass++;
  }
}
worst.sort((a, b) => b[0] - a[0]);
console.log('  ' + pass + ' structs within the limit; the largest are ' + worst.slice(0, 3).map(([n, s]) => s + ' (' + n + ')').join(', '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
