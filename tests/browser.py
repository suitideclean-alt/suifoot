import sys, json
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':900}); pg=ctx.new_page()
    pg.on('console', lambda m: errs.append(('console.'+m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.add_init_script("try{localStorage.setItem('suifoot.recap','0')}catch(e){}"); pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.screenshot(path='/tmp/shots/01_setup.png')
    pg.fill('#sn0','Rui'); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    pg.screenshot(path='/tmp/shots/02_home.png')
    # live match
    pg.click('[data-act=play-live]'); pg.wait_for_selector('#live .score')
    pg.screenshot(path='/tmp/shots/03_live_start.png')
    pg.click('[data-act=live-toggle]'); pg.wait_for_timeout(1500)
    pg.click('[data-act=live-toggle]')
    pg.screenshot(path='/tmp/shots/04_live_paused.png')
    pg.click('[data-act=live-skip]'); pg.screenshot(path='/tmp/shots/05_live_end.png')
    pg.click('[data-act=live-continue]'); pg.wait_for_selector('.grid')
    pg.screenshot(path='/tmp/shots/06_home_after.png')
    for tab in ['squad','league','cup','transfers','finance','coach','settings']:
        pg.click(f'[data-act="tab:{tab}"]'); pg.wait_for_timeout(150); pg.screenshot(path=f'/tmp/shots/07_{tab}.png')
    print(json.dumps(errs))
    b.close()
