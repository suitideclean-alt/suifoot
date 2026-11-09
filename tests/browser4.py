import json
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('#sc0', index=13); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    # inject an offer to the player's club and a job offer
    pg.evaluate("""()=>{const SF=window.SF,G=SF.UI.G,c=G.coaches[0],club=G.clubs[c.club];
      const p=SF.Game.players(G,club)[5]; const buyer=G.clubIds.find(id=>!G.clubs[id].human);
      G.offers.push({id:G.nextOffer++,coach:c.id,club:buyer,pid:p.id,fee:Math.round(SF.Econ.value(p)*1.2),ttl:3});
      SF.Actions.genOffers(G,c,1); SF.UI.render?SF.UI.render():0;}""")
    pg.click('[data-act="tab:home"]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/shots/40_popup.png') if pg.locator('.dlg').count() else print('NO POPUP (render hook)')
    print('popup:', pg.locator('.dlg').count())
    b.close()
print(errs)
