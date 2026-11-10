/* SuiFoot core: config, seeded RNG (state lives in the save), utilities. */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  SF.VERSION = 1;
  SF.TOKEN = 'SFOOT';

  // All balance numbers live here so the simulation/tests can tune them.
  SF.CFG = {
    DIVS: 4,
    PER_DIV: 12,
    LEAGUE_WEEKS: 22,
    CUP_AFTER: [3, 7, 11, 15, 19, 22], // a cup round is played after these league matchdays
    TOTAL_WEEKS: 28, // economy weeks per season (european weeks carry no wages/income ticks)
    EU_AFTER: [2, 6, 9, 13, 16, 18, 20, 21, 22], // european matchdays (6 group + QF + SF + final) are played after these league matchdays
    EU_TEAMS: 16, EU_FOREIGN: 12, EU_SLOTS: 4,
    euNat: ['Aurelia', 'Norvik', 'Solmar'],
    euPartic: 40000, euWin: 30000, euDraw: 10000, euQF: 80000, euSF: 120000, euFinal: 180000, euWinner: 700000, // winner = 2x the division-1 champion prize
    euGate: 1.5, // european gate multiplier (full stadium, premium ticket)
    starOvr: 80, starValue: 1.5, starWage: 1.35, starFlair: 0.5, starFree: 3, starPenalty: 0.03, // max 3 stars in XI (~27%)
    scoutCost: [24000, 12000, 6000, 3000], scoutOne: [8000, 4000, 2000, 1000], derbyGate: 1.3, hotPremium: 1.1, watchMax: 15,
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
    prizeLeague: [350000, 130000, 55000, 24000], // champion prize per division
    prizeCup: 200000,
    prizeScorer: [60000, 25000, 10000, 5000],
    promoBonus: [0, 90000, 40000, 18000], // bonus for being promoted into division index-1
    upkeepPerSeat: 0.012, // weekly stadium upkeep per seat
    seatCost: 90, // cost to build one seat
    expandStep: 2000,
    expandWeeks: 4,
    facilityCost: [0, 150000, 320000, 650000, 1200000], // cost to go from level N to N+1 (index N), scaled by facDiv
    facDiv: [1, 0.55, 0.3, 0.15],
    loanRate: 0.12, // flat per season
    overdraftFee: 0.01, // weekly on negative balance
    youthPot: [66, 60, 54, 49], youthSd: 10, youthExtra: 0.45, aiKeep: 0.8,
    homeAdv: 1.15,
    homeMid: 1.8,
    gam: 0.036,
    gamM: 0.036,
    baseAttack: 0.28, // attacking events per minute (both teams)
    baseGoal: 0.090,
  };

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
      return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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

  SF.util = {
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
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
