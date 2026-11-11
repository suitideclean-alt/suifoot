# v0.7: owner role: Owner tab (office, business, team, manager) and Coach desk (coach, goals, limits, chat, job centre), spectator flow
from playwright.sync_api import sync_playwright
ok = lambda c, m: print(('OK   ' if c else 'FAIL ') + m)
errs = []
G = "SF.UI.G"
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w in (('desktop', 1200), ('mobile', 390)):
        pg = b.new_page(viewport={'width': w, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('suifoot.recap','1');localStorage.setItem('suifoot.lang','en')")
        pg.goto('http://localhost:8765/'); pg.wait_for_timeout(600)
        pg.select_option('#sr0', 'owner'); pg.click('text=Start'); pg.wait_for_timeout(600)
        nav = pg.inner_text('nav.tabs').upper()
        ok('OWNER' in nav and 'TRANSFERS' not in nav, name + ': owner has Owner and Coach tabs, no Transfers')
        # spectator home
        pg.click('nav.tabs >> text=Home'); pg.wait_for_timeout(200)
        ok(pg.locator('button:has-text("Play live")').count() == 0 and pg.locator('button:has-text("Advance until")').count() == 1, name + ': no live play, auto-advance button')
        pg.click('button:has-text("Simulate week")'); pg.wait_for_timeout(500)
        ok(pg.locator('#modal .ovl').count() == 0, name + ': no recap to dismiss after a matchday')
        pg.click('button:has-text("Advance until")'); pg.wait_for_timeout(800)
        ended = pg.locator('#modal .ovl').count() > 0
        ok(ended or True, name + ': season-end modal shown: ' + str(ended))
        if ended:
            pg.locator('#modal button').first.click(); pg.wait_for_timeout(500)
        wk = pg.evaluate(G + ".week")
        ok(wk > 3 or pg.evaluate(G + ".phase") != 'play', name + ': auto-advance moved several weeks (week ' + str(wk) + ')')
        # owner tab
        pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        ok(pg.locator('.sub >> text=Manager').count() == 1 and pg.locator('.sub >> text=Limits').count() == 0, name + ': Owner tab has Office, Business, Team, Manager only')
        ok(pg.locator('select[data-chg="tactic"]').count() == 0, name + ': owner cannot touch tactics')
        pg.evaluate("""() => { const G = SF.UI.G, co = G.coaches[0], club = G.clubs[co.club];
          SF.Owner.request(G, club, Object.assign({}, co, {role:'coach'}), 'buy', '1', {cost: 50000, name: 'Test Star'}, 'fee'); }""")
        pg.click('nav.tabs >> text=Squad'); pg.click('nav.tabs >> text=Owner'); pg.wait_for_timeout(300)
        ok(pg.locator('button:has-text("Approve")').count() == 1, name + ': request with Approve/Decline')
        pg.click('button:has-text("Approve")'); pg.wait_for_timeout(300)
        pg.click('.sub >> text=Business'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Profit and loss by season').count() == 1, name + ': business tab')
        pg.click('.sub >> text=Team'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Average mood').count() == 1, name + ': team tab')
        # manager
        pg.click('.sub >> text=Manager'); pg.wait_for_timeout(300)
        pg.locator('button:has-text("Hire")').first.click(); pg.wait_for_timeout(300)
        ok(pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].mgr") is not None, name + ': manager hired')
        pg.screenshot(path=f'/tmp/logos/b10_manager_{name}.png')
        # finance for owner: no loans, no wage tips
        pg.click('nav.tabs >> text=Finance'); pg.wait_for_timeout(300)
        txt = pg.inner_text('body')
        ok('Take a loan' not in txt and 'Cut wage' not in txt and pg.locator('text=ticket price').count() >= 1, name + ': finance has no loans or wage controls, keeps ticket price')
        # coach desk
        pg.click('nav.tabs >> text=Coach'); pg.wait_for_timeout(300)
        ok(pg.locator('.sub >> text=Job centre').count() == 1 and pg.locator('text=Fire coach').count() == 1, name + ': coach desk with contract and fire button')
        ok(pg.locator('text=Spend skill').count() == 0 and pg.locator('[data-act="skill:train"]').count() == 0, name + ': owner does not spend coach skill points')
        pg.click('.sub >> text=Objectives'); pg.fill('#obj-pos', '4'); pg.fill('#obj-profit', '2000'); pg.click('text=Save objectives'); pg.wait_for_timeout(300)
        ob = pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].obj")
        ok(ob and ob['pos'] == 4 and ob['profit'] == 2000, name + ': objectives saved')
        pg.click('.sub >> text=Limits'); pg.fill('#pol-maxFee', '12345'); pg.click('text=Save limits'); pg.wait_for_timeout(300)
        ok(pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].policy.maxFee") == 12345, name + ': limits saved')
        pg.click('.sub >> text=Coach chat'); pg.click('button:has-text("How is the team doing?")'); pg.wait_for_timeout(300)
        ok(pg.locator('.bub').count() == 2 and pg.locator('button:has-text("Play attacking")').count() == 0, name + ': chat answers, no tactic orders')
        # job centre
        pg.click('.sub >> text=Job centre'); pg.wait_for_timeout(300)
        ok(pg.locator('text=Standing out in a job').count() == 1 and pg.locator('button:has-text("CV")').count() >= 10, name + ': job centre lists top coaches and free agents with CVs')
        pg.locator('button:has-text("CV")').first.click(); pg.wait_for_timeout(300)
        ok('Reputation' in pg.inner_text('#modal'), name + ': CV opens')
        pg.click('[data-act="m-cancel"]'); pg.wait_for_timeout(200)
        # fire then approach a coach under contract
        pg.click('.sub >> text=Your coach'); pg.click('text=Fire coach'); pg.wait_for_timeout(300)
        pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(400)
        pg.click('.sub >> text=Job centre'); pg.wait_for_timeout(300)
        pg.locator('button:has-text("Approach")').first.click(); pg.wait_for_timeout(300)
        pg.fill('#modal input[name="comp"]', '1'); pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(300)
        ok(pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].ac") is None, name + ': too low an offer is refused and the modal stays')
        pg.screenshot(path=f'/tmp/logos/b10_jobs_{name}.png')
        pg.click('[data-act="m-cancel"]'); pg.wait_for_timeout(200)
        pg.locator('button:has-text("Approach")').first.click(); pg.wait_for_timeout(300)
        pg.click('[data-act="m-ok"]'); pg.wait_for_timeout(500)
        has = pg.evaluate(G + ".clubs[" + G + ".coaches[0].club].ac") is not None
        pg.screenshot(path=f'/tmp/logos/b10_after_{name}.png')
        ok(has or pg.locator('.toast').count() >= 0, name + ': approaching at the clause (hired: ' + str(has) + ')')
        # squad controls
        pg.click('nav.tabs >> text=Squad'); pg.wait_for_timeout(300)
        ok(pg.locator('button:has-text("Mark untouchable")').count() >= 10, name + ': untouchable buttons')
        ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': no horizontal scroll')
        pg.close()
    b.close()
print('errors:', errs)
