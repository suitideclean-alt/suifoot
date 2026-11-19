/* SuiFoot core: config, seeded RNG (state lives in the save), utilities. */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  SF.VERSION = 1;
  SF.TOKEN = 'SFOOT';

  // All balance numbers live here so the simulation/tests can tune them.
  SF.CFG = {
    DIVS: 4,
    PER_DIV: 18,
    /* The shape of the league. One entry per level, saying how many series of PER_DIV clubs that level
     * holds. [1,1,1,1] is the game as it has always been: four divisions of eighteen, one series each.
     * Online it grows downwards - [1,4,16,64] is a pyramid where everyone can climb from the bottom.
     * How many go down is not set here: it follows from the shape. A series relegates one club for each
     * of its child series, times promote, so what goes up and what comes down always balance. */
    series: [1, 1, 1, 1],
    promote: 2, // how many climb out of each series
    LEAGUE_WEEKS: 34,
    CUP_ROUNDS: 7, // preliminary round (16 clubs), then 64, 32, 16, quarter-finals, semi-finals, final
    CUP_AFTER: [4, 9, 14, 18, 23, 28, 34], // a cup round is played after these league matchdays
    TOTAL_WEEKS: 41, // economy weeks per season = league matchdays + cup rounds (european weeks carry no wages/income ticks)
    EU_AFTER: [3, 9, 14, 19, 23, 27, 30, 32, 34], // european matchdays (6 group + QF + SF + final) are played after these league matchdays
    EU_TEAMS: 16, EU_FOREIGN: 12, EU_SLOTS: 4,
    euNat: ['Aurelia', 'Norvik', 'Solmar'],
    euPartic: 8000, euWin: 6000, euDraw: 2000, euQF: 17000, euSF: 26000, euFinal: 39000, euWinner: 150000, // winner prize = 15% of the prize pool (division 1 total = 32%)
    euGate: 1.5, // european gate multiplier (full stadium, premium ticket)
    starOvr: 80, starValue: 1.5, starWage: 1.35, starFlair: 0.5, starFree: 3, starPenalty: 0.03, // max 3 stars in XI (~27%)
    scoutCost: [24000, 12000, 6000, 3000], scoutOne: [8000, 4000, 2000, 1000],
    /* What a scout is worth beyond telling you a number. Online the potential of every player is written
     * on a public chain, so knowing it stops being worth paying for; these two are not, because they are
     * about what you may do, not about what you know. */
    scoutDiscount: 0.1,  // a player your scouts have seen costs this much less to buy
    scoutGrowth: 0.12,   // and grows this much faster once he is yours, while he is still young
    scoutGrowthAge: 23,  // up to this age
    derbyGate: 1.3, hotPremium: 1.1, watchMax: 15,
    loanFee: 0.07, loanOutFee: 0.05, loanMaxIn: 3,
    SQUAD_MIN: 16,
    SQUAD_MAX: 26,
    divOvr: [71, 62, 54, 47], // mean player rating per division at world creation
    fans: [24000, 12000, 6000, 3000],
    cap: [28000, 15000, 8000, 4500],
    refPrice: [3, 2.4, 1.9, 1.5],
    tvWeekly: [11000, 5500, 4000, 3000],
    sponsorWeekly: [12000, 8000, 6500, 5000],
    startCash: [900000, 380000, 150000, 60000],
    prizeDiv: [320000, 160000, 80000, 40000], // total prize per division: scale 8:4:2:1 from the 1st to the 4th
    prizeSplit: [0.7, 0.3], // champion 70%, runner-up 30%
    prizeCup: 100000, // 10% of the prize pool
    prizeScorer: 50000, // one prize for the season's top scorer, all divisions and all competitions
    upkeepPerSeat: 0.012, // weekly stadium upkeep per seat
    seatCost: 90, // cost to build one seat
    coachPrize: 0.4, // share of a prize a human coach gets when the club has no human owner (the rest goes to the project treasury)
    /* How prizes are funded.
     * 'fixed': the offline game. The values above are paid as they are won, created when they are won.
     * 'pool':  online. Entry fees fill a pool and every prize is the same share of it, so the project can
     *          never pay out more SFOOT than came in. Switched on when there are entry fees to collect. */
    prizeMode: 'fixed',
    prizeTotal: 1385500, // the most one season can hand out: 600k divisions + 140k cup + 50k scorer + 595.5k Europe at its fullest
    poolShare: 0.75,     // of an entry fee, this much fills the prize pool and the rest keeps the project running
    /* What it costs to own a club for a season, by division (first to fourth), in dollars. Only an owner
     * pays: a coach is hired by an owner and pays nothing, he earns his share of what the club wins.
     * The fee is charged in SFOOT, so it is converted at the rate below. The rate is 1 while the token has
     * no price of its own; the day it has one, this is the single line that changes. */
    entryFeeUsd: [90, 40, 20, 10],
    sfootPerUsd: 1,
    startSfoot: 500000, // SFOOT given to a human owner at the start (testnet grant): it pays investments, prizes add to it
    expandStep: 2000,
    expandWeeks: 4,
    facilityCost: [0, 150000, 320000, 650000, 1200000], // cost to go from level N to N+1 (index N), scaled by facDiv
    facDiv: [1, 0.55, 0.3, 0.15],
    facMax: 50,          // facility levels go to 50; every level costs more than the last
    loanRate: 0.12, // flat per season
    overdraftFee: 0.01, // weekly on negative balance
    youthPot: [66, 60, 54, 49], youthSd: 10, youthExtra: 0.45, aiKeep: 0.8,
    homeAdv: 1.15,
    homeMid: 1.8,
    gam: 0.036,
    gamM: 0.036,
    baseAttack: 0.28, // attacking events per minute (both teams)
    baseGoal: 0.084,
    subs: 5,          // substitutions per match
    penChance: 0.012, // a penalty is awarded on this share of attacks
  };

  /* The rules the owner layer runs on. They live here, with everything else, so that one object is the whole
   * specification of the game: the same numbers have to go into the enclave and into the Move contract. */
  SF.CFG.owner = {
    W: SF.CFG.TOTAL_WEEKS,   // economy weeks per season
    late: 3,                 // matchdays of unpaid wages that give just cause
    exitPct: 0.5,            // coach exit clause default, share of the salary still owed
    capWeeks: SF.CFG.TOTAL_WEEKS, // underperformance cap: 12 months = one season of salary
    mutualLo: 0.4, mutualHi: 0.6,
    share: 0.1,              // coach share of the profit on sales of players he developed
    runwayMin: 4,            // weeks of cash below which a coach cannot add commitments
    runwayWarn: 12,          // weeks of cash below which the coach is warned
    ban: 8,                  // weeks a coach who quits without just cause cannot sign elsewhere
    years: 3,
    bonus: { title: 12, promo: 10, euro: 8 }, // in weeks of salary
    approvalWeeks: 1,        // an open request expires after this many game weeks
    tokenWeeks: 3,           // an approval can be used for this many weeks
  };

  /** Bumped whenever a number above changes. A saved game, a signed matchday and a contract all carry it,
   * so two sides can tell at once whether they are playing by the same rules. */
  SF.CFG.rules = 1;

  let G = null;
  SF.setG = (g) => { G = g; SF.cur = g; };
  SF.getG = () => G;

  const R = (SF.R = {
    f() {
      const a = (G.rs = (G.rs + 0x6d2b79f5) >>> 0);
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(a, b) { return a + Math.floor(R.f() * (b - a + 1)); },
    range(a, b) { return a + R.f() * (b - a); },
    pick(arr) { return arr[Math.floor(R.f() * arr.length)]; },
    chance(p) { return R.f() < p; },
    gauss(m = 0, s = 1) {
      let u = 0;
      while (u === 0) u = R.f();
      const v = R.f();
      return m + s * SF.Q.sqrt(-2 * SF.Q.ln(u)) * SF.Q.cos(2 * SF.Q.PI * v);
    },
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(R.f() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    weighted(items, wf) {
      let tot = 0;
      const ws = items.map((x) => { const w = Math.max(0, wf(x)); tot += w; return w; });
      if (tot <= 0) return items[Math.floor(R.f() * items.length)];
      let r = R.f() * tot;
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
      return items[items.length - 1];
    },
  });

  /** cost to go from facility level n to n+1 (before the division factor): the old table up to 4, then +6% per level */
  SF.CFG.facStep = (n) => (n <= 4 ? SF.CFG.facilityCost[n] : Math.round((SF.CFG.facilityCost[4] * SF.Q.pow(1.06, n - 4)) / 1000) * 1000);

  SF.util = {
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    /** a number that came from outside the engine (a form field, a request): a finite number, or null.
     * Everything else - NaN, Infinity, text, objects, booleans - is refused here and never reaches the game logic.
     * This matters because NaN makes every comparison false, so a bad value slips past price and balance checks. */
    num(x) {
      if (typeof x === 'number') return Number.isFinite(x) ? x : null;
      if (typeof x === 'string' && x.trim() !== '') { const n = Number(x); return Number.isFinite(n) ? n : null; }
      return null;
    },
    /** a whole number from outside, rounded and kept inside [lo, hi]; null when it is not a number at all */
    int(x, lo, hi) {
      const n = SF.util.num(x);
      if (n === null) return null;
      return SF.util.clamp(Math.round(n), lo, hi);
    },
    /** an amount of money from outside: finite, not negative, rounded, and under a sane ceiling */
    amount(x, max) {
      const n = SF.util.num(x);
      if (n === null || n < 0) return null;
      const r = Math.round(n);
      return r > (max == null ? 1e12 : max) ? null : r;
    },
    /** two decimal places: keeps values a person reads (reputation, board confidence) from drifting
     * into things like 18.400000000000002 as small changes pile up season after season */
    r2: (x) => Math.round(x * 100) / 100,
    sum: (a) => a.reduce((s, x) => s + x, 0),
    avg: (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0),
    money(n, compact) {
      n = Math.round(n);
      const neg = n < 0 ? '-' : '';
      const a = Math.abs(n);
      if (compact) {
        if (a >= 1e6) return neg + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
        if (a >= 1e4) return neg + Math.round(a / 1e3) + 'k';
        if (a >= 1e3) return neg + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      }
      return neg + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
  };
})();
