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
      const [league] = await SF.Chain.sharedRefs([net.league]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::market::request_join`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef({ objectId: RANDOM, initialSharedVersion: '1', mutable: false })],
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
      const [league] = await SF.Chain.sharedRefs([net.league]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::world::open_series`,
        arguments: [tx.sharedObjectRef(league), tx.sharedObjectRef({ objectId: RANDOM, initialSharedVersion: '1', mutable: false })],
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
      const [league, club] = await SF.Chain.sharedRefs([net.league, clubId]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::commit`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef(club),
          tx.pure.u16(week),
          tx.pure.vector('u8', Array.from(seal)),
          tx.sharedObjectRef({ objectId: CLOCK, initialSharedVersion: '1', mutable: false }),
        ],
      });
      return Tx.send(tx);
    },

    /** After it: show the lineup and the number, and let the contract check them itself. */
    async revealLineup(clubId, week, xi, bench, tactic, salt) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league, club] = await SF.Chain.sharedRefs([net.league, clubId]);

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
          tx.sharedObjectRef({ objectId: CLOCK, initialSharedVersion: '1', mutable: false }),
        ],
      });
      return Tx.send(tx);
    },

    /** Play a fixture whose hour has come. Anyone may, which is why a season never stalls. */
    async playFixture(homeId, awayId) {
      const { Transaction } = globalThis.SuiSDK;
      const net = SF.Chain.net;
      const [league, home, away] = await SF.Chain.sharedRefs([net.league, homeId, awayId]);

      const tx = new Transaction();
      tx.moveCall({
        target: `${net.pkg}::league::play_fixture`,
        arguments: [
          tx.sharedObjectRef({ ...league, mutable: false }),
          tx.sharedObjectRef(home),
          tx.sharedObjectRef(away),
          tx.sharedObjectRef({ objectId: RANDOM, initialSharedVersion: '1', mutable: false }),
          tx.sharedObjectRef({ objectId: CLOCK, initialSharedVersion: '1', mutable: false }),
        ],
      });
      return Tx.send(tx);
    },
  });
})();
