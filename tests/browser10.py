# v0.5: owner role (computer coach): office, requests, limits, coach market, hire/fire, squad controls, mobile
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
        pg.select_option('#sr0', 'owner'); pg.click('text=Start'); pg.wait_for_timeout(600)
        nav = pg.inner_text('nav.tabs')
        nav = nav.upper(); ok('OWNER' in nav and 'TRANSFERS' not in nav, name + ': owner role has Owner tab and no Transfers tab')
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Your coach').count() >= 1 and pg.locator('text=Fire coach').count() == 1, name + ': office shows the hired coach')
        pg.screenshot(path=f'/tmp/logos/b10_office_{name}.png')
        # injected request shows with approve button
        pg.evaluate("""() => { const G = SF.UI.G, co = G.coaches[0], club = G.clubs[co.club];
          SF.Owner.request(G, club, Object.assign({}, co, {role:'coach'}), 'buy', '1', {cost: 50000, name: 'Test Star'}, 'fee'); }""")
        pg.click('nav.tabs >> text=Squad'); pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Test Star').count() >= 1 and pg.locator('button:has-text("Approve")').count() == 1, name + ': request appears with Approve/Decline')
        pg.click('button:has-text("Approve")'); pg.wait_for_timeout(300)
        ok(pg.locator('button:has-text("Approve")').count() == 0, name + ': approving clears the inbox')
        # limits
        pg.click('text=Limits'); pg.wait_for_timeout(200)
        pg.fill('#pol-maxFee', '12345'); pg.click('text=Save limits'); pg.wait_for_timeout(300)
        v = pg.evaluate("SF.UI.G.clubs[SF.UI.G.coaches[0].club].policy.maxFee")
        ok(v == 12345, name + ': saving limits changes the policy (' + str(v) + ')')
        # squad: no lineup controls, untouchable button
        pg.click('nav.tabs >> text=Squad'); pg.wait_for_timeout(300)
        ok(pg.locator('button:has-text("Mark untouchable")').count() >= 10, name + ': squad has untouchable buttons')
        pg.locator('button:has-text("Mark untouchable")').first.click(); pg.wait_for_timeout(300)
        ok(pg.locator('text=🔒').count() >= 1, name + ': a player is marked untouchable')
        pg.screenshot(path=f'/tmp/logos/b10_squad_{name}.png')
        # fire, then hire from the market
        pg.click('nav.tabs >> text=Owner'); pg.click('text=Office'); pg.wait_for_timeout(200)
        pg.click('text=Fire coach'); pg.wait_for_timeout(300)
        ok('owes' in pg.inner_text('#modal') or 'SFOOT' in pg.inner_text('#modal') or 'club owes' in pg.inner_text('#modal').lower(), name + ': firing shows the pay-off')
        pg.click('#modal >> text=OK') if pg.locator('#modal >> text=OK').count() else pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(400)
        ok(pg.locator('text=No coach').count() >= 1, name + ': after firing the office shows no coach')
        pg.click('text=Coaches'); pg.wait_for_timeout(300)
        ok(pg.locator('button:has-text("Hire")').count() >= 5, name + ': market lists coaches')
        pg.screenshot(path=f'/tmp/logos/b10_market_{name}.png')
        pg.locator('button:has-text("Hire")').first.click(); pg.wait_for_timeout(300)
        pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(400)
        pg.click('text=Office'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Fire coach').count() == 1, name + ': hiring puts a coach back')
        # play a few weeks without errors
        for _ in range(3):
            pg.evaluate("SF.Game.playWeekAuto(SF.UI.G)")
        pg.click('nav.tabs >> text=Home'); pg.wait_for_timeout(200)
        ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': no horizontal scroll')
        pg.close()
    b.close()
print('errors:', errs)
