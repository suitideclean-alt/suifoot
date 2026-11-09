# celebration screenshots with forged awards (champion + scorer + european cup winner), then a relegation variant
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_selector('.hero')
    pg.select_option('#sc0', index=2); pg.click('[data-act=setup-start]'); pg.wait_for_selector('header.top')
    pg.click('[data-act=sim-season]'); pg.wait_for_selector('text=Start next season', timeout=60000)
    for _ in range(4):
        if pg.query_selector('[data-act=m-cancel]'): pg.click('[data-act=m-cancel]'); pg.wait_for_timeout(150)
    pg.evaluate("""()=>{const G=SF.UI.G,c=G.coaches[0],club=G.clubs[c.club],S=G.summary;
      S.awards=S.awards.filter(a=>a.club!==club.id);
      S.awards.push({k:'euwin',club:club.id,amt:700000},{k:'league',club:club.id,amt:350000,d:0},{k:'scorer',club:club.id,amt:60000,d:0,name:'Rui Test',g:24},{k:'cup',club:club.id,amt:200000});
      S.prizes[club.id]=1310000; S.euQ=[club.id]; c.celeb=0; c.offers=[]; SF.UI.render? 0:0; }""")
    pg.evaluate("()=>{const ev=new Event('x'); document.querySelector('[data-act=\"tab:home\"]').click();}")
    pg.wait_for_timeout(800); pg.screenshot(path='/tmp/shots/71_celeb_win.png')
    for _ in range(4):
        if pg.query_selector('[data-act=m-cancel]'): pg.click('[data-act=m-cancel]'); pg.wait_for_timeout(150)
    pg.evaluate("""()=>{const G=SF.UI.G,c=G.coaches[0],club=G.clubs[c.club],S=G.summary; S.awards=S.awards.filter(a=>a.club!==club.id); S.prizes[club.id]=0; club.nextDiv=club.div+1; c.celeb=0; document.querySelector('[data-act=\"tab:home\"]').click();}""")
    pg.wait_for_timeout(600); pg.screenshot(path='/tmp/shots/72_celeb_sad.png')
    print(errs); b.close()
