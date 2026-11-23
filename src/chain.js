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
    pkg: '0x6f4341ced5ca91bea5918b5d8acc832d52c6a098c0f63214c4b59a486059e401',
    league: '0xe5ca5b9797a47406b417ec2fbc4b52264831e0eabae3fe21b12c47d7ba490e4d',
    /* where entry fees go. Absent on a league made before there were fees, and then nothing here
     * offers to take one. */
    treasury: null,
    /* the testnet tap for SFOOT; there is none on a league that is not a rehearsal */
    faucet: null,
    /* A service that pays the network fee, if one has been set up. With none, a person pays their
     * own, as before. Turning one on also means letting the page talk to it: see docs/SPONSOR.md. */
    sponsor: null,
    clubs: [
      '0xf60364816f2ca214658590d49e3284906c8603e0fe22ac715dbb916bef1220d5',
      '0x7734c25387a51710587c50ab7d2eff9d1e63730409236efc55f84e1a567de6f0',
      '0xe6486306539d1143bea45e54029938bee13c42c2c514d1095fa523a8384dd025',
      '0x801dde06df4cb4eb9f0d30fdf00af4b9fb473b28b2e5f8512394d7704f760736',
      '0x0d4bad38a5d0a01996d6d6af896cd1ca0b0685ba289289f341327a39d0d39ae8',
      '0x5123363ca49fdf2bd30e5a712c10af223a1f933784d95254210003f335c83453',
      '0x6d856a36412b8732df89d5c7d832ec09bfb2f67c3ac7acf0d1bca0852ab2479d',
      '0xb31d2d3c7c13471e2d908ddb1a81bbde0da33792291c2acaa018d6bab11078e6',
      '0xe78f687299ddc86b2c9dfe864551687a8b5a48347b9576a10057315bb554b22e',
      '0xcca78347263be68b35b2d89bd2746bc5903379f35786f5ed8cb181d5f1742f3d',
      '0xfad3789d589362888eb224afaae25eb6dec4b445bb92a1f31138e5cc61f1b7fb',
      '0x4210b5361f951089ddebad769ccfc52767f1463eef45a7d21885921ebef7c9b2',
      '0xd21000389087899bc189053399a180eef7542d1a2bcaaf38cbf68fbe8e3ce2dc',
      '0xa35fdcb8b52143a6b2fdca7337f71e7763b6ff143401cef04afcbb4a3e981b3f',
      '0xc6fbda9e07619dcc46970e3f8f319e6609526d25e7c5bf496f140eaa1baf3729',
      '0x2ecc89c4ac688ea9b0597df16b6add0f0892175150aaf64ae1f27b14b9b52e7e',
      '0x3cf741942baaa3871a820789e639bb51641274b58baf503425622e2386c379a0',
      '0xeec24bc7f93f82d2efe5020a2ecba87b32afffb966d3db48c7b853e354585ada',
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

    /* The SFOOT this address is holding, as the separate coins it comes in. Paying needs one coin
     * of exactly the fee, which is made from these. */
    async sfoot(addr) {
      if (!Chain.net.treasury) return { coins: [], total: 0 };
      const d = await Chain.query(`{ a: address(address: "${addr}") {
        objects(filter: { type: "0x2::coin::Coin<${Chain.net.pkg}::sfoot::SFOOT>" }) {
          nodes { address contents { json } } } } }`);
      const nodes = (d && d.a && d.a.objects && d.a.objects.nodes) || [];
      const coins = nodes.map((n) => ({ id: n.address, balance: Number(n.contents && n.contents.json ? n.contents.json.balance : 0) }))
        .filter((c) => c.balance > 0);
      return { coins, total: coins.reduce((a, c) => a + c.balance, 0) };
    },

    /* What a club owes the league this season, worked out the way the contract works it out - so
     * that the screen never offers a payment the contract would refuse, nor hides one it would take.
     * Returns null when nothing is owed. */
    owes(league, club) {
      if (!league || !league.entryFee || !club || !club.owner) return null;
      if (club.paidFor === league.season) return null;
      const due = league.entryDue;
      const by = club.takenIn === league.season ? Math.max(due, club.takenWk + 2) : due;
      return { fee: league.entryFee, by, late: league.week > by };
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
        /* Where each season's numbers begin. The draws are one list and the seasons are slices of
         * it, and a reader cannot tell where one stopped without being told. */
        seasonFrom: (f.season_from || [0]).map(Number),
        rosters: (f.rosters || []).map((r) => (r || []).map(Number)),
        /* what a season costs to be in, in SFOOT millionths, and the matchday after which an
         * owner who has not paid loses the club; an older league has neither, which is no fee */
        entryFee: Number(f.entry_fee || 0), entryDue: Number(f.entry_due || 0),
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
        coach: optional(f.coach),
        /* The job and the offer the chain is holding for this club. Everything else about
         * employment is worked out; these two are held, because the contract has to be able to
         * check them before it takes anybody's signature. */
        job: (() => { const j = optional(f.job); return j ? { wage: Number((j.fields || j).wage), weeks: Number((j.fields || j).weeks), win: Number((j.fields || j).win), since: Number((j.fields || j).since), agreed: !!(j.fields || j).agreed } : null; })(),
        offerTo: (() => { const o = optional(f.offer); const g = o && (o.fields || o); return g ? { to: g.to, wage: Number(g.wage), weeks: Number(g.weeks), win: Number(g.win) } : null; })(),
        played: Number(f.played), won: Number(f.won), drawn: Number(f.drawn), lost: Number(f.lost),
        gf: Number(f.goals_for), ga: Number(f.goals_against), points: Number(f.points),
        lastPos: Number(f.last_pos),
        /* the season the fee was last paid for, and when the club was last taken: what it takes to
         * say whether it is owed, and how long a newcomer has to pay */
        ...(() => { const k = f.keeping ? (f.keeping.fields || f.keeping) : {}; return {
          paidFor: Number(k.paid_for || 0), takenIn: Number(k.taken_in || 0), takenWk: Number(k.taken_wk || 0),
          tenure: Number(k.tenure || 0) }; })(),
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
