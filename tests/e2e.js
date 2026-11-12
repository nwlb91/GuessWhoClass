/*
 * End-to-end test: a host and a guest in two separate browser contexts play a
 * full round through a local PeerJS server.
 *
 *   npm install --no-save peer playwright   (Playwright also needs a Chromium)
 *   node tests/e2e.js [screenshot-dir]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv[2] || null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function staticServer(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); console.log('  ✓ ' + msg); }

async function shot(page, name) {
  if (SHOTS) await page.waitForTimeout(700); // let flip/pop animations finish
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
}

(async () => {
  const peer = PeerServer({ port: 9000, path: '/', host: '127.0.0.1' });
  const web = await staticServer(8123);
  const base = 'http://127.0.0.1:8123/?peerhost=127.0.0.1&peerport=9000&peerpath=/';
  const browser = await chromium.launch();
  let failed = false;
  try {
    // Block web fonts so the test does not depend on the internet.
    const mkCtx = async (opts) => {
      const ctx = await browser.newContext(opts);
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      return ctx;
    };
    const hostCtx = await mkCtx({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 2 });
    const guestCtx = await mkCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    for (const [n, p] of [['host', host], ['guest', guest]]) {
      p.on('pageerror', (e) => { console.error(`[${n} pageerror]`, e.message); failed = true; });
      p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_FAILED/.test(m.text())) console.error(`[${n} console]`, m.text()); });
    }

    console.log('Host creates a game');
    await host.goto(base, { waitUntil: 'domcontentloaded' });
    await shot(host, '01-home');
    await host.fill('#name', 'Ms. Lee');
    await host.click('[data-action=host]');
    await host.waitForSelector('.lobby .status .pulse', { timeout: 15000 });
    const code = (await host.textContent('.code-big')).trim();
    assert(/^[A-Z2-9]{4}$/.test(code), `lobby shows a 4-character code (${code})`);
    assert(await host.$('.qr svg'), 'lobby shows a QR code');
    const joinLink = await host.inputValue('#join-link');
    assert(joinLink.includes('join=' + code), 'join link contains the code');
    await shot(host, '02-lobby');

    console.log('Student joins from the QR link');
    await guest.goto(joinLink, { waitUntil: 'domcontentloaded' });
    assert((await guest.inputValue('#join-code')) === code, 'join screen is pre-filled with the code');
    await guest.fill('#join-name', 'Sam');
    await guest.click('form[data-form=join] button[type=submit]');
    await guest.waitForSelector('#board .card', { timeout: 15000 });
    await host.waitForSelector('#board .card', { timeout: 15000 });
    assert((await host.textContent('.player.opp .pname')).includes('Sam'), 'host sees the student’s name');

    console.log('Both pick mystery people');
    await host.click('.card[data-id=hiro]');
    await host.click('[data-action=lock-in]');
    await guest.click('.card[data-id=grace]');
    await shot(guest, '03-guest-pick-mobile');
    await guest.click('[data-action=lock-in]');
    await guest.waitForSelector('.ask-box', { timeout: 10000 });
    assert(true, 'student goes first');
    await host.waitForSelector('.waiting-box');

    console.log('Student follows the halving strategy');
    const ask = async (page, qid) => {
      await page.click(`.chip[data-q="${qid}"]`);
    };
    const remaining = async (page) => Number((await page.textContent('.left-count b')).trim());

    await ask(guest, 'man');
    await guest.waitForSelector('.last-box');
    assert((await guest.textContent('.last-box .qa b')).trim() === 'Yes', 'auto answer: Hiro is a man');
    await guest.click('[data-action=auto-flip]');
    assert(await remaining(guest) === 12, 'auto-flip leaves 12 faces');

    // Host's turn: a typed question that the student answers.
    await host.waitForSelector('.ask-box', { timeout: 10000 });
    await host.fill('#custom-q', 'Is your person smiling?');
    await host.click('form[data-form=custom-q] button');
    await guest.waitForSelector('.answer-box', { timeout: 10000 });
    assert((await guest.textContent('.answer-box .question-quote')).includes('smiling'), 'student sees the typed question');
    await shot(guest, '04-guest-answer-mobile');
    await guest.click('.answer-box [data-yes="1"]');
    await host.waitForSelector('.last-box', { timeout: 10000 });
    assert((await host.textContent('.last-box .qa b')).trim() === 'Yes', 'host receives the typed answer');

    // Student follows the tree: man (yes) -> hat (no) -> beard (no) -> bald (no) -> Hiro
    const hostAsks = ['earrings', 'bow', 'hair-red'];
    for (const [i, qid] of ['hat', 'beard', 'bald'].entries()) {
      await guest.waitForSelector('.ask-box', { timeout: 10000 });
      await ask(guest, qid);
      await guest.waitForSelector(`.last-box`, { timeout: 10000 });
      await guest.waitForFunction((q) => document.querySelector('.last-box .qa span').textContent.toLowerCase().includes(q), qid);
      await guest.click('[data-action=auto-flip]');
      await host.waitForSelector('.ask-box', { timeout: 10000 });
      await ask(host, hostAsks[i]);
    }
    assert(await remaining(guest) === 1, 'student narrowed it down to 1 face');
    const standing = await guest.$$eval('#board .card:not(.down)', (els) => els.map((e) => e.dataset.id));
    assert(standing.length === 1 && standing[0] === 'hiro', 'the face left standing is Hiro');
    assert((await host.textContent('.player.opp .pstat')).includes('1 left'), 'host sees the student has 1 left');
    await shot(host, '05-host-play');
    await shot(guest, '06-guest-play-mobile');

    console.log('Reconnect: student reloads the page mid-game');
    guest.once('dialog', (d) => d.accept());
    await guest.reload({ waitUntil: 'domcontentloaded' });
    await guest.waitForSelector('.ask-box', { timeout: 20000 });
    assert(await remaining(guest) === 1, 'flips survive a reload');

    console.log('Reconnect: teacher reloads the page mid-game');
    host.once('dialog', (d) => d.accept());
    await host.reload({ waitUntil: 'domcontentloaded' });
    await host.waitForSelector('.waiting-box', { timeout: 30000 });
    await host.waitForFunction(() => !document.querySelector('.player.opp .offline'), null, { timeout: 30000 });
    assert(true, 'host resumes the same game and the student reconnects');
    await guest.waitForSelector('#conn-banner[hidden]', { state: 'attached', timeout: 30000 });

    console.log('Student makes the final guess');
    await guest.click('[data-action=start-guess]');
    await guest.click('.card[data-id=hiro]');
    await guest.click('.modal .btn.primary');
    await guest.waitForSelector('.over-card', { timeout: 10000 });
    await host.waitForSelector('.over-card', { timeout: 10000 });
    assert((await guest.textContent('#over-title')).includes('You found Hiro'), 'student wins');
    assert((await host.textContent('#over-title')).includes('Sam found Hiro first'), 'host sees the student won');
    assert((await guest.textContent('.verdict')).includes('Perfect halving'), 'perfect-halving message shown');
    await shot(guest, '07-guest-over-mobile');
    await shot(host, '08-host-over');

    console.log('Rematch');
    await host.click('[data-action=rematch]');
    await guest.waitForSelector('.pick-box', { timeout: 10000 });
    await host.waitForSelector('.pick-box', { timeout: 10000 });
    assert(await guest.$$eval('#board .card.down', (e) => e.length) === 0, 'new round starts with a fresh board');

    console.log('Hints mode');
    await host.check('#top-actions input[data-action=toggle-hints]', { force: true });
    await host.click('.card[data-id=mei]');
    await host.click('[data-action=lock-in]');
    await guest.click('.card[data-id=kofi]');
    await guest.click('[data-action=lock-in]');
    await host.waitForSelector('.ask-box', { timeout: 10000 });
    assert((await host.textContent('.chip.best')).includes('Man?'), 'hint stars "Man?" as the best first question');
    assert((await host.textContent('.chip.best .split')).trim() === '12|12', 'hint shows the 12|12 split');
    await shot(host, '09-host-hints');
    await ask(host, 'man');                                   // guest has Kofi: a man
    await host.click('[data-action=auto-flip]');
    await guest.waitForSelector('.ask-box', { timeout: 10000 });
    assert(await guest.$$eval('.ask-box .split, .ask-box .chip.best, .hint-line', (e) => e.length) === 0,
      'the student sees no hints (no splits, no star, no tip)');
    await shot(guest, '09b-guest-no-hints-mobile');
    await ask(guest, 'man');                                  // host has Mei
    await host.waitForSelector('.ask-box .chip.best', { timeout: 10000 });
    assert((await host.getAttribute('.chip.best', 'data-q')) === 'hat', 'after "man? yes" the hint is "Hat?"');
    await ask(host, 'hat');
    await host.click('[data-action=auto-flip]');
    await guest.waitForSelector('.ask-box', { timeout: 10000 });
    await ask(guest, 'earrings');
    await host.waitForSelector('.ask-box .chip.best', { timeout: 10000 });
    assert((await host.getAttribute('.chip.best', 'data-q')) === 'beard', 'after "hat? no" the hint changes to "Beard?"');

    console.log('Confirm answers + auto-flip');
    // The student has answers "man? no" and "earrings? no" but hasn't flipped anything this round.
    assert(await remaining(guest) === 24, 'student has not flipped any faces yet');
    await host.click('[data-action=menu]');
    await host.check('.modal input[data-action=toggle-confirm]', { force: true });
    await host.check('.modal input[data-action=toggle-autoflip]', { force: true });
    await host.click('.modal .btn.primary');                  // Close
    await guest.waitForFunction(() => /^6$/.test(document.querySelector('.left-count b').textContent.trim()), null, { timeout: 10000 });
    assert(true, 'turning auto-flip on tidies the student’s board straight away (24 → 6)');
    await ask(host, 'beard');                                 // Kofi has no beard
    await guest.waitForSelector('#answer-box .true-answer', { timeout: 10000 });
    assert((await guest.textContent('#answer-box .true-answer')).trim() === 'NO', 'student sees the true answer (NO) to confirm');
    assert(await guest.$$eval('#answer-box button', (b) => b.length) === 1, 'only the true answer can be sent');
    assert(await host.$('.waiting-box'), 'host waits for the student to confirm');
    await shot(guest, '10b-guest-confirm-mobile');
    await guest.click('#answer-box [data-action=answer]');
    await host.waitForFunction(() => /beard/i.test(document.querySelector('.last-box .qa span').textContent), null, { timeout: 10000 });
    assert((await host.textContent('.last-box .qa b')).trim() === 'No', 'host receives the confirmed answer');
    await host.waitForFunction(() => document.querySelector('.left-count b').textContent.trim() === '3', null, { timeout: 10000 });
    const hostLeft = await host.$$eval('#board .card:not(.down)', (els) => els.map((e) => e.dataset.id).sort());
    assert(hostLeft.join(',') === 'hiro,kofi,tariq', 'host’s board auto-flips to the 3 who match (Hiro, Kofi, Tariq)');
    await guest.waitForSelector('.ask-box', { timeout: 10000 });
    await ask(guest, 'bow');                                  // Mei has a bow
    await host.waitForSelector('#answer-box .true-answer', { timeout: 10000 });
    await shot(host, '10c-host-confirm');
    await host.click('#answer-box [data-action=answer]');
    await guest.waitForFunction(() => /bow/i.test(document.querySelector('.last-box .qa span').textContent), null, { timeout: 10000 });
    assert((await guest.textContent('.last-box .qa b')).trim() === 'Yes', 'student receives the host’s confirmed answer');
    await guest.waitForFunction(() => document.querySelector('.left-count b').textContent.trim() === '3', null, { timeout: 10000 });
    assert(true, 'student’s board auto-flips after the answer (6 → 3)');

    console.log('Host ends the game');
    await host.click('[data-action=menu]');
    await host.click('.modal .btn.danger');
    await host.click('.modal .btn.danger');
    await guest.waitForSelector('text=Game closed', { timeout: 10000 });
    assert((await guest.textContent('.sheet p')).includes('ended the game'), 'student is told the host ended the game');

    console.log('Solo practice');
    const solo = await hostCtx.newPage();
    await solo.goto(base.replace('?', '?solo=1&'), { waitUntil: 'domcontentloaded' });
    // a new tab in the same context resumes nothing (sessionStorage is per tab)
    await solo.click('[data-action=solo]');
    await solo.waitForSelector('.ask-box');
    await solo.check('#top-actions input[data-action=toggle-hints]', { force: true });
    let asked = 0;
    while (await solo.$('.chip.best') && asked < 6) {
      const best = await solo.getAttribute('.chip.best', 'data-q');
      await solo.click(`.chip[data-q="${best}"]`);
      await solo.click('[data-action=auto-flip]');
      asked++;
    }
    const soloLeft = await solo.$$eval('#board .card:not(.down)', (els) => els.map((e) => e.dataset.id));
    assert(soloLeft.length === 1 && asked <= 5, `following the hints finds the computer’s person in ${asked} questions`);
    await solo.click('[data-action=start-guess]');
    await solo.click(`.card[data-id=${soloLeft[0]}]`);
    await solo.click('.modal .btn.primary');
    await solo.waitForSelector('.over-card');
    assert((await solo.textContent('.verdict')).includes('Perfect halving'), 'solo: perfect halving');
    await shot(solo, '10-solo-over');

    console.log('\nAll end-to-end checks passed.');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await browser.close();
    web.close();
    peer.close && peer.close();
    process.exit(failed ? 1 : 0);
  }
})();
