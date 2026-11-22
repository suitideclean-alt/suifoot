/* SuiFoot writing to the chain (SF.Tx): the half that was missing.
 *
 * Reading a league needs nobody's permission. Doing anything to one needs a signature, and the
 * signature is the person's, not ours: the game builds the transaction, hands it to whatever wallet
 * they connected, and the wallet is where they see what they are agreeing to and say yes. No key
 * ever reaches this code, and nothing is sent that a person did not look at first.
 *
 * The building itself is the official Sui SDK, kept in vendor/ and served from our own domain
 * rather than fetched from a CDN. See vendor/README.md for why.
 *
 * Three things a person can do so far: take a club they were drawn, seal a lineup before the
 * deadline, and show it after. Everything else the contract offers is reachable the same way.
 */
(function () {
  const SF = globalThis.SF;

  /// the two shared objects every call needs beside its own: the clock, and the chain's randomness
  const CLOCK = '0x6';
  const RANDOM = '0x8';

  /* A transaction names a shared object by the version it was FIRST shared at, not the version it
   * is on now. That number is not guessable and it is not the same for every object. The clock has
   * been there since the chain's first block, so its number is 1; randomness was added years later
   * and carries a large one instead - on testnet, forty-three million and change.
   *
   * Writing 1 for both named an object that has never existed. Nothing rejects that cleanly: the
   * node cannot resolve the input, so the wallet's rehearsal of the transaction falls over before
   * it can say anything useful, and reports a fault of its own plumbing. Hence a wallet claiming
   * it was short of gas on an address that was not, and then an internal error with no cause in
   * it. So we ask the chain, once, and hold the answer for the session - these two never change.
   */
  let SYS = null;
  async function system() {
    if (!SYS) {
      const [clock, random] = await SF.Chain.sharedRefs([CLOCK, RANDOM]);
      SYS = { clock: { ...clock, mutable: false }, random: { ...random, mutable: false } };
    }
    return SYS;
  }

  const Tx = (SF.Tx = {
    /** is there anything here to sign with? */
    ready: () => !!(globalThis.SuiSDK && SF.Wallet && SF.Wallet.addr && SF.Wallet.current),

    /** which chain we are on, in the form a wallet expects */
    chain: () => 'sui:testnet',

    /** the feature a wallet must offer for any of this to work */
    signer() {
      const w = SF.Wallet && SF.Wallet.current;
      const f = w && w.features;
      if (!f) return null;
      return f['sui:signAndExecuteTransaction'] || f['sui:signAndExecuteTransactionBlock'] || null;
    },

    /** why we cannot sign, in a sentence somebody can act on */
    why() {
      if (!globalThis.SuiSDK) return 'no_sdk';
      if (!SF.Wallet || !SF.Wallet.addr) return 'no_wallet';
      if (!Tx.signer()) return 'wallet_cannot_sign';
      return null;
    },

    /** hand a built transaction to the wallet, and wait for the chain to take it */
    async send(tx) {
      const stop = Tx.why();
      if (stop) throw new Error(stop);
      tx.setSender(SF.Wallet.addr);

      const feature = Tx.signer();
      const out = await feature.signAndExecuteTransaction({
        transaction: tx,
        account: SF.Wallet.account,
        chain: Tx.chain(),
      });
      return out;
    },

    // ---------- the calls themselves ----------

    /** Ask for a club. The draw happens on chain, so what comes back is not ours to choose. */
    async requestJoin() {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league], sys] = await Promise.all([SF.Chain.sharedRefs([net.league]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::market::request_join`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef(sys.random)],
      });
      return Tx.send(tx);
    },

    /** Turn the ticket in against the club it named, and the club is yours. */
    async claim(ticketId, clubId) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league, club] = await SF.Chain.sharedRefs([net.league, clubId]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::market::claim`,
        arguments: [tx.object(ticketId), tx.sharedObjectRef({ ...league, mutable: false }), tx.sharedObjectRef(club)],
      });
      return Tx.send(tx);
    },

    /** Buy a named club: never the top division, and only one that finished in the bottom half. */
    async buy(clubId) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league, club] = await SF.Chain.sharedRefs([net.league, clubId]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::market::buy`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef(club)],
      });
      return Tx.send(tx);
    },

    /** Open a new series when the foot of the pyramid has no room left. Anyone may. */
    async openSeries() {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league], sys] = await Promise.all([SF.Chain.sharedRefs([net.league]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::world::open_series`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef(sys.random)],
      });
      return Tx.send(tx);
    },

    /* Before the deadline: publish the seal of a lineup and nothing else.
     *
     * The secret number stays in this browser. Without it the seal says nothing about the team, and
     * with it anyone can check the team afterwards - which is the whole trick. Losing it means being
     * unable to reveal, so it is kept beside the save. */
    async commitLineup(clubId, week, seal) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league, club], sys] = await Promise.all([SF.Chain.sharedRefs([net.league, clubId]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::commit`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef(club),
          tx.pure.u16(week),
          tx.pure.vector('u8', Array.from(seal)),
          tx.sharedObjectRef(sys.clock),
        ],
      });
      return Tx.send(tx);
    },

    /** After it: show the lineup and the number, and let the contract check them itself. */
    async revealLineup(clubId, week, xi, bench, tactic, salt) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league, club], sys] = await Promise.all([SF.Chain.sharedRefs([net.league, clubId]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::reveal`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef(club),
          tx.pure.u16(week),
          tx.pure.vector('u32', xi),
          tx.pure.vector('u32', bench),
          tx.pure.u8(tactic),
          tx.pure.u64(String(salt)),
          tx.sharedObjectRef(sys.clock),
        ],
      });
      return Tx.send(tx);
    },

    /* Move the league on to the next matchday.
     *
     * While it is played by hand anybody may, because that is what playing by hand means. Once it
     * runs to the clock this is the league's to call and nobody else's. */
    async advance() {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league] = await SF.Chain.sharedRefs([net.league]);

      const tx = new Transaction();
      tx.moveCall({ target: `${net.pkg}::league::advance`, arguments: [tx.sharedObjectRef(league)] });
      return Tx.send(tx);
    },

    /* A whole matchday in one call - one call, not one transaction holding seven.
     *
     * They belong together: a matchday half played is a table that lies, and anybody looking at it
     * in between would see something that was never true. But the chain will not let a transaction
     * do anything after a command that draws randomness except transfer things, so that somebody
     * cannot read the draw and abort the rest until the dice fall their way. Six matches and an
     * advance is exactly that shape, and the node refuses it.
     *
     * So the loop lives in the contract, and this sends one command. The clubs go in the order the
     * fixtures give them; the contract checks each pair against its own fixture list, so an order
     * of our own invention aborts rather than playing a match nobody scheduled. */
    /* Write a decision down.
     *
     * One call for everything a person does that is not a match: what the week is spent training,
     * what it costs to come and watch, a stand built, a scout taken on, a man listed, a bid made,
     * a bid answered. The contract checks whose it is and whether it came in time; what it means
     * is worked out from the log afterwards, the same way by everyone.
     */
    async decide(clubId, kind, a, b, data) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league, club], sys] = await Promise.all([
        SF.Chain.sharedRefs([net.league, clubId]), system(),
      ]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::decide::decide`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef({ ...club, mutable: false }),
          tx.pure.u8(kind),
          tx.pure.u64(String(a || 0)),
          tx.pure.u64(String(b || 0)),
          tx.pure.vector('u8', Array.from(data || [])),
          tx.sharedObjectRef(sys.clock),
        ],
      });
      return Tx.send(tx);
    },

    /* Employment. Five calls, and between them every way a job here begins or ends.
     *
     * Each takes the club as a shared object, because a job is a thing done to a club: the
     * contract reads who owns it and who holds the job from the club itself rather than from
     * anything we tell it. */
    async job(clubId, fn, more) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league, club] = await SF.Chain.sharedRefs([net.league, clubId]);
      const tx = new Transaction();
      /* The extra arguments are built here rather than handed in ready-made: a value belongs to
       * the transaction it was made in, and one made in another is not the same thing however
       * alike it looks. */
      tx.moveCall({
        target: `${net.pkg}::jobs::${fn}`,
        arguments: [tx.sharedObjectRef({ ...league, mutable: false }), tx.sharedObjectRef(club)]
          .concat(more ? more(tx) : []),
      });
      return Tx.send(tx);
    },

    /** put the job to somebody, on terms they can take or leave */
    offerJob(clubId, to, wage, weeks, win) {
      return Tx.job(clubId, 'offer', (tx) => [
        tx.pure.address(to), tx.pure.u64(String(Math.round(wage))),
        tx.pure.u16(Math.round(weeks)), tx.pure.u64(String(Math.round(win || 0))),
      ]);
    },

    acceptJob: (clubId) => Tx.job(clubId, 'accept'),
    takeVacant: (clubId) => Tx.job(clubId, 'take_vacant'),
    resignJob: (clubId) => Tx.job(clubId, 'resign'),
    dismissCoach: (clubId) => Tx.job(clubId, 'dismiss'),
    withdrawOffer: (clubId) => Tx.job(clubId, 'withdraw'),

    /* Turn the season over. Anybody may, while the league is played by hand. */
    async nextSeason() {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league] = await SF.Chain.sharedRefs([net.league]);
      const tx = new Transaction();
      tx.moveCall({ target: `${net.pkg}::league::next_season`, arguments: [tx.sharedObjectRef(league)] });
      return Tx.send(tx);
    },

    async drawWeek() {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league], sys] = await Promise.all([SF.Chain.sharedRefs([net.league]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::draw_week`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef(sys.random), tx.sharedObjectRef(sys.clock)],
      });
      return Tx.send(tx);
    },

    async playMatchday(fixtures) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;

      const ids = [net.league];
      for (const m of fixtures) ids.push(m.home.id, m.away.id);
      const [refs, sys] = await Promise.all([SF.Chain.sharedRefs(ids), system()]);
      const league = refs[0];

      const tx = new Transaction();
      const clubs = refs.slice(1).map((r) => tx.sharedObjectRef(r));
      tx.moveCall({
        target: `${net.pkg}::league::play_week`,
        arguments: [tx.sharedObjectRef(league), ...clubs, tx.sharedObjectRef(sys.random), tx.sharedObjectRef(sys.clock)],
      });
      return Tx.send(tx);
    },

    /** Play a fixture whose hour has come. Anyone may, which is why a season never stalls. */
    async playFixture(homeId, awayId) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [[league, home, away], sys] = await Promise.all([SF.Chain.sharedRefs([net.league, homeId, awayId]), system()]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::play_fixture`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef(home),
          tx.sharedObjectRef(away),
          tx.sharedObjectRef(sys.random),
          tx.sharedObjectRef(sys.clock),
        ],
      });
      return Tx.send(tx);
    },
  });
})();
