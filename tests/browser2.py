import json, re
from playwright.sync_api import sync_playwright
errs=[]
def run():
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':900}); pg=ctx.new_page()
    pg.on('console', lambda m: errs.append(('console.'+m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.add_init_script("try{localStorage.setItem('suifoot.recap','0')}catch(e){}"); pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    # pick a division-2 club in setup via option text
    pg.select_option('#sc0', index=13)  # first club of div2
    pg.fill('#sn0','Ana'); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    # squad: switch off auto, change a role, back to auto
    pg.click('[data-act="tab:squad"]'); pg.uncheck('input[data-chg=auto]'); pg.wait_for_timeout(100)
    pg.select_option('select[data-chg=form]', '3-5-2'); pg.wait_for_timeout(100)
    pg.check('input[data-chg=auto]')
    # transfers: affordable, buy first
    pg.click('[data-act="tab:transfers"]'); pg.click('[data-act=afford]'); pg.wait_for_timeout(100)
    pg.screenshot(path='/tmp/shots/10_transfers_afford.png')
    pg.click('button[data-act^="buy:"]'); pg.wait_for_selector('#modal .dlg'); pg.screenshot(path='/tmp/shots/11_buy_modal.png'); pg.click('[data-act=m-ok]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/shots/12_after_buy.png')
    # finance: loan and facility
    pg.click('[data-act="tab:finance"]'); pg.click('[data-act=loan]'); pg.wait_for_selector('#modal .dlg'); pg.fill('#modal input[name=amt]','50000'); pg.click('[data-act=m-ok]'); pg.wait_for_timeout(200)
    pg.click('[data-act="fac:youth"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="expand:1"]'); pg.wait_for_timeout(200)
    pg.screenshot(path='/tmp/shots/13_finance_after.png')
    # simulate the season
    pg.click('[data-act="tab:home"]'); pg.click('[data-act=sim-season]'); pg.wait_for_selector('text=Start next season', timeout=60000)
    pg.screenshot(path='/tmp/shots/14_season_end.png')
    [pg.click('[data-act=m-cancel]') for _ in range(3) if pg.query_selector('[data-act=m-cancel]')]; pg.click('[data-act=next-season]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/shots/15_season2.png')
    # languages
    for lang in ['fr','pt','de']:
        pg.click('[data-act="tab:settings"]'); pg.select_option('select[data-chg=lang]', lang); pg.wait_for_timeout(150)
        for tab in ['home','squad','finance']:
            pg.click(f'[data-act="tab:{tab}"]'); pg.wait_for_timeout(100); pg.screenshot(path=f'/tmp/shots/20_{lang}_{tab}.png')
    # reload persists
    pg.reload(); pg.wait_for_selector('header.top')
    print('after reload season:', pg.inner_text('header.top .pill'))
    # check save size
    n=pg.evaluate("localStorage.getItem('suifoot.save.v1').length"); print('save bytes',n)
    print(json.dumps(errs))
    b.close()
run()
