/* Draw every club badge as a file.
 *
 * A wallet showing a deed asks the web for a picture, so there has to be one at a fixed address. The
 * badge was never an image file anywhere - it is drawn from the club's number - so this simply draws
 * them ahead of time and writes them out.
 *
 * The colours have to come from the number too. In the offline game a club's second colour is drawn
 * at random when the world is made; on chain there is no such moment, so it is settled by the number
 * like everything else. Same number, same badge, in the game and in a wallet.
 *
 *   node tools/badges.js 600     writes badges/0.svg .. badges/599.svg
 */
const fs = require('fs');
const path = require('path');

globalThis.SF = {};
require(path.join(__dirname, '..', 'src', 'art.js'));
const Art = globalThis.SF.Art;

/** a club's colours, from its number and nothing else */
function colours(num) {
  const hue = Math.round((num * 137.508) % 360);
  let h = 2166136261 >>> 0;
  const s = 'c' + num;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { c1: `hsl(${hue} 62% 42%)`, c2: (h & 1) ? '#ffffff' : '#111827' };
}

const clubOf = (num) => Object.assign({ id: 'c' + num }, colours(num));

const upTo = Number(process.argv[2] || 600);
const dir = path.join(__dirname, '..', 'badges');
fs.mkdirSync(dir, { recursive: true });

let bytes = 0;
for (let n = 0; n < upTo; n++) {
  const svg = Art.logo(clubOf(n), 128).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  fs.writeFileSync(path.join(dir, n + '.svg'), svg);
  bytes += svg.length;
}
console.log(`${upTo} badges, ${(bytes / 1024).toFixed(0)} KB in all, ${Math.round(bytes / upTo)} bytes each`);
