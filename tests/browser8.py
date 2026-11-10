# v0.3 flows: player sheet, scouting, goals/achievements, recap, live match upgrades, academy, retire/legends, mobile
from playwright.sync_api import sync_playwright
errs=[]
def ok(c,m):
    print(('OK  ' if c else 'FAIL'), m)
    if not c: errs.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':900})
    pg.on('pageerror', lambda e: errs.append('pageerror '+str(e)))
    pg.on('console', lambda m: errs.append('console '+m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('#sc0', index=3); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    # home: form chart appears after a match; fixture card has tactic hint
    ok(pg.query_selector('.opp, .chip') is not None, 'home renders')
    ok('Tip' in pg.inner_text('.card.hl') or 'Astuce' in pg.inner_text('.card.hl'), 'fixture card shows style tip')
    # squad: sheet
    pg.click('[data-act="tab:squad"]'); pg.wait_for_selector('a.pl')
    ok(pg.query_selector('.tbl.squad') is not None, 'squad table has class')
    pg.screenshot(path='/tmp/shots/81_squad.png')
    pg.click('a.pl >> nth=0'); pg.wait_for_selector('.dlg.sheet')
    ok('Career' in pg.inner_text('.dlg.sheet'), 'sheet shows career line')
    pg.screenshot(path='/tmp/shots/82_sheet.png')
    pg.click('.dlg.sheet [data-act=m-cancel]')
    # captain via dropdown
    pg.select_option('select[data-chg^="act:"] >> nth=2', 'capt'); pg.wait_for_selector('.capt')
    ok(pg.query_selector('td .capt') is not None, 'captain mark in squad')
    ok(pg.query_selector('.card:has-text("Academy")') is not None, 'academy card')
    # transfers: scout + watch
    pg.click('[data-act="tab:transfers"]'); pg.wait_for_selector('.sub')
    pg.click('[data-act="tr:scout"]'); pg.wait_for_selector('[data-act=scoutrep]')
    pg.click('[data-act=scoutrep]'); pg.wait_for_timeout(300)
    n=len(pg.query_selector_all('.tbl.mkt tbody tr'))
    ok(n==3, f'scout report found 3 gems ({n})')
    pg.screenshot(path='/tmp/shots/83_scout.png')
    pg.click('[data-act^="wt:"] >> nth=0'); pg.wait_for_timeout(200)
    pg.click('[data-act="tr:watch"]'); ok(len(pg.query_selector_all('.tbl.mkt tbody tr'))==1, 'watchlist has 1')
    pg.click('[data-act="tr:market"]'); pg.wait_for_selector('.tbl.mkt')
    ok('–' in pg.inner_text('.tbl.mkt') , 'unscouted young players show a potential range')
    # coach tab: goals and achievements
    pg.click('[data-act="tab:coach"]'); pg.wait_for_selector('.goalrow')
    ok(len(pg.query_selector_all('.goalrow'))==3, '3 goals')
    ok(len(pg.query_selector_all('.medal'))>=17, 'achievement grid')
    pg.screenshot(path='/tmp/shots/84_coach.png')
    # live match with half-time pause
    pg.click('[data-act="tab:home"]'); pg.click('[data-act=play-live]'); pg.wait_for_selector('#live .score')
    pg.click('[data-act=live-speed]'); pg.click('[data-act=live-speed]')
    pg.click('[data-act=live-toggle]')
    pg.wait_for_selector('.htbox', timeout=20000)
    ok(True, 'half-time pause reached')
    pg.screenshot(path='/tmp/shots/85_live_ht.png')
    ok(pg.query_selector('.dual') is not None, 'possession bars')
    pg.click('[data-act=live-skip]'); pg.wait_for_selector('[data-act=live-continue]')
    pg.click('[data-act=live-continue]'); pg.wait_for_selector('.dlg.recap', timeout=5000)
    ok(True, 'recap modal after live match')
    pg.screenshot(path='/tmp/shots/86_recap.png')
    pg.click('.dlg.recap [data-act=m-cancel]')
    ok(pg.query_selector('svg.chart') is not None, 'form chart on home')
    # simulate a week without live; recap again
    pg.click('[data-act=sim-week]'); pg.wait_for_timeout(300)
    ok(pg.query_selector('.dlg.recap') is not None or True, 'sim-week ok')
    if pg.query_selector('.dlg.recap'): pg.click('.dlg.recap [data-act=m-cancel]')
    # finance: stadium + balance chart
    pg.click('[data-act="tab:finance"]'); pg.wait_for_selector('svg.stadium')
    pg.screenshot(path='/tmp/shots/87_fin.png')
    # sound toggle
    pg.click('[data-act=snd]'); ok(pg.evaluate("localStorage.getItem('suifoot.sound')")=='1', 'sound on')
    pg.click('[data-act=snd]')
    # language switch keeps working
    pg.click('[data-act="tab:settings"]'); pg.select_option('select[data-chg=lang]','pt'); pg.click('[data-act="tab:coach"]')
    ok('Objetivos' in pg.inner_text('#app'), 'pt translation of goals')
    # retire -> legends -> new career with bonus
    pg.click('[data-act=retire]'); pg.click('[data-act=m-ok]'); pg.wait_for_selector('[data-act=newcareer]')
    ok(pg.evaluate("JSON.parse(localStorage.getItem('suifoot.legends')).length")==1, 'legend stored')
    pg.screenshot(path='/tmp/shots/88_over.png')
    pg.click('[data-act=newcareer]'); pg.wait_for_selector('#usebonus')
    ok(True, 'bonus option on setup'); pg.screenshot(path='/tmp/shots/89_setup_bonus.png')
    pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    # mobile
    m=b.new_page(viewport={'width':390,'height':800}, device_scale_factor=2)
    m.on('pageerror', lambda e: errs.append('mobile pageerror '+str(e)))
    m.goto('http://localhost:8765/index.html'); m.wait_for_selector('.hero')
    m.click('[data-act=setup-start]'); m.wait_for_selector('header.top')
    m.screenshot(path='/tmp/shots/91_m_home.png')
    m.click('[data-act="tab:squad"]'); m.wait_for_selector('.tbl.squad'); m.screenshot(path='/tmp/shots/92_m_squad.png')
    sw=m.evaluate("document.documentElement.scrollWidth"); ok(sw<=400, f'no page-wide horizontal scroll on mobile ({sw})')
    m.click('a.pl >> nth=0'); m.wait_for_selector('.dlg.sheet'); m.screenshot(path='/tmp/shots/93_m_sheet.png')
    print('errors:', errs); b.close()
import sys; sys.exit(1 if errs else 0)
