/* The gas sponsor: pays the network fee so that playing does not begin with "go and find some SUI".
 *
 * A person presses a button; the page builds the transaction and sends its *contents* here. This
 * service checks that the contents are the game and nothing else, puts its own coin in to pay for
 * them, signs for that coin, and hands the transaction back. The person signs it as well and sends
 * it on. They never hold gas, and nobody is trusted with anything they could abuse:
 *
 *   - It only ever sees what is about to be done, never a key. It cannot move anybody's things:
 *     the person's signature is still needed, and it is over the very bytes they were shown.
 *   - It pays only for calls into this package, and for putting coins together or cutting one off
 *     (paying an entry fee needs that). It will not pay for a transfer, a publication, an upgrade,
 *     or anything touching the coin it pays with - the way a sponsor gets emptied.
 *   - It chooses the budget. A person cannot ask it to pay more than a small ceiling.
 *   - It rations: so many a person an hour, so many an hour in all, and it stops when its own coin
 *     is low rather than running down to nothing. Somebody who wants to drain it can do so only at
 *     the rate it was always willing to spend.
 *
 * The treasury funds it, because the treasury is where the entry fees go; see docs/SPONSOR.md.
 *
 *     SPONSOR_KEY=suiprivkey... PKG=0x... node tools/sponsor.js        serve on PORT (default 8787)
 *
 * judge() and the limits are pure and are what tests/sponsor.js is about.
 */
const path = require('path');

/** the ceiling on what one sponsored transaction may cost, in MIST: 0.05 SUI */
const MAX_BUDGET = 50_000_000;
const PER_SENDER_PER_HOUR = 60;
const PER_HOUR = 3000;
/** stop sponsoring when the sponsor's coin falls below this, in MIST: 2 SUI */
const FLOOR = 2_000_000_000;

/** What a sponsored transaction may be made of, and why not when it is not. */
function judge(data, pkg) {
  const cmds = (data && data.commands) || [];
  if (!cmds.length) return { ok: false, why: 'nothing to do' };
  if (cmds.length > 6) return { ok: false, why: 'too many steps' };
  for (const c of cmds) {
    const k = c.$kind;
    if (k === 'MoveCall') {
      const m = c.MoveCall;
      if (String(m.package).toLowerCase() !== String(pkg).toLowerCase()) return { ok: false, why: 'only this game is sponsored' };
    } else if (k === 'SplitCoins' || k === 'MergeCoins') {
      /* allowed, as long as they are the person's own coins - see the gas coin check below */
    } else {
      return { ok: false, why: k + ' is not something that is sponsored' };
    }
    /* Anything that can name the gas coin can spend it. The sponsor's coin is added to the
     * transaction after this check, so a reference to "the gas coin" is a reference to ours. */
    if (JSON.stringify(c).includes('"GasCoin"')) return { ok: false, why: 'the sponsor\'s coin is not for use' };
  }
  return { ok: true };
}

/** Rationing, kept in memory: a restart forgets the hour, which only ever gives a person more room
 * than the limit says, and only for as long as it takes to fill again. */
function limiter(now = Date.now) {
  const bySender = new Map();
  let total = [];
  const prune = (a, t) => a.filter((x) => t - x < 3600000);
  return {
    allow(sender) {
      const t = now();
      total = prune(total, t);
      const mine = prune(bySender.get(sender) || [], t);
      if (total.length >= PER_HOUR) return { ok: false, why: 'busy, try again shortly' };
      if (mine.length >= PER_SENDER_PER_HOUR) return { ok: false, why: 'that is a lot for one hour' };
      mine.push(t); total.push(t); bySender.set(sender, mine);
      return { ok: true };
    },
  };
}

// ---------- the service ----------

async function serve() {
  const { Transaction } = require(path.join(__dirname, '..', 'vendor', 'sui-3.0.1.js')) && globalThis.SuiSDK;
  const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client');
  const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
  const { decodeSuiPrivateKey } = require('@mysten/sui/cryptography');
  const http = require('http');

  const PKG = process.env.PKG;
  if (!PKG || !process.env.SPONSOR_KEY) { console.error('PKG and SPONSOR_KEY are required'); process.exit(2); }
  const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.SPONSOR_KEY).secretKey);
  const me = kp.toSuiAddress();
  const client = new SuiClient({ url: process.env.RPC || getFullnodeUrl('testnet') });
  const limits = limiter();
  const origin = process.env.ORIGIN || 'https://suifoot.fun';

  const reply = (res, code, body) => {
    res.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type',
    });
    res.end(JSON.stringify(body));
  };

  http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return reply(res, 204, {});
    if (req.method === 'GET') return reply(res, 200, { sponsor: me, ceiling: MAX_BUDGET });
    if (req.method !== 'POST') return reply(res, 405, { error: 'post a transaction' });
    try {
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 20000) return reply(res, 413, { error: 'too large' }); }
      const { kind, sender } = JSON.parse(raw);
      if (!/^0x[0-9a-f]{64}$/.test(sender || '')) return reply(res, 400, { error: 'who is asking?' });

      const tx = Transaction.fromKind(Uint8Array.from(Buffer.from(kind, 'base64')));
      const verdict = judge(tx.getData(), PKG);
      if (!verdict.ok) return reply(res, 422, { error: verdict.why });
      const lim = limits.allow(sender);
      if (!lim.ok) return reply(res, 429, { error: lim.why });

      const coins = (await client.getCoins({ owner: me, coinType: '0x2::sui::SUI', limit: 50 })).data;
      const total = coins.reduce((a, c) => a + Number(c.balance), 0);
      if (total < FLOOR) return reply(res, 503, { error: 'the sponsor is resting, pay your own gas for now' });
      const coin = coins.sort((a, b) => Number(b.balance) - Number(a.balance))[0];

      tx.setSender(sender);
      tx.setGasOwner(me);
      tx.setGasBudget(MAX_BUDGET);
      tx.setGasPayment([{ objectId: coin.coinObjectId, version: coin.version, digest: coin.digest }]);
      tx.setGasPrice(await client.getReferenceGasPrice());
      const bytes = await tx.build({ client });
      const { signature } = await kp.signTransaction(bytes);
      reply(res, 200, { bytes: Buffer.from(bytes).toString('base64'), signature });
    } catch (e) {
      reply(res, 400, { error: String(e && e.message || e).slice(0, 200) });
    }
  }).listen(+(process.env.PORT || 8787), () => console.log('sponsoring from ' + me));
}

module.exports = { judge, limiter, MAX_BUDGET, PER_SENDER_PER_HOUR, PER_HOUR, FLOOR };
if (require.main === module) serve().catch((e) => { console.error(e); process.exit(1); });
