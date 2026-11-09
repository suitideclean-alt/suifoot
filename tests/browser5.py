from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('#sc0', index=13); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    pg.evaluate("""()=>{const SF=window.SF,G=SF.UI.G,c=G.coaches[0],club=G.clubs[c.club];
      const p=SF.Game.players(G,club)[5]; const buyer=G.clubIds.find(id=>!G.clubs[id].human);
      G.offers.push({id:G.nextOffer++,coach:c.id,club:buyer,pid:p.id,fee:Math.round(SF.Econ.value(p)*1.2),ttl:3});
      SF.Actions.genOffers(G,c,1);}""")
    pg.click('[data-act="tab:squad"]'); pg.wait_for_timeout(200)
    pg.screenshot(path='/tmp/shots/41_popup.png')
    pg.click('[data-act^="jobview:"]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/shots/42_clubview.png')
    pg.click('[data-act=m-cancel]')
    pg.click('[data-act="tab:transfers"]'); pg.click('[data-act="tr:offers"]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/shots/43_offers.png')
    pg.click('[data-act="tab:home"]'); pg.click('[data-act=sim-season]'); pg.wait_for_selector('text=Start next season', timeout=60000); pg.screenshot(path='/tmp/shots/44_seasonend.png')
    print(errs); b.close()
