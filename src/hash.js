/* SuiFoot state hashing: canonical serialisation, SHA-256 and a Merkle root over the game state.
 *
 * Why this exists. A save is checked today with a small non-cryptographic checksum that only catches a
 * damaged file: anyone can recompute it after editing. Online, the server publishes a root of the state on
 * chain, so two things are needed that the old checksum cannot give:
 *   - the same game must always produce the same bytes (JSON.stringify writes keys in the order they were
 *     created, so two servers can disagree about a state they both hold correctly);
 *   - the hash must be one nobody can forge, and it must let a single club be proved without the whole file.
 *
 * Everything here is plain integer arithmetic, so a Rust or Move port produces the same hashes.
 */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  // ---------- canonical JSON ----------
  /** The same value always gives the same string: object keys sorted, undefined and functions dropped,
   * non-finite numbers written as null exactly as JSON does (tests/hostile.js makes sure none are there). */
  function canon(v) {
    if (v === null || v === undefined) return 'null';
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return JSON.stringify(v);
    if (t === 'function') return 'null';
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v) out.push(canon(x));
      return '[' + out.join(',') + ']';
    }
    const keys = Object.keys(v).sort();
    const parts = [];
    for (const k of keys) {
      const x = v[k];
      if (x === undefined || typeof x === 'function') continue; // JSON drops these, so we drop them too
      parts.push(JSON.stringify(k) + ':' + canon(x));
    }
    return '{' + parts.join(',') + '}';
  }

  // ---------- SHA-256 ----------
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

  const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

  /** SHA-256 over bytes, returning the 32 bytes of the digest */
  function sha256Bytes(bytes) {
    const l = bytes.length;
    const total = Math.ceil((l + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[l] = 0x80;
    const bits = l * 8;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 4294967296));
    dv.setUint32(total - 4, bits >>> 0);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) >>> 0;
        const s1 = (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((x, i) => ov.setUint32(i * 4, x));
    return out;
  }

  const HEX = '0123456789abcdef';
  const hex = (bytes) => { let s = ''; for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15]; return s; };
  const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
  const unhex = (s) => { const b = new Uint8Array(s.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; };

  const H = (SF.Hash = {
    canon,
    sha256: (s) => hex(sha256Bytes(enc(s))),
    /** hash of two hashes given as hex, for a Merkle node */
    pair(a, b) {
      const j = new Uint8Array(64);
      j.set(unhex(a), 0); j.set(unhex(b), 32);
      return hex(sha256Bytes(j));
    },
    /** Merkle root over hex leaves; an odd node is paired with itself, as is usual */
    root(leaves) {
      if (!leaves.length) return H.sha256('');
      let level = leaves.slice();
      while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(H.pair(level[i], level[i + 1] === undefined ? level[i] : level[i + 1]));
        level = next;
      }
      return level[0];
    },
    /** the path that proves one leaf belongs to the root */
    proof(leaves, index) {
      const path = [];
      let level = leaves.slice(), i = index;
      while (level.length > 1) {
        const sib = i % 2 === 0 ? (level[i + 1] === undefined ? level[i] : level[i + 1]) : level[i - 1];
        path.push({ h: sib, right: i % 2 === 0 });
        const next = [];
        for (let k = 0; k < level.length; k += 2) next.push(H.pair(level[k], level[k + 1] === undefined ? level[k] : level[k + 1]));
        level = next; i = Math.floor(i / 2);
      }
      return path;
    },
    verify(leaf, path, root) {
      let h = leaf;
      for (const step of path) h = step.right ? H.pair(h, step.h) : H.pair(step.h, h);
      return h === root;
    },
  });

  /* ---------- the state root ----------
   * The state is cut into leaves so that one club can be proved on its own: a club leaf holds the club, the
   * players in its squad and its cash. Everything that is not a club or a squad player goes into two further
   * leaves, so nothing in the save is left out of the root. */
  SF.State = {
    parts(G) {
      const out = [];
      const inSquad = new Set();
      for (const id of Object.keys(G.clubs).sort()) {
        const c = G.clubs[id];
        const squad = (c.squad || []).slice().sort((a, b) => a - b).map((pid) => { inSquad.add(String(pid)); return G.players[pid]; }).filter(Boolean);
        out.push(['club:' + id, canon({ club: c, squad, bal: (G.bank && G.bank.acc && G.bank.acc[id]) || 0 })]);
      }
      const loose = {};
      for (const pid of Object.keys(G.players).sort((a, b) => Number(a) - Number(b))) if (!inSquad.has(pid)) loose[pid] = G.players[pid];
      out.push(['players:loose', canon(loose)]);
      const rest = {};
      for (const k of Object.keys(G).sort()) if (k !== 'clubs' && k !== 'players' && k !== 'root' && k !== 'chk' && k !== 'unverified') rest[k] = G[k];
      out.push(['rest', canon(rest)]);
      return out;
    },
    leaves: (G) => SF.State.parts(G).map(([label, s]) => H.sha256(label + '\u0000' + s)),
    root: (G) => H.root(SF.State.leaves(G)),
    /** the proof that one club's state belongs to the published root */
    clubProof(G, clubId) {
      const parts = SF.State.parts(G);
      const i = parts.findIndex(([label]) => label === 'club:' + clubId);
      if (i < 0) return null;
      const leaves = parts.map(([label, s]) => H.sha256(label + '\u0000' + s));
      return { leaf: leaves[i], path: H.proof(leaves, i), root: H.root(leaves) };
    },
  };
})();
