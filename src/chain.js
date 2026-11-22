/* SuiFoot on chain (SF.Chain): the browser reading a world it did not make.
 *
 * Until now the game has been one browser holding one world in its own memory. This is the other
 * half: a league that lives in a contract, which this reads and draws. Nothing here decides
 * anything - no rating, no result, no balance comes from this file. It asks, and it shows.
 *
 * There is no library and no build step, because the game is a folder of files served as they are.
 *
 * It speaks GraphQL. Sui retired JSON-RPC on public full nodes, and what replaced it on the node
 * itself is gRPC: a compression byte, a four-byte length and a protobuf message, which a browser
 * cannot produce without a library. GraphQL is the other replacement, it is JSON in both directions,
 * and the public testnet service sends access-control-allow-origin: * - so a page may simply ask.
 *
 * One request fetches the lot. Several objects are asked for in a single query under names of our
 * own choosing, rather than one round trip each.
 *
 * Reading needs no wallet and no permission: a published object is public. Writing - sealing a
 * lineup, taking a club - needs a signature, and that is a separate thing again.
 */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  /* A league standing on the Sui testnet. The key that published it was made inside a workflow run
   * and thrown away with it; the package and the objects outlive it, because that is how a chain
   * works. Nobody can upgrade this one, which is right for a rehearsal. */
  const TESTNET = {
    graphql: 'https://graphql.testnet.sui.io/graphql',
    explorer: 'https://suiscan.xyz/testnet/object/',
    faucet: 'https://faucet.sui.io/?network=testnet',
    pkg: '0xb15201382bb80c971aeaf36d2a93ec6067fb5be2300a2bf284db9594e4c2da17',
    league: '0xca348f5cbc55b86a2a76729a04cc40c5db9584acc7f6e832ea3a628197da27f0',
    clubs: [
      '0x42909110859d5b845f35b0edf2056210afc8f0adcca84588d453b23dd5b5a1a0',
      '0x556987dffda737dd7c8ffa854fae42abfe6ac8e84e864deaa2e202e366a2eec2',
      '0x59002b63413556d9f96929b03b798d6f809ce3819b30dff67974e0bb190869fc',
      '0x7dc5079ec764ff6d7cd5e00cf21c3495079f955d36504f2e956e8c545355ae9d',
      '0x31f48db6cf7e342d46385c1fcbf08d9087e63581efaac02e61d34b17c020734e',
      '0x8e370312b322de6307098e2c0f3dd853424e76298bb5011a71214b01f28ced93',
      '0x80b4da4ed49b36ae22ead469ff535418d88090414d592e4c443757c9e0b1b4ba',
      '0xfdad51315739cb9e4e72bc0f9d9b53e5fd5f782f20077dd492597925ada03111',
      '0x00593957b9706af95ba246426d34fbdcf214b7dcb19e57ee26944278d110c2d9',
      '0x042104a26c24ace4b06bc510c663e6ddef0ad610ccb7c01dc1a431898c2733a7',
      '0x58856087983c3de3f8c94a794312e47c3feed9a985721ea175455676b37b2a93',
      '0xb7fb25145fdc9fe76231dd18aa1cea065861800f642fc6632edde51d1960d37a',
      '0xc8e2445016e816d6393983066d5ae996cf96b8934cbcbcaf517912d49afcf300',
      '0x3bda89eab2508584cee16689d47878d7876d2b105f19d94036998ebbb6a73530',
      '0x787748099cba2a9c86f3c684aff99c6fb1ad05ad97b9d9a26866e6e33edfef04',
      '0x1c5b3607d89268eb27cd5d56c6b862a1091d66bef346c485dbaa20903eca95ba',
      '0x8767a0bb79db28f7e3dabf00d250bcfdafc5d4c6226a465a69194fd94e8d0201',
      '0x83831dd87159cbf2aea9a84dad7752b69f5fbd32f4627203125fa4fcc0323338',
    ],
  };

  // ---------- names ----------
  // The contract stores no player names: two thousand strings on chain to say what a number already
  // says. A name is worked out from the number instead, here and in any other client, the same way
  // every time. Multiplying by a number sharing no factor with the count of names shuffles them
  // without ever landing twice on the same one.
  const FIRST = ['Adrian', 'Aleksi', 'Anton', 'Arlo', 'Bastian', 'Bruno', 'Caio', 'Callum', 'Dario', 'Davi', 'Dmitri', 'Elias', 'Emil', 'Enzo', 'Felix', 'Finn', 'Gabin', 'Hugo', 'Ibrahim', 'Ivo', 'Jonas', 'Joris', 'Kai', 'Kasper', 'Leon', 'Lucas', 'Luka', 'Mateo', 'Milo', 'Nico', 'Noel', 'Oscar', 'Otto', 'Pablo', 'Pedro', 'Rafael', 'Remy', 'Rui', 'Samir', 'Sven', 'Tiago', 'Theo', 'Viktor', 'Willem', 'Yann', 'Yusuf', 'Zane', 'Ruben', 'Tomas', 'Marek'];
  const S1 = ['Ba', 'Be', 'Bo', 'Ca', 'Ce', 'Da', 'De', 'Do', 'Fa', 'Ga', 'Ge', 'Ha', 'Ka', 'Ke', 'La', 'Le', 'Lo', 'Ma', 'Me', 'Mo', 'Na', 'Ne', 'No', 'Pa', 'Pe', 'Ra', 'Re', 'Ro', 'Sa', 'Se', 'So', 'Ta', 'Te', 'To', 'Va', 'Ve', 'Vo', 'Za', 'Ze', 'Bi', 'Ki', 'Mi', 'Ni'];
  const S2 = ['bor', 'dan', 'gar', 'lin', 'mar', 'nor', 'pen', 'ran', 'sil', 'tan', 'ver', 'wen', 'zor', 'cal', 'dor', 'fen', 'har', 'kel', 'lan', 'mon', 'pol', 'rin', 'sen', 'tol', 'vik', 'berg', 'lund', 'ström'];
  const S3 = ['', '', '', 'o', 'a', 'ez', 'ski', 'ens', 'ini', 'er', 'ton', 'ov', 'es', 'i'];
  const SPAN = FIRST.length * S1.length * S2.length * S3.length;
  const STEP = 104729; // prime, and shares no factor with the span

  const PRE = ['Aster', 'Bryn', 'Cald', 'Dun', 'Elm', 'Fen', 'Glen', 'Hal', 'Iron', 'Kes', 'Lark', 'Mar', 'Nor', 'Oak', 'Pen', 'Quil', 'Ros', 'Sel', 'Thorn', 'Ulm', 'Vale', 'Wyn', 'Yar', 'Zan'];
  const SUF = ['ford', 'mouth', 'ton', 'haven', 'wick', 'dale', 'bridge', 'port', 'field', 'stead', 'holm', 'crest'];
  const KIND = ['FC', 'United', 'Athletic', 'Rovers', 'Wanderers', 'Town', 'Sporting', 'Union', 'Racing', 'Rangers'];

  const POS = ['GK', 'DF', 'MF', 'FW'];
  const TEMPER = ['gent', 'pro', 'hard'];

  /** a Move Option arrives either as the value, as null, or wrapped in a vector of none or one */
  const optional = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? v[0] : null;
    if (typeof v === 'object') { const inner = v.vec || v.value; return Array.isArray(inner) ? (inner.length ? inner[0] : null) : (inner == null ? null : inner); }
    return v;
  };

  const Chain = (SF.Chain = {
    net: TESTNET,

    /** the name the number stands for, the same in any client that asks */
    playerName(num) {
      const m = (Number(num) * STEP) % SPAN;
      let v = m;
      const first = FIRST[v % FIRST.length]; v = Math.floor(v / FIRST.length);
      const a = S1[v % S1.length]; v = Math.floor(v / S1.length);
      const b = S2[v % S2.length]; v = Math.floor(v / S2.length);
      const c = S3[v % S3.length];
      return first + ' ' + a + b + c;
    },

    /* A club's colours, from its number and nothing else. Offline the second colour is drawn at
     * random when the world is made; on chain there is no such moment, so it is settled by the
     * number like the name and the badge are. */
    colours(num) {
      const n = Number(num);
      const hue = Math.round((n * 137.508) % 360);
      let h = 2166136261 >>> 0;
      const s = 'c' + n;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return { id: 'c' + n, c1: `hsl(${hue} 62% 42%)`, c2: (h & 1) ? '#ffffff' : '#111827' };
    },

    /** the badge, drawn here rather than fetched: the same one a wallet shows for the deed */
    badge(num, size) {
      return SF.Art ? SF.Art.logo(Chain.colours(num), size || 22) : '';
    },

    /** and the man's face, from his number and his age, as everywhere else */
    face(p, size) {
      return SF.Art ? SF.Art.face({ id: p.num, age: p.age }, size || 24) : '';
    },

    /** and the club's name, worked out the way the contract works it out */
    clubName(num) {
      const n = Number(num);
      const block = Math.floor(n / 2880);
      const m = ((n % 2880) * 1123) % 2880;
      const s = PRE[m % 24] + SUF[Math.floor(m / 24) % 12] + ' ' + KIND[Math.floor(m / 288)];
      return block > 0 ? s + ' ' + (block + 1) : s;
    },

    // ---------- talking to the chain ----------

    async query(gql) {
      const res = await fetch(Chain.net.graphql, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: gql }),
      });
      if (!res.ok) throw new Error('the node answered ' + res.status);
      const body = await res.json();
      if (body.errors && body.errors.length) throw new Error(body.errors[0].message || 'the node refused the question');
      return body.data;
    },

    /* What an object is, as a Move struct turned into plain JSON. Whole numbers wider than a browser
     * can hold come back as text, which is why everything below goes through Number() rather than
     * being trusted as it arrives. */
    fieldsOf(node) {
      if (!node || !node.asMoveObject || !node.asMoveObject.contents) return null;
      return node.asMoveObject.contents.json;
    },

    /** the fields of one object */
    async object(id) {
      const d = await Chain.query(`{ it: object(address: "${id}") { asMoveObject { contents { json } } } }`);
      const f = Chain.fieldsOf(d && d.it);
      if (!f) throw new Error('no such object: ' + id);
      return f;
    },

    /* What a transaction needs to name a shared object: not the version it is on now, but the
     * version it was on when it was first shared. That number never changes, and the chain uses it
     * to know which object is meant. */
    async sharedRefs(ids) {
      const parts = ids.map((id, i) =>
        `o${i}: object(address: "${id}") { address owner { __typename ... on Shared { initialSharedVersion } } }`);
      const d = await Chain.query('{ ' + parts.join(' ') + ' }');
      return ids.map((id, i) => {
        const o = d && d['o' + i];
        const sh = o && o.owner && o.owner.initialSharedVersion;
        if (!sh) throw new Error('that object is not shared: ' + id);
        return { objectId: id, initialSharedVersion: String(sh), mutable: true };
      });
    },

    /* What the wallet has to pay with, in MIST. A transaction that costs nothing to build still
     * costs gas to run, and an empty address is by far the commonest reason a wallet refuses: the
     * refusal arrives as its own internal error, which explains nothing. So we ask first. */
    async gas(addr) {
      const d = await Chain.query(
        `{ a: address(address: "${addr}") { balance(coinType: "0x2::sui::SUI") { totalBalance } } }`);
      const b = d && d.a && d.a.balance;
      return b ? Number(b.totalBalance) : 0;
    },

    /* The tickets this address is holding.
     *
     * Taking a club is two steps on purpose: the draw happens on chain and hands back a ticket
     * naming the club it landed on, and the ticket is turned in afterwards. Between the two the
     * club is already off the free list but still has no owner, so a person who stops there owns
     * nothing and the screen must say so rather than look finished. */
    async tickets(addr) {
      const d = await Chain.query(`{ a: address(address: "${addr}") {
        objects(filter: { type: "${Chain.net.pkg}::market::JoinTicket" }) {
          nodes { address contents { json } } } } }`);
      const nodes = (d && d.a && d.a.objects && d.a.objects.nodes) || [];
      return nodes.map((n) => {
        const f = n && n.contents ? n.contents.json : null;
        return { id: n.address, club: f && f.club ? f.club : null };
      }).filter((x) => x.club);
    },

    /* Everything anybody decided, oldest first.
     *
     * This is the other half of the league. The clubs as they were made and a number a matchday
     * say what happened on the pitch; this says what people did about it - who trained what, who
     * raised a ticket price, who bid for whom. Read in order and applied in order, the two
     * together are the whole game, and neither is any use without the other.
     *
     * They are read rather than kept: nothing in this browser remembers a decision, so there is
     * nothing here to lose, to disagree with somebody else's copy, or to edit into being true.
     */
    async decisions(limit) {
      const type = `${Chain.net.pkg}::decide::Decided`;
      const out = [];
      let after = null;
      // a page at a time, following the cursor, until the chain says there is no more
      for (let page = 0; page < (limit || 40); page++) {
        const cursor = after ? `, after: "${after}"` : '';
        const d = await Chain.query(`{ events(filter: { type: "${type}" }, first: 50${cursor}) {
          pageInfo { hasNextPage endCursor }
          nodes { timestamp contents { json } } } }`);
        const ev = d && d.events;
        if (!ev) break;
        for (const n of ev.nodes || []) {
          const f = n && n.contents ? n.contents.json : null;
          if (!f) continue;
          // the contract already refuses a club that is not this league's; ignoring it here too
          // means a reader is right even against a package that was not
          if (f.league && f.league !== Chain.net.league) continue;
          out.push({
            club: f.club, num: Number(f.club_num), by: f.by,
            season: Number(f.season), week: Number(f.week), at: Number(f.at),
            kind: Number(f.kind), a: Number(f.a), b: Number(f.b),
            data: f.data || [],
          });
        }
        if (!ev.pageInfo || !ev.pageInfo.hasNextPage) break;
        after = ev.pageInfo.endCursor;
      }
      return out;
    },

    /* Every turn of everybody's employment, oldest first.
     *
     * A career is read from these and from nothing else: the jobs somebody took, what each paid,
     * and how each ended. It is deliberately the whole league's and not one person's - a record
     * only its owner can see is not a reputation, and the point of keeping it is that somebody
     * with nothing to show but their work can show it.
     */
    async careers() {
      const type = `${Chain.net.pkg}::jobs::JobEvent`;
      const out = [];
      let after = null;
      for (let page = 0; page < 40; page++) {
        const cursor = after ? `, after: "${after}"` : '';
        const d = await Chain.query(`{ events(filter: { type: "${type}" }, first: 50${cursor}) {
          pageInfo { hasNextPage endCursor }
          nodes { timestamp contents { json } } } }`);
        const ev = d && d.events;
        if (!ev) break;
        for (const n of ev.nodes || []) {
          const f = n && n.contents ? n.contents.json : null;
          if (!f) continue;
          if (f.league && f.league !== Chain.net.league) continue;
          out.push({
            club: f.club, num: Number(f.club_num), who: f.who, by: f.by,
            season: Number(f.season), week: Number(f.week), kind: Number(f.kind),
            wage: Number(f.wage), weeks: Number(f.weeks), win: Number(f.win),
            at: Number(n.timestamp || 0),
          });
        }
        if (!ev.pageInfo || !ev.pageInfo.hasNextPage) break;
        after = ev.pageInfo.endCursor;
      }
      return out;
    },

    /** several at once, under names of our own, so it is one question and not eighteen */
    async objects(ids) {
      const parts = ids.map((id, i) => `o${i}: object(address: "${id}") { asMoveObject { contents { json } } }`);
      const d = await Chain.query('{ ' + parts.join(' ') + ' }');
      return ids.map((_, i) => Chain.fieldsOf(d && d['o' + i]));
    },

    // ---------- what the fields mean ----------

    league(f) {
      return {
        season: Number(f.season), week: Number(f.week),
        t0: Number(f.t0),
        kickoffs: (f.kickoffs || []).map(Number),
        lockBefore: Number(f.lock_before), drawBefore: Number(f.draw_before),
        weeks: Number(f.weeks_in_season),
        bottom: Number(f.bottom_level),
        admin: f.admin || null,
        free: (f.free_at_foot || []).length,
        size: Number(f.series_size),
        manual: !!f.manual,
        seeds: (f.seeds || []).map(Number),
        rosters: (f.rosters || []).map((r) => (r || []).map(Number)),
      };
    },

    club(f, id) {
      const squad = (f.squad || []).map((s) => {
        const p = s.fields || s;
        return {
          num: Number(p.num), name: Chain.playerName(p.num),
          pos: POS[Number(p.pos)] || 'MF', temper: TEMPER[Number(p.temper)] || 'pro',
          age: Number(p.age), ovr: Number(p.ovr), pot: Number(p.pot),
          cond: Number(p.cond), mood: Number(p.mood),
          wage: Number(p.wage), goals: Number(p.goals), apps: Number(p.apps),
          contractWeeks: Number(p.contract_weeks || 0),
        };
      });
      return {
        id, num: Number(f.num), name: f.name,
        level: Number(f.level), series: Number(f.series),
        balance: Number(f.balance),
        fans: Number(f.fans), capacity: Number(f.capacity), ticket: Number(f.ticket_cents) / 100,
        owner: optional(f.owner),
        played: Number(f.played), won: Number(f.won), drawn: Number(f.drawn), lost: Number(f.lost),
        gf: Number(f.goals_for), ga: Number(f.goals_against), points: Number(f.points),
        lastPos: Number(f.last_pos),
        squad,
      };
    },

    /** everything the panel needs, in two questions */
    async world() {
      const [lf, cfs] = await Promise.all([
        Chain.object(Chain.net.league),
        Chain.objects(Chain.net.clubs),
      ]);
      const clubs = cfs.map((f, i) => (f ? Chain.club(f, Chain.net.clubs[i]) : null)).filter(Boolean);
      return { league: Chain.league(lf), clubs };
    },

    /* Who plays whom, worked out here exactly as fixtures.move works it out: one club stands still
     * and the rest rotate past it, then the whole thing again with the grounds swapped. Nothing is
     * fetched, because nothing is stored - the matchday and the roster are the whole answer. */
    pairs(roster, week) {
      const n = roster.length;
      if (n < 2 || n % 2 !== 0) return [];
      const rounds = n - 1;
      if (week < 1 || week > rounds * 2) return [];
      const r = week - 1;
      const back = r >= rounds;
      const turn = r % rounds;

      const arranged = [roster[0]];
      for (let i = 1; i < n; i++) arranged.push(roster[1 + ((i - 1 + turn) % rounds)]);

      const out = [];
      for (let k = 0; k < n / 2; k++) {
        const a = arranged[k];
        const b = arranged[n - 1 - k];
        const flip = (k === 0 && turn % 2 === 1) !== back;
        out.push(flip ? [b, a] : [a, b]);
      }
      return out;
    },

    /** how many matchdays a series of that size takes */
    weeksFor: (n) => (n < 2 ? 0 : (n - 1) * 2),

    /** this matchday's fixtures for a series, as clubs rather than numbers */
    fixtures(world, series) {
      const roster = (world.league.rosters || [])[series] || [];
      const byNum = new Map(world.clubs.map((c) => [c.num, c]));
      return Chain.pairs(roster, world.league.week)
        .map(([h, a]) => ({ home: byNum.get(h), away: byNum.get(a) }))
        .filter((m) => m.home && m.away);
    },

    /** the table, sorted the way the contract sorts it */
    table(clubs) {
      return clubs.slice().sort((a, b) =>
        b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.num - b.num);
    },

    /** when the whistle goes for a matchday, worked out as the contract works it out */
    kickoff(lg, week) {
      const slots = lg.kickoffs.length ? lg.kickoffs : [1200];
      const day = Math.floor((week - 1) / slots.length);
      return lg.t0 + day * 86400000 + slots[(week - 1) % slots.length] * 60000;
    },
    /** where a matchday stands right now */
    phase(lg, week, now) {
      const k = Chain.kickoff(lg, week);
      if (now >= k) return 'played';
      if (now >= k - lg.drawBefore * 60000) return 'drawn';
      if (now >= k - lg.lockBefore * 60000) return 'locked';
      return 'open';
    },
  });
})();
