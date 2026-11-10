# v0.4: role selector, contract card, owner tab, request flow, mobile
from playwright.sync_api import sync_playwright
ok = lambda c, m: print(('OK   ' if c else 'FAIL ') + m)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w in (('desktop', 1200), ('mobile', 390)):
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('suifoot.recap','0');localStorage.setItem('suifoot.lang','en')")
        pg.goto('http://localhost:8765/'); pg.wait_for_timeout(600)
        ok(pg.locator('#sr0').count() == 1, name + ': role selector on setup')
        sw = pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        ok(sw, name + ': setup has no horizontal scroll')
        pg.screenshot(path=f'/tmp/logos/b9_setup_{name}.png')
        # coach role
        pg.click('text=Start'); pg.wait_for_timeout(500)
        pg.click('nav.tabs >> text=Coach'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Requests to the owner').count() == 1, name + ': contract card with requests list')
        ok(pg.locator('nav.tabs >> text=Owner').count() == 0, name + ': coach role has no Owner tab')
        pg.click('text=Ask for mutual termination'); pg.wait_for_timeout(300)
        ok(pg.locator('#modal').count() >= 1 and 'SFOOT' in pg.inner_text('#modal'), name + ': mutual termination asks for confirmation')
        pg.keyboard.press('Escape')
        pg.screenshot(path=f'/tmp/logos/b9_coach_{name}.png')
        # owner-coach role
        pg.evaluate("localStorage.removeItem('suifoot.save.v1')"); pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500)
        pg.select_option('#sr0', 'both'); pg.click('text=Start'); pg.wait_for_timeout(500)
        ok(pg.locator('nav.tabs >> text=Owner').count() == 1, name + ': owner-coach has the Owner tab')
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        before = pg.inner_text('.card.hl')
        pg.fill('#own-amt', '5000'); pg.click('text=Invest in the club'); pg.wait_for_timeout(300)
        after = pg.inner_text('.card.hl')
        ok(before != after, name + ': investing changes the wallet and club cash')
        ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': owner tab has no horizontal scroll')
        pg.screenshot(path=f'/tmp/logos/b9_owner_{name}.png')
        pg.close()
    b.close()
print('errors:', errs)
