# Owner-only playthrough through the real UI: N seasons from a random division-4 club. Logs every season and every refused action.
import json, sys, random
from playwright.sync_api import sync_playwright
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
SEED_OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/play'
import os; os.makedirs(SEED_OUT, exist_ok=True)
log, seasons, issues = [], [], []
G = "SF.UI.G"
SNAP = """(()=>{const G=SF.UI.G,co=G.coaches[0],B=SF.Bank,O=SF.Owner,Bo=SF.Boss,club=co.club&&G.clubs[co.club];
 const w=O.walletBal(G,co.id);
 if(!club) return {season:G.season,club:null,role:co.role,wallet:w,rep:co.rep,sacked:co.sacked};
 const st=SF.Game.standings(G,club.div),b=club.boss||{};const ac=club.ac;
 const led=(G.bank.led[club.id]||[]).filter(e=>e[0]===G.season);let inc=0,exp=0;for(const e of led){const a=e[2],m=e[3];if(m>=0)inc+=m;else exp+=-m;}
 return {season:G.season,club:club.name,id:club.id,div:club.div,pos:st.indexOf(club.id)+1,pts:G.table[club.id].pts,bal:Math.round(B.bal(G,club.id)),debt:Math.round(B.debtOf(G,club.id)),wallet:Math.round(w),
  fans:club.fans,cap:club.cap,price:club.price,fy:club.facility.youth,ft:club.facility.train,sup:Math.round(b.sup||0),
  proj:b.proj?Object.assign({},b.proj):null,lines:b.lines?Object.assign({},b.lines):null,spon:b.spon?b.spon.k:null,
  value:Math.round(Bo.value?Bo.value(G,club):0),wages:Math.round(O.wageBill(G,club)),acName:ac?ac.name:null,acRep:ac?ac.rep:null,
  rep:co.rep,role:co.role,sacked:co.sacked,squad:club.squad.length,inc:Math.round(inc),exp:Math.round(exp),invested:Math.round(b.spent||0)};})()"""
with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e) + ' @S' + str(pg.evaluate('SF.UI.G.season')) + ' ' + (getattr(e,'stack','') or '')[:200].replace(chr(10),' / ')))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    pg.add_init_script("localStorage.setItem('suifoot.recap','0');localStorage.setItem('suifoot.lang','en')")
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500)
    pg.select_option('#sr0', 'owner'); pg.click('text=Start'); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.setItem('suifoot.dbg','1')")
    season = lambda: pg.evaluate(G + ".season")

    def note(kind, msg):
        log.append({'s': season(), 'k': kind, 'm': msg}); 
    def toasts():
        return pg.evaluate("[...document.querySelectorAll('#toast div')].map(d=>(d.className?'!':'')+d.textContent)")
    def settle():
        pg.wait_for_timeout(120)
        if pg.query_selector('#modal [data-act="m-ok"]'):
            pg.click('#modal [data-act="m-ok"]'); pg.wait_for_timeout(120)
    def click(sel, what=None, confirm=True):
        loc = pg.locator(sel + ':not([disabled])')
        if loc.count() == 0: return False
        try:
            loc.first.click(timeout=2500)
        except Exception as e:
            note('click-fail', (what or sel) + ' ' + str(e)[:80]); return False
        pg.wait_for_timeout(150)
        if confirm: settle()
        t = toasts()
        bad = [x for x in t if x.startswith('!')]
        if bad: note('refused', (what or sel) + ' -> ' + ' | '.join(bad))
        pg.evaluate("document.querySelector('#toast').innerHTML=''")
        return True
    def goto(sub):
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(100)
        click('[data-act="ot:%s"]' % sub, confirm=False); pg.wait_for_timeout(100)
    def gotoc(sub):
        pg.click('nav.tabs >> text=Coach'); pg.wait_for_timeout(100)
        click('[data-act="ct:%s"]' % sub, confirm=False); pg.wait_for_timeout(100)
    def shot(name):
        pg.screenshot(path=f'{SEED_OUT}/{name}.png', full_page=True)
    def health(name):
        txt = pg.inner_text('body')
        if 'undefined' in txt or 'NaN' in txt: note('ui-bug', name + ' shows undefined/NaN')
        ov = pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+2")
        if ov: note('ui-overflow', name)

    snap0 = pg.evaluate(SNAP); snap0['start'] = True; seasons.append(snap0)
    note('start', json.dumps(snap0))
    for sn in range(1, N + 1):
        co_club = pg.evaluate(G + ".coaches[0].club")
        if not co_club:
            note('no-club', 'the owner has no club any more; stopping the owner playthrough'); break
        # ---- season start: look at every owner page, then act ----
        for sub in ['summary', 'finance', 'data', 'commercial', 'club', 'team', 'rep', 'hall']:
            goto(sub); health(sub)
            if sn in (1, 5, 10): shot(f's{sn:02d}_{sub}')
        bal = pg.evaluate(SNAP)
        def inject(n):
            goto('summary')
            if pg.query_selector('#own-amt'):
                pg.fill('#own-amt', str(n))
                if click('[data-act="invest"]', 'inject %d' % n): note('act', 'injected %d into the club' % n); return True
            else: note('ui-bug', 'no money box on the summary page')
            return False
        W = bal['wallet']
        # a sensible owner keeps the club liquid: top up when the balance is thin
        if bal['bal'] < 150000 * (1 + sn // 3) and W > 120000: inject(min(250000, W - 20000)); bal = pg.evaluate(SNAP)
        # ----- coach desk: limits, hiring, negotiation, search, objectives, chat -----
        if sn in (1, 5, 10):
            for sub in ['coach', 'goals', 'limits', 'chat', 'jobs']:
                gotoc(sub); health('coach-' + sub); shot(f's{sn:02d}_coach_{sub}')
        bal = pg.evaluate(SNAP)
        gotoc('limits')
        if pg.query_selector('#pol-budget'):
            b_ = max(60000, int(bal['bal'] * 0.5))
            for k, v in [('budget', b_), ('maxFee', max(15000, b_ // 3)), ('maxWage', 600), ('wageCap', 12000 + sn * 1500), ('reserve', int(bal['bal'] * 0.1))]:
                pg.fill('#pol-' + k, str(v))
            if click('[data-act="pol-save"]', 'save limits'): note('act', 'set coach limits: budget %d' % b_)
        else: note('ui-bug', 'limits form not found')
        gotoc('coach')
        ac = pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].ac")
        if not ac:
            gotoc('jobs')
            if click('[data-act^="hire:"]', 'hire coach'): note('act', 'hired a coach from the market')
            else: note('ui-bug', 'no coach and no hire button')
        elif sn == 3:
            if click('[data-act="acrenew"]', 'renew coach'): note('act', 'renewed the coach')
            gotoc('jobs')
            if click('[data-act^="approach:"]', 'approach another club coach'): note('act', 'approached a coach of another club')
        elif sn == 5:
            if click('[data-act="acfire"]', 'fire coach'):
                note('act', 'fired the coach'); gotoc('jobs')
                if click('[data-act^="hire:"]', 'hire replacement'): note('act', 'hired a replacement')
        elif sn == 7:
            if click('[data-act="acmutual"]', 'mutual termination'):
                note('act', 'ended the contract by mutual agreement'); gotoc('jobs')
                if click('[data-act^="hire:"]', 'hire after mutual'): note('act', 'hired after mutual')
        if sn in (1, 2, 6):
            gotoc('goals')
            if pg.query_selector('#obj-pos'):
                pg.fill('#obj-pos', '8' if sn == 1 else '5')
                if click('[data-act="obj-save"]', 'save objectives'): note('act', 'set objectives')
        if sn in (2, 4):
            gotoc('chat')
            if click('[data-act^="chat:"]', 'ask the coach'): note('act', 'asked the coach a question')
        # ----- commercial -----
        goto('commercial')
        bal = pg.evaluate(SNAP)
        if not bal['spon']:
            if click('[data-act^="o_spon:"]', 'sign sponsor'): note('act', 'signed a sponsor')
        click('[data-act="o_merch:premium"]' if sn % 2 else '[data-act="o_merch:normal"]', 'merch'); click('[data-act="o_member:high"]' if sn == 4 else '[data-act="o_member:normal"]', 'members')
        if sn % 2 == 1 and click('[data-act="o_kit"]', 'special kit'): note('act', 'special kit')
        for k in ['acad', 'mkt', 'comm']:
            lvl = min(3, 1 + sn // 3)
            if bal['bal'] > 100000 + 40000 * lvl and click('[data-act="o_line:%s-%d"]' % (k, lvl), 'line %s %d' % (k, lvl)): note('act', 'set line %s to %d' % (k, lvl))
        if sn >= 2:
            for ev in (['concert', 'friendly', 'tour'][sn % 3],):
                if click('[data-act="o_event:%s"]' % ev, 'event ' + ev): note('act', 'event ' + ev)
        if sn == 2 and pg.query_selector('#partner-sel') and click('[data-act="o_partner:sel"]', 'partner club'): note('act', 'partner club set')
        if sn == 2 and click('[data-act^="o_stake:"]', 'sell stake'): note('act', 'sold a stake to investors')
        if sn == 3 and click('[data-act^="o_buyback:"]', 'buy back stake'): note('act', 'bought back the stake')
        if sn == 4 and pg.query_selector('#bond-amt'):
            pg.fill('#bond-amt', '100000'); 
            if click('[data-act="o_bond"]', 'issue bond'): note('act', 'issued a bond')
        if sn == 6 and click('[data-act^="o_repay:"]', 'repay bond'): note('act', 'repaid a bond')
        # ----- stadium, facilities, projects -----
        goto('club')
        bal = pg.evaluate(SNAP)
        if bal['fans'] > bal['cap'] * 0.85 and bal['bal'] > 120000 and click('[data-act="expand:1"]', 'expand stadium'): note('act', 'expanded the stadium')
        for k in ['youth', 'train']:
            if bal['bal'] > 200000 and click('[data-act="fac:%s"]' % k, 'facility ' + k): note('act', 'upgraded facility ' + k)
        for k in ['roof', 'lights', 'museum', 'med']:
            if bal['bal'] > 500000 and click('[data-act="o_proj:%s"]' % k, 'project ' + k): note('act', 'started project ' + k)
        # ticket price: try the other direction once
        if sn == 2: click('[data-act="price:0.5"]', 'ticket price up')
        if sn == 3: click('[data-act="price:-0.5"]', 'ticket price down')
        # a rich owner takes some money out
        if bal['bal'] > 2500000 and sn % 3 == 0:
            goto('finance')
            if pg.query_selector('#own-amt'):
                pg.fill('#own-amt', '500000')
                if click('[data-act="withdraw"]', 'withdraw'): note('act', 'withdrew 500k')
        # ---- play the season, answering requests ----
        guard = 0
        while pg.evaluate(G + ".phase") == 'play' and guard < 80:
            guard += 1
            if pg.query_selector('[data-act="apy"], [data-act^="apy:"]'):
                pass
            ok = pg.evaluate("SF.Owner.openFor(SF.UI.G,SF.UI.G.coaches[0].club||'').length") if pg.evaluate(G + ".coaches[0].club") else 0
            if ok:
                goto('summary')
                for _ in range(4):
                    if click('[data-act^="apy:"]', 'approve request'): note('act', 'approved a request')
                    elif click('[data-act^="apn:"]', 'decline request'): note('act', 'declined a request')
                    else: break
            pg.click('nav.tabs >> text=Home')
            if not click('[data-act="auto"]', 'auto advance', confirm=False): break
            pg.wait_for_timeout(250)
            if not pg.evaluate(G + ".coaches[0].club"): break
        snap = pg.evaluate(SNAP); snap['end'] = True; seasons.append(snap)
        # coach contract: renew or replace when it is about to end
        if pg.evaluate(G + ".phase") == 'seasonEnd':
            if not pg.evaluate(G + ".coaches[0].club"):
                note('lost-club', 'the owner lost the club at the end of season %d' % sn)
                shot(f'end_s{sn:02d}'); break
            shot(f'end_s{sn:02d}') if sn in (1, 5, 10) else None
            click('[data-act="m-cancel"]', confirm=False)
            if not click('[data-act="newseason"], [data-act="next-season"], [data-act="newSeason"]', 'new season', confirm=False):
                # find the button by its text
                btn = pg.locator('button.pri:has-text("season")')
                if btn.count(): btn.first.click(); pg.wait_for_timeout(300)
                else:
                    pg.evaluate("SF.Game.newSeason(SF.UI.G);SF.UI.G.phase" ); note('workaround', 'no visible new-season button; called newSeason directly')
            pg.wait_for_timeout(300); settle()
    final = pg.evaluate(SNAP); final['final'] = True; seasons.append(final)
    json.dump({'seasons': seasons, 'log': log, 'errors': errs, 'news': pg.evaluate("(SF.UI.G.news||[]).slice(-60).map(n=>JSON.stringify(n))")}, open(SEED_OUT + '/result.json', 'w'), indent=1)
    print('seasons logged', len(seasons), 'log', len(log), 'errors', len(errs))
    br.close()
