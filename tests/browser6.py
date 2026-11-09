# v0.2 flows: europe tab, finance advisor, loans, vacation, celebration, themes. Needs `python3 -m http.server 8765` in the repo root.
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('#sc0', index=13); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    pg.screenshot(path='/tmp/shots/60_home.png')
    pg.click('[data-act="tab:squad"]'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/61_squad.png')
    pg.click('[data-act="tab:europe"]'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/62_europe.png')
    pg.click('[data-act="eu:ko"]'); pg.wait_for_timeout(100)
    pg.click('[data-act="tab:transfers"]'); pg.click('[data-act="tr:loans"]'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/63_loans.png')
    pg.click('[data-act^="loanin:"] >> nth=0'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/64_loanin_dlg.png'); pg.click('[data-act=m-ok]'); pg.wait_for_timeout(150)
    # play some weeks then finance advisor
    pg.click('[data-act="tab:home"]')
    for i in range(4): pg.click('[data-act=sim-week]'); pg.wait_for_timeout(120)
    pg.click('[data-act="tab:finance"]'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/65_finance.png', full_page=True)
    pg.click('[data-act="tab:coach"]'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/66_coach.png', full_page=True)
    # vacation to end of season
    pg.click('[data-act="vac-start:99"]'); pg.wait_for_timeout(150)
    pg.click('[data-act=vac-run]'); pg.wait_for_selector('text=Start next season', timeout=60000); pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/shots/67_celebration.png')
    if pg.query_selector('[data-act=m-cancel]'): pg.click('[data-act=m-cancel]')
    pg.screenshot(path='/tmp/shots/68_seasonend.png', full_page=True)
    pg.click('[data-act=next-season]'); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/shots/69_vacreport.png')
    if pg.query_selector('[data-act=m-cancel]'): pg.click('[data-act=m-cancel]')
    # theme
    pg.click('[data-act="tab:settings"]'); pg.select_option('[data-chg=theme]','dark'); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/shots/70_dark.png')
    pg.select_option('[data-chg=theme]','light')
    print('season', pg.evaluate("SF.UI.G.season"), 'errors:', errs); b.close()
