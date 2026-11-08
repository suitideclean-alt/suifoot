import json
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':900}); pg=ctx.new_page()
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('select[data-chg=setup-n]','2'); pg.wait_for_selector('#sn1')
    pg.fill('#sn0','Ana'); pg.fill('#sn1','Bruno'); pg.select_option('#sc0', index=1); pg.select_option('#sc1', index=2)
    pg.click('[data-act=setup-start]'); pg.wait_for_selector('.coachsw')
    pg.screenshot(path='/tmp/shots/30_two_coaches.png')
    pg.click('[data-act="coach:1"]'); pg.wait_for_timeout(100)
    print('active coach club:', pg.inner_text('header.top .pill:nth-of-type(2)'))
    # force sacking of coach 2 via state, then check UI
    pg.evaluate("""()=>{const G=SF.UI.G; const c=G.coaches[1]; c.board=3; c.jobWeeks=12;}""")
    pg.click('[data-act="tab:home"]'); pg.click('[data-act=sim-week]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/shots/31_sacked.png')
    txt=pg.inner_text('.wrap'); print('sacked banner:', 'sacked' in txt.lower())
    # accept job if any, else advance until offer
    for i in range(6):
        if pg.locator('[data-act^="job:"]').count(): break
        pg.click('[data-act=sim-week]'); pg.wait_for_timeout(150)
    print('offers available:', pg.locator('[data-act^="job:"]').count())
    pg.click('[data-act^="job:"]'); pg.wait_for_timeout(200)
    print('new club pill:', pg.inner_text('header.top .pill:nth-of-type(2)'))
    # mobile
    pg.set_viewport_size({'width':390,'height':800}); pg.click('[data-act="tab:home"]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/shots/32_mobile_home.png')
    pg.click('[data-act="tab:league"]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/shots/33_mobile_league.png')
    print(json.dumps(errs)); b.close()
