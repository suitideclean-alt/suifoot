# v0.8: owner pages (summary, finance, data, commercial, club, team, reputation, hall of fame)
from playwright.sync_api import sync_playwright
ok = lambda c, m: print(('OK   ' if c else 'FAIL ') + m)
errs = []
G = "SF.UI.G"
CL = G + ".clubs[" + G + ".coaches[0].club]"
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w in (('desktop', 1200), ('mobile', 390)):
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.add_init_script("localStorage.setItem('suifoot.recap','1');localStorage.setItem('suifoot.lang','en')")
        pg.goto('http://localhost:8765/'); pg.wait_for_timeout(600)
        pg.select_option('#sr0', 'owner'); pg.click('text=Start'); pg.wait_for_timeout(600)
        pg.evaluate(G + "&&SF.Bank.credit(" + G + "," + CL + ".id,2000000,'bailout')")
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        subs = pg.inner_text('.sub').upper()
        ok(all(x in subs for x in ['SUMMARY', 'FINANCE', 'DATA', 'COMMERCIAL', 'CLUB', 'TEAM', 'REPUTATION', 'HALL OF FAME']), name + ': 8 owner sections')
        ok(pg.locator('.kpi').count() >= 5, name + ': summary has KPI tiles')
        for s in ['Finance', 'Data', 'Commercial', 'Club', 'Team', 'Reputation', 'Hall of fame']:
            pg.click('.sub >> text=' + s); pg.wait_for_timeout(250)
            pg.screenshot(path=f'/tmp/logos/b12_{s.replace(" ", "_")}_{name}.png', full_page=True)
            ok(pg.locator('.pagehead').count() == 1 and 'undefined' not in pg.inner_text('body') and 'NaN' not in pg.inner_text('body'), name + ': ' + s + ' renders clean')
        # commercial actions
        pg.click('.sub >> text=Commercial'); pg.wait_for_timeout(200)
        pg.locator('button:has-text("Sign")').first.click(); pg.wait_for_timeout(300)
        ok(pg.evaluate(CL + ".boss.spon") is not None, name + ': sponsor signed')
        pg.click('.seg button:has-text("Premium")'); pg.wait_for_timeout(200)
        ok(pg.evaluate(CL + ".boss.merch") == 'premium', name + ': merch price set')
        pg.locator('button:has-text("Special edition kit")').click(); pg.wait_for_timeout(200)
        ok(pg.evaluate(CL + ".boss.kitLeft") > 0, name + ': special kit')
        pg.locator('button:has-text("Run it")').first.click(); pg.wait_for_timeout(300)
        ok(pg.evaluate(CL + ".boss.evN") == 1, name + ': event run')
        pg.click('button[data-act="price:0.1"]'); pg.wait_for_timeout(200)
        # club page
        pg.click('.sub >> text=Club'); pg.wait_for_timeout(200)
        pg.locator('.seg button[data-act="o_line:acad-3"]').click(); pg.wait_for_timeout(200)
        ok(pg.evaluate(CL + ".boss.lines.acad") == 3, name + ': academy line 3')
        pg.locator('button[data-act="o_proj:roof"]').click(); pg.wait_for_timeout(200)
        ok(pg.evaluate(CL + ".boss.build") is not None, name + ': stadium project started')
        if pg.locator('select#partner-sel').count():
            pg.click('button[data-act="o_partner:sel"]'); pg.wait_for_timeout(200)
            ok(pg.evaluate(CL + ".boss.partner") is not None, name + ': partner club')
        ok(pg.locator('text=Your manager').count() + pg.locator('text=Manager').count() >= 1, name + ': manager inside Club')
        # finance: stake, bond
        pg.click('.sub >> text=Finance'); pg.wait_for_timeout(200)
        pg.locator('button[data-act="o_stake:0.05"]').click(); pg.wait_for_timeout(200)
        pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(300)
        ok(len(pg.evaluate(CL + ".boss.invest")) == 1, name + ': stake sold')
        pg.fill('#bond-amt', '50000'); pg.click('button[data-act="o_bond"]'); pg.wait_for_timeout(300)
        ok(len(pg.evaluate(CL + ".boss.bonds")) == 1, name + ': bond issued')
        # run a few weeks, then everything still renders
        pg.click('nav.tabs >> text=Home'); pg.click('button:has-text("Advance until")'); pg.wait_for_timeout(1500)
        if pg.locator('#modal .ovl').count(): pg.locator('#modal button').first.click(); pg.wait_for_timeout(500)
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        for s in ['Summary', 'Finance', 'Data', 'Commercial', 'Club', 'Reputation', 'Hall of fame']:
            pg.click('.sub >> text=' + s); pg.wait_for_timeout(200)
            ok('undefined' not in pg.inner_text('body') and 'NaN' not in pg.inner_text('body'), name + ': after a season ' + s + ' clean')
        pg.click('.sub >> text=Hall of fame'); pg.click('.seg button:has-text("Growth")'); pg.wait_for_timeout(200)
        ok(pg.locator('tr.me').count() == 1, name + ': you are in the ranking')
        # owner finance tab is lean
        pg.click('nav.tabs >> text=Finance'); pg.wait_for_timeout(200)
        ok(pg.locator('[data-act="fac:youth"]').count() == 0 and pg.locator('[data-act^="expand:"]').count() == 0, name + ': Finance tab has no stadium controls for the owner')
        ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': no horizontal scroll')
        pg.close()
    b.close()
print('errors:', errs)
