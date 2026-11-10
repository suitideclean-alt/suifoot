# v0.6: wallet login through the Wallet Standard (mock wallet), save slot per address
from playwright.sync_api import sync_playwright
ok = lambda c, m: print(('OK   ' if c else 'FAIL ') + m)
errs = []
MOCK = """
(() => {
  const mk = (name, addr) => ({ name, icon: '', version: '1.0.0', chains: ['sui:testnet'], accounts: [],
    features: { 'standard:connect': { version: '1.0.0', connect: async function () { const a = { address: addr, chains: ['sui:testnet'], features: [] }; this.accounts = [a]; return { accounts: [a] }; } },
                'standard:disconnect': { version: '1.0.0', disconnect: async function () { } } } });
  const w = mk('MockSui', '0x' + 'ab'.repeat(32));
  window.addEventListener('wallet-standard:app-ready', (e) => e.detail.register(w));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: (api) => api.register(w) }));
})();
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    # no wallet installed
    pg = b.new_page(viewport={'width': 1100, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('suifoot.recap','0');localStorage.setItem('suifoot.lang','en')")
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500)
    ok(pg.locator('text=Connect Sui wallet').count() >= 1, 'setup shows the connect button')
    pg.click('button:has-text("Connect Sui wallet")'); pg.wait_for_timeout(300)
    ok('No Sui wallet found' in pg.inner_text('#modal'), 'no wallet installed: clear message')
    pg.close()
    # with a wallet
    ctx = b.new_context(viewport={'width': 1100, 'height': 900})
    ctx.add_init_script("localStorage.setItem('suifoot.recap','0');localStorage.setItem('suifoot.lang','en')")
    ctx.add_init_script(MOCK)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500)
    pg.click('button:has-text("Connect Sui wallet")'); pg.wait_for_timeout(300)
    pg.click('#modal >> text=MockSui'); pg.wait_for_timeout(500)
    ok(pg.locator('.pill.wl.on').count() >= 1 and '0xabab' in pg.inner_text('body'), 'connected: short address shown')
    pg.click('text=Start'); pg.wait_for_timeout(500)
    keys = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('suifoot.save'))")
    ok(any(k.endswith('0x' + 'ab' * 32) for k in keys), 'game saved under the wallet address: ' + str(keys))
    pg.reload(); pg.wait_for_timeout(800)
    ok(pg.locator('nav.tabs').count() == 1, 'after reload the wallet reconnects silently and the game is back')
    pg.click('.pill.wl.on'); pg.wait_for_timeout(300)
    pg.click('#modal >> text=Disconnect'); pg.wait_for_timeout(400)
    ok(pg.locator('nav.tabs').count() == 0 and pg.locator('text=Connect Sui wallet').count() >= 1, 'disconnect: back to the guest setup')
    ok(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), 'no horizontal scroll')
    pg.screenshot(path='/tmp/logos/b11_setup.png')
    b.close()
print('errors:', errs)
