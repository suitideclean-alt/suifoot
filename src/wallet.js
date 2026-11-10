/* SuiFoot wallet login (v0.6): connects a Sui wallet through the Wallet Standard, no build step and no library.
 * Phase A: the address only identifies the player and picks the save slot on this device. Nothing is signed or sent on chain yet. */
(function () {
  const SF = globalThis.SF;
  const KEY = 'suifoot.wallet';
  const W = (SF.Wallet = { wallets: [], current: null, account: null, addr: null, onChange: null });
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  const isSui = (w) => w && w.features && w.features['standard:connect'] && (w.chains || []).some((c) => String(c).startsWith('sui:'));
  W.short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  W.available = () => W.wallets.filter(isSui);

  function add(...ws) {
    for (const w of ws) if (w && !W.wallets.includes(w)) W.wallets.push(w);
    if (W.onChange) W.onChange();
    tryRestore();
    return () => { for (const w of ws) { const i = W.wallets.indexOf(w); if (i >= 0) W.wallets.splice(i, 1); } if (W.onChange) W.onChange(); };
  }
  /** Wallet Standard discovery: wallets announce themselves, and we announce ourselves for wallets that loaded first */
  W.init = function (onChange) {
    W.onChange = onChange || null;
    if (typeof window === 'undefined') return;
    const api = Object.freeze({ register: add });
    window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail(api); } catch (err) { /* ignore a broken wallet */ } });
    try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch (err) { /* old browser */ }
  };

  function setAccount(w, acc) {
    W.current = w; W.account = acc; W.addr = acc ? acc.address : null;
    if (acc) ls.set(KEY, JSON.stringify({ name: w.name, addr: acc.address })); else ls.del(KEY);
    if (W.onChange) W.onChange();
  }
  W.connect = async function (w, silent) {
    if (!isSui(w)) throw new Error('not_sui');
    const r = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined);
    const accs = (r && r.accounts) || w.accounts || [];
    const acc = accs.find((a) => a.address) || null;
    if (!acc) throw new Error('no_account');
    setAccount(w, acc);
    return acc.address;
  };
  W.disconnect = async function () {
    const w = W.current;
    try { if (w && w.features['standard:disconnect']) await w.features['standard:disconnect'].disconnect(); } catch (e) { /* ignore */ }
    setAccount(null, null);
  };
  let restoring = false;
  /** reconnect silently to the wallet used last time, if it shows up */
  async function tryRestore() {
    if (restoring || W.addr) return;
    let last; try { last = JSON.parse(ls.get(KEY) || 'null'); } catch (e) { last = null; }
    const w = last && W.available().find((x) => x.name === last.name);
    if (!w) return;
    restoring = true;
    try { await W.connect(w, true); } catch (e) { /* the wallet wants a click: leave the guest session */ }
    restoring = false;
  }
  /** the save slot for this player: one per address, or the shared guest slot */
  W.slot = (base) => (W.addr ? base + '.' + W.addr : base);
})();
