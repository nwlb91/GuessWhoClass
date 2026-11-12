/* Who's Hiding? — screens, controls and the glue between the game rules and the network. */
(function () {
  'use strict';

  const { data, avatar, game, net } = window.WH;
  const PROTO = 1;
  const TOTAL = data.BOARD.length;

  // ------------------------------------------------------------------ helpers
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $all = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ESC[ch]);
  const nameOf = (id) => (data.BY_ID[id] ? data.BY_ID[id].name : '?');
  const yesNo = (b) => (b ? 'Yes' : 'No');

  const store = {
    get(area, key) { try { const v = window[area].getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(area, key, val) { try { window[area].setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ } },
    del(area, key) { try { window[area].removeItem(key); } catch (e) { /* storage unavailable */ } }
  };
  const LS = 'localStorage';
  const SS = 'sessionStorage';

  function savedName() { return store.get(LS, 'wh-name') || ''; }
  function saveName(n) { store.set(LS, 'wh-name', n); }

  function clientId() {
    let id = store.get(SS, 'wh-client');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      store.set(SS, 'wh-client', id);
    }
    return id;
  }

  function baseUrl() { return location.origin + location.pathname; }
  function prettyBaseUrl() { return baseUrl().replace(/^https?:\/\//, '').replace(/\/index\.html$/, '/').replace(/\/$/, ''); }

  function cleanUrl() {
    const q = new URLSearchParams(location.search);
    q.delete('join');
    const s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }

  // ------------------------------------------------------------------ ui state
  const ui = {
    overHidden: null,      // round whose results overlay the player closed
    draftQuestion: '',
    screen: 'home',        // home | join | host | guest | solo | ended
    view: null,            // what this player can see of the game
    selected: null,        // card chosen (not yet locked in) during the pick phase
    guessMode: false,
    flipped: new Set(),    // this player's face-down cards (kept locally so taps feel instant)
    flippedKey: null,
    hostReady: false,
    hostError: null,
    guestStatus: null,
    guestDetail: null,
    joinCode: '',
    joinError: '',
    endedMessage: '',
    soloHints: false
  };
  let session = null;      // { role: 'host'|'guest'|'solo', code, state, link, guestClientId }

  // ------------------------------------------------------------------ toast + modal
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function modal({ title, html, actions, wide }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${title}</h2><div class="modal-body">${html || ''}</div>
      <div class="modal-actions"></div></div>`;
    const row = $('.modal-actions', wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    (actions || [{ label: 'Close', cls: 'primary' }]).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || 'ghost');
      b.textContent = a.label;
      b.addEventListener('click', () => { close(); a.onClick && a.onClick(); });
      row.appendChild(b);
    });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    const first = $('.modal-actions .btn', wrap);
    first && first.focus();
    return close;
  }

  function showHowTo() {
    modal({
      title: 'How to play',
      wide: true,
      html: `<ol class="howto">
        <li><b>Pick a mystery person.</b> Each player secretly chooses one of the 16 faces.</li>
        <li><b>Take turns asking yes/no questions</b> about the other player's mystery person. Tap a question from the list
          (the game answers it automatically) or type your own (the other player answers it).</li>
        <li><b>Flip down faces that don't match the answer.</b> Tap a face to flip it, or use the
          <i>Flip them down for me</i> button.</li>
        <li><b>Make a final guess</b> on your turn when you know who it is. Right? You win. Wrong? You lose the round!</li>
      </ol>
      <p class="challenge">🧠 <b>Challenge:</b> there are 16 people. Can you always find the mystery person with just
      <b>4</b> questions? Hint: try to pick questions where about half the faces would flip down — whatever the answer is.</p>`
    });
  }

  // ------------------------------------------------------------------ sessions
  function startHost(name, resume) {
    const code = resume ? resume.code : net.makeCode();
    const state = resume ? resume.state : game.create({ hostName: name || 'Teacher', hints: false });
    session = { role: 'host', code, state, link: null, guestClientId: resume ? resume.guestClientId : null };
    ui.hostReady = false;
    ui.hostError = null;
    ui.screen = 'host';
    if (resume && state.players.guest.connected) {
      session.state = game.apply(state, 'guest', { type: 'connection', connected: false }).state;
    }
    connectHost(!!resume);
    setHostState(session.state);
  }

  function connectHost(resuming) {
    const s = session;
    const link = new net.HostLink(s.code, {
      resuming,
      onOpen() { if (session !== s) return; ui.hostReady = true; ui.hostError = null; render(); },
      onError(msg, fatal) { if (session !== s) return; ui.hostError = msg; if (fatal) ui.hostReady = false; render(); },
      onCodeTaken() { if (session !== s) return;
        // Someone else has this code: pick a fresh one (only possible before anyone joined).
        link.destroy();
        s.code = net.makeCode();
        connectHost(false);
        persistHost();
        render();
      },
      onGuestHello(msg) { if (session !== s) return 'This game has ended.';
        if (msg.proto !== PROTO) return 'This game is running a different version. Ask the host to refresh their page.';
        const st = s.state;
        if (st.phase === 'lobby' || !st.players.guest.connected) return 'ok';
        if (msg.clientId && msg.clientId === s.guestClientId) return 'ok';
        return `This game already has two players. Ask ${st.players.host.name} for a new code.`;
      },
      onGuestJoined(msg) { if (session !== s) return;
        const wasLobby = s.state.phase === 'lobby';
        s.guestClientId = msg.clientId || null;
        const r = game.apply(s.state, 'guest', { type: 'join', name: msg.name });
        if (!r.error) {
          setHostState(r.state);
          if (wasLobby) toast(`${r.state.players.guest.name} joined!`);
        }
        sendGuestView();
      },
      onGuestStatus(up) { if (session !== s) return;
        const r = game.apply(s.state, 'guest', { type: 'connection', connected: up });
        if (!r.error) setHostState(r.state);
        if (!up && s.state.phase !== 'lobby') toast(`${s.state.players.guest.name || 'Your opponent'} lost connection`);
      },
      onGuestAction(action) { if (session !== s) return;
        const allowed = ['pick', 'ask', 'answer', 'flip', 'guess', 'rematch'];
        if (!action || allowed.indexOf(action.type) < 0) return;
        const r = game.apply(s.state, 'guest', action);
        if (r.error) { link.send({ t: 'error', message: r.error }); return; }
        setHostState(r.state);
      }
    });
    s.link = link;
    link.start();
  }

  function persistHost() {
    if (session && session.role === 'host') {
      store.set(SS, 'wh-host', { code: session.code, state: session.state, guestClientId: session.guestClientId });
    }
  }

  function sendGuestView() {
    if (session && session.role === 'host' && session.link) {
      session.link.send({ t: 'view', view: game.viewFor(session.state, 'guest') });
    }
  }

  function setHostState(state) {
    if (!session) return;
    session.state = state;
    persistHost();
    sendGuestView();
    receiveView(game.viewFor(state, 'host'));
  }

  function startSolo(name) {
    session = { role: 'solo', state: game.create({ solo: true, hostName: name || 'You' }) };
    ui.screen = 'solo';
    ui.view = null;
    setHostState(session.state);
  }

  function startGuest(code, name) {
    const id = clientId();
    store.set(SS, 'wh-guest', { code, name });
    ui.screen = 'guest';
    ui.view = null;
    ui.guestStatus = 'connecting';
    ui.guestDetail = null;
    const link = new net.GuestLink(code, { proto: PROTO, name, clientId: id }, {
      onStatus(status, detail) {
        const prev = ui.guestStatus;
        ui.guestStatus = status;
        ui.guestDetail = detail || null;
        if (status === 'notfound') {
          link.destroy();
          store.del(SS, 'wh-guest');
          session = null;
          ui.screen = 'join';
          ui.joinCode = code;
          ui.joinError = `No game found with code ${code}. Check the code, and make sure the host still has the game open.`;
        } else if (status === 'rejected') {
          link.destroy();
          store.del(SS, 'wh-guest');
          session = null;
          ui.screen = 'ended';
          ui.endedMessage = detail || 'The host closed this game.';
        } else if (status === 'connected' && prev === 'reconnecting') {
          toast('Reconnected!');
        }
        render();
      },
      onMessage(msg) {
        if (msg.t === 'view') receiveView(msg.view);
        else if (msg.t === 'error') toast(msg.message);
      }
    });
    session = { role: 'guest', code, link };
    link.start();
    render();
  }

  function leave() {
    if (session && session.link) {
      const link = session.link;
      if (session.role === 'host') {
        link.send({ t: 'reject', reason: `${session.state.players.host.name} ended the game. Thanks for playing!` });
        setTimeout(() => link.destroy(), 400); // give the goodbye message a moment to arrive
      } else {
        link.destroy();
      }
    }
    session = null;
    store.del(SS, 'wh-host');
    store.del(SS, 'wh-guest');
    ui.view = null;
    ui.screen = 'home';
    ui.guessMode = false;
    ui.selected = null;
    cleanUrl();
    document.title = baseTitle;
    render();
  }

  function confirmLeave() {
    const playing = ui.view && (ui.view.phase === 'play' || ui.view.phase === 'pick');
    if (!playing || ui.screen === 'solo') return leave();
    modal({
      title: 'Leave this game?',
      html: session && session.role === 'host'
        ? '<p>The game will end for your student too.</p>'
        : '<p>You can rejoin later with the same code if the host still has the game open.</p>',
      actions: [{ label: 'Stay', cls: 'ghost' }, { label: 'Leave game', cls: 'danger', onClick: leave }]
    });
  }

  function inviteNewStudent() {
    modal({
      title: 'Invite a different student?',
      html: `<p>This ends the current game and opens the code <b>${esc(session.code)}</b> for someone new.</p>`,
      actions: [{ label: 'Cancel', cls: 'ghost' }, {
        label: 'New student', cls: 'primary', onClick() {
          session.link.send({ t: 'reject', reason: `${session.state.players.host.name} started a new game. Thanks for playing!` });
          const hints = session.state.settings.hints;
          const hostName = session.state.players.host.name;
          setTimeout(() => {
            if (session.link && session.link.conn) { try { session.link.conn.close(); } catch (e) { /* ignore */ } }
          }, 400);
          session.guestClientId = null;
          setHostState(game.create({ hostName, hints }));
        }
      }]
    });
  }

  // ------------------------------------------------------------------ actions
  function dispatch(action) {
    if (!session) return;
    if (action.type === 'flip') {
      const ids = action.ids || [action.id];
      ids.forEach((id) => (action.down ? ui.flipped.add(id) : ui.flipped.delete(id)));
      saveFlips();
      if (session.role === 'guest') { updateBoard(); updateBoardHead(); renderSide(); }
    }
    if (session.role === 'guest') {
      if (!session.link.send({ t: 'action', action })) toast('Not connected right now — reconnecting…');
      return;
    }
    const seat = 'host';
    const r = game.apply(session.state, seat, action);
    if (r.error) { toast(r.error); return; }
    setHostState(r.state);
  }

  function flipsKey(v) {
    return `${v.id}:${v.round}:${v.mySeat}`;
  }
  function saveFlips() {
    if (ui.view) store.set(SS, 'wh-flips', { key: ui.flippedKey, ids: Array.from(ui.flipped) });
  }
  function syncFlips(v) {
    const key = flipsKey(v);
    if (ui.flippedKey === key) return;
    ui.flippedKey = key;
    const saved = store.get(SS, 'wh-flips');
    const ids = saved && saved.key === key ? saved.ids : v.me.flipped;
    ui.flipped = new Set(v.phase === 'play' || v.phase === 'over' ? ids : []);
  }

  // ------------------------------------------------------------------ incoming views
  const baseTitle = document.title;

  function receiveView(v) {
    const prev = ui.view;
    ui.view = v;
    syncFlips(v);
    if (v.phase !== 'play') ui.guessMode = false;
    if (v.phase !== 'pick') ui.selected = null;
    notify(prev, v);
    render();
  }

  function notify(prev, v) {
    const opp = v.opp.name || 'Your opponent';
    const myTurn = v.phase === 'play' && v.turn === v.mySeat && !v.pending;
    document.title = (myTurn ? '● Your turn — ' : '') + baseTitle;
    if (!prev || prev.round !== v.round) return;
    const fresh = v.log.slice(prev.log.length);
    let msg = null;
    fresh.forEach((e) => {
      if (e.kind !== 'q') return;
      if (e.seat === v.mySeat) msg = `${opp} says ${yesNo(e.yes).toUpperCase()}`;
      else if (!v.solo) msg = `Your turn! (${opp} asked “${e.qid ? data.Q_BY_ID[e.qid].label : 'their question'}” → ${yesNo(e.yes)})`;
    });
    if (!msg && v.pending && !prev.pending && v.pending.seat !== v.mySeat) msg = `${opp} asked you a question — answer it on the right`;
    if (!msg && prev.phase === 'pick' && v.phase === 'play') msg = v.turn === v.mySeat ? 'Game on — you go first!' : `Game on — ${opp} goes first`;
    if (msg) toast(msg);
  }

  // ------------------------------------------------------------------ rendering
  function render() {
    const app = $('#app');
    app.dataset.screen = ui.screen;
    switch (ui.screen) {
      case 'home': return renderHome(app);
      case 'join': return renderJoin(app);
      case 'ended': return renderEnded(app);
      case 'host':
        if (!ui.view || ui.view.phase === 'lobby') return renderLobby(app);
        return renderGame(app);
      case 'guest':
        if (!ui.view) return renderConnecting(app);
        return renderGame(app);
      case 'solo':
        return renderGame(app);
      default:
        return renderHome(app);
    }
  }

  function heroFaces(ids) {
    return ids.map((id) => `<span class="hero-face">${avatar.svg(data.BY_ID[id], { title: false })}</span>`).join('');
  }

  function renderHome(app) {
    app.innerHTML = `
      <main class="home">
        <header class="hero">
          <div class="hero-faces" aria-hidden="true">${heroFaces(['imani', 'nate', 'lucia', 'arjun', 'mei', 'felix'])}</div>
          <h1 class="logo">Who’s <span>Hiding?</span></h1>
          <p class="tagline">16 faces. 1 mystery person. Yes-or-no questions only.<br>How few questions do you need?</p>
        </header>
        <section class="home-card">
          <label class="field"><span>Your name</span>
            <input id="name" maxlength="20" autocomplete="nickname" placeholder="e.g. Ms. Rivera or Sam" value="${esc(savedName())}"></label>
          <div class="home-actions">
            <button class="btn primary big" data-action="host">
              <span class="btn-title">Host a game</span><span class="btn-sub">Get a code + QR code for a student</span></button>
            <form class="join-inline" data-form="join-home">
              <label for="home-code">Have a code?</label>
              <div class="join-row">
                <input id="home-code" class="code-input" maxlength="${net.CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD">
                <button class="btn secondary" type="submit">Join</button>
              </div>
            </form>
            <button class="btn ghost" data-action="solo">Practice on my own</button>
          </div>
          <p class="form-error" id="home-error" role="alert"></p>
        </section>
        <footer class="home-links">
          <button class="link" data-action="howto">How to play</button>
          <span aria-hidden="true">·</span>
          <a class="link" href="guide.html">Teacher guide <small>(strategy spoilers!)</small></a>
        </footer>
      </main>`;
  }

  function renderJoin(app) {
    app.innerHTML = `
      <main class="center-screen">
        <form class="sheet" data-form="join">
          <div class="hero-faces small" aria-hidden="true">${heroFaces(['dara', 'hiro', 'priya', 'kofi'])}</div>
          <h1>Join a game</h1>
          <label class="field"><span>Game code</span>
            <input id="join-code" class="code-input" maxlength="${net.CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(ui.joinCode)}"></label>
          <label class="field"><span>Your name</span>
            <input id="join-name" maxlength="20" autocomplete="nickname" placeholder="Type your name" value="${esc(savedName())}"></label>
          <button class="btn primary big" type="submit">Join game</button>
          <p class="form-error" role="alert">${esc(ui.joinError)}</p>
          <button class="link" type="button" data-action="home">← Back</button>
        </form>
      </main>`;
    const target = ui.joinCode ? $('#join-name') : $('#join-code');
    if (target && !target.value) target.focus();
  }

  function renderConnecting(app) {
    const st = ui.guestStatus;
    const msg = st === 'error' ? (ui.guestDetail || 'Something went wrong.') :
      st === 'reconnecting' ? 'Reconnecting…' : `Connecting to game ${esc(session ? session.code : '')}…`;
    app.innerHTML = `
      <main class="center-screen">
        <div class="sheet center">
          <div class="spinner" aria-hidden="true"></div>
          <h1>${msg}</h1>
          ${ui.guestDetail && st !== 'error' ? `<p class="muted">${esc(ui.guestDetail)}</p>` : ''}
          <button class="link" data-action="leave">Cancel</button>
        </div>
      </main>`;
  }

  function renderEnded(app) {
    app.innerHTML = `
      <main class="center-screen">
        <div class="sheet center">
          <h1>Game closed</h1>
          <p>${esc(ui.endedMessage)}</p>
          <button class="btn primary" data-action="home">Back to start</button>
        </div>
      </main>`;
  }

  function qrSvg(text) {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: 'QR code to join the game' });
    } catch (e) {
      return '<p class="muted">QR code unavailable</p>';
    }
  }

  function renderLobby(app) {
    const s = session;
    const url = net.joinUrl(s.code);
    const status = ui.hostError
      ? `<span class="status warn">⚠️ ${esc(ui.hostError)}</span>`
      : ui.hostReady
        ? '<span class="status"><span class="pulse"></span>Waiting for a student to join…</span>'
        : '<span class="status"><span class="spinner tiny"></span>Setting up the game…</span>';
    const existing = $('.lobby[data-code]', app);
    if (existing && existing.dataset.code === s.code) {
      $('#lobby-status', app).innerHTML = status;
      $('#hints-toggle', app).checked = s.state.settings.hints;
      return;
    }
    app.innerHTML = `
      <main class="lobby" data-code="${esc(s.code)}">
        <div class="lobby-card">
          <p class="eyebrow">Invite a student</p>
          <h1>Scan the QR code or enter the code</h1>
          <div class="lobby-grid">
            <div class="qr">${qrSvg(url)}</div>
            <div class="code-block">
              <div class="code-label">Game code</div>
              <div class="code-big" aria-label="Game code ${esc(s.code.split('').join(' '))}">${esc(s.code)}</div>
              <p class="lobby-help">On another device, go to<br><b class="url">${esc(prettyBaseUrl())}</b><br>and type the code.</p>
              <div class="link-row">
                <input readonly value="${esc(url)}" aria-label="Join link" id="join-link">
                <button class="btn secondary small" data-action="copy-link">Copy link</button>
              </div>
            </div>
          </div>
          <div class="lobby-status" id="lobby-status" aria-live="polite">${status}</div>
          <label class="toggle">
            <input type="checkbox" id="hints-toggle" data-action="toggle-hints" ${s.state.settings.hints ? 'checked' : ''}>
            <span class="toggle-ui" aria-hidden="true"></span>
            <span><b>Strategy hints</b><br><small>Show how each question would split the faces that are left, and star the best one.</small></span>
          </label>
          <div class="lobby-actions">
            <button class="link" data-action="howto">How to play</button>
            <button class="link" data-action="leave">Cancel</button>
          </div>
        </div>
      </main>`;
  }

  // ---------- game screen ----------
  function renderGame(app) {
    let root = $('#game', app);
    if (!root) {
      app.innerHTML = `
        <div class="game" id="game">
          <header class="topbar">
            <div class="brand">Who’s <span>Hiding?</span></div>
            <div class="scoreboard" id="scoreboard"></div>
            <div class="top-actions" id="top-actions"></div>
          </header>
          <div class="conn-banner" id="conn-banner" hidden></div>
          <div class="game-main">
            <section class="board-area">
              <div class="board-head" id="board-head"></div>
              <div class="board" id="board"></div>
            </section>
            <aside class="side" id="side"></aside>
          </div>
          <div class="over-backdrop" id="over" hidden></div>
        </div>`;
      root = $('#game', app);
      buildBoard();
    }
    renderTopbar();
    renderConnBanner();
    updateBoardHead();
    updateBoard();
    renderSide();
    renderOver();
  }

  function hintsOn(v) { return v.solo ? ui.soloHints : !!v.settings.hints; }

  function renderTopbar() {
    const v = ui.view;
    const me = v.me, opp = v.opp;
    const turnLabel = v.phase === 'play'
      ? (v.pending ? (v.pending.seat === v.mySeat ? `${esc(opp.name)} is answering…` : 'Answer the question!')
        : v.turn === v.mySeat ? 'Your turn' : `${esc(opp.name)}’s turn`)
      : v.phase === 'pick' ? 'Picking…' : v.phase === 'over' ? 'Round over' : '';
    const myTurn = v.phase === 'play' && ((v.turn === v.mySeat && !v.pending) || (v.pending && v.pending.seat !== v.mySeat));
    const left = TOTAL - ui.flipped.size;
    $('#scoreboard').innerHTML = `
      <div class="player me ${v.phase === 'play' && v.turn === v.mySeat ? 'active' : ''}">
        <span class="pname">${esc(me.name)} <small>(you)</small></span>
        ${v.phase === 'play' || v.phase === 'over' ? `<span class="pstat">${left} left · ${me.asked} asked</span>` : ''}
      </div>
      <div class="turn-pill ${myTurn ? 'mine' : ''}">${turnLabel}</div>
      <div class="player opp ${v.phase === 'play' && v.turn !== v.mySeat ? 'active' : ''}">
        <span class="pname">${esc(opp.name || '…')}${!v.solo && !opp.connected ? ' <small class="offline">(offline)</small>' : ''}</span>
        ${(v.phase === 'play' || v.phase === 'over') && !v.solo ? `<span class="pstat">${opp.remaining} left · ${opp.asked} asked</span>` : ''}
      </div>`;

    const role = session.role;
    let actions = '';
    if (role === 'host') {
      actions += `<button class="pill-btn code" data-action="show-invite" title="Show the invite code and QR again">Code <b>${esc(session.code)}</b></button>`;
      actions += hintsSwitch(v.settings.hints);
    } else if (role === 'solo') {
      actions += hintsSwitch(ui.soloHints);
    }
    actions += `<button class="pill-btn" data-action="menu" aria-label="Menu">☰</button>`;
    $('#top-actions').innerHTML = actions;
  }

  function hintsSwitch(on) {
    return `<label class="mini-toggle" title="Strategy hints"><input type="checkbox" data-action="toggle-hints" ${on ? 'checked' : ''}>
      <span class="toggle-ui" aria-hidden="true"></span><span>Hints</span></label>`;
  }

  function renderConnBanner() {
    const el = $('#conn-banner');
    const v = ui.view;
    let msg = '';
    if (session.role === 'guest' && ui.guestStatus && ui.guestStatus !== 'connected') {
      msg = 'Connection lost — reconnecting… Keep this page open.';
    } else if (session.role === 'host' && !v.opp.connected && v.phase !== 'lobby') {
      msg = `${esc(v.opp.name || 'Your student')} is offline. They can rejoin with code <b>${esc(session.code)}</b>.`;
    } else if (session.role === 'host' && ui.hostError) {
      msg = esc(ui.hostError);
    }
    el.innerHTML = msg;
    el.hidden = !msg;
  }

  function buildBoard() {
    $('#board').innerHTML = data.BOARD.map((c) => `
      <button class="card" type="button" data-id="${c.id}">
        <span class="card-inner">
          <span class="card-face card-front">${avatar.svg(c, { title: false })}<span class="card-name">${esc(c.name)}</span></span>
          <span class="card-face card-back" aria-hidden="true"><span class="card-back-mark">?</span><span class="card-name">${esc(c.name)}</span></span>
        </span>
      </button>`).join('');
  }

  function updateBoard() {
    const v = ui.view;
    const playing = v.phase === 'play' || v.phase === 'over';
    $all('#board .card').forEach((el) => {
      const id = el.dataset.id;
      const down = playing && ui.flipped.has(id);
      const chosen = v.phase === 'pick' && (v.me.secret ? v.me.secret === id : ui.selected === id);
      el.classList.toggle('down', down);
      el.classList.toggle('selected', chosen);
      el.classList.toggle('dim', v.phase === 'pick' && !!v.me.secret && v.me.secret !== id);
      el.classList.toggle('guessable', ui.guessMode && !down);
      el.disabled = v.phase === 'over' || (v.phase === 'pick' && !!v.me.secret) || (ui.guessMode && down);
      el.setAttribute('aria-pressed', v.phase === 'pick' ? String(chosen) : String(down));
      el.setAttribute('aria-label', nameOf(id) + (down ? ', flipped down' : ''));
    });
    $('#board').classList.toggle('guess-mode', ui.guessMode);
  }

  function updateBoardHead() {
    const v = ui.view;
    const el = $('#board-head');
    const opp = esc(v.opp.name || 'your opponent');
    if (v.phase === 'pick') {
      el.innerHTML = v.me.secret
        ? `<h2>Your mystery person is <b>${esc(nameOf(v.me.secret))}</b></h2><p class="muted">${v.opp.ready ? 'Starting…' : `Waiting for ${opp} to choose…`}</p>`
        : `<h2>Choose your mystery person</h2><p class="muted">${opp} will try to figure out who it is.</p>`;
      return;
    }
    const left = TOTAL - ui.flipped.size;
    if (ui.guessMode) {
      el.innerHTML = `<h2 class="guess-title">🎯 Tap the person you think it is</h2>
        <button class="btn ghost small" data-action="cancel-guess">Cancel</button>`;
      return;
    }
    el.innerHTML = `<h2>Who is ${v.solo ? 'the computer' : opp}’s mystery person?</h2>
      <div class="left-meter" title="Faces still standing on your board">
        <span class="left-count"><b>${left}</b> of ${TOTAL} still standing</span>
        <span class="meter"><span style="width:${(left / TOTAL) * 100}%"></span></span>
      </div>
      ${v.phase === 'play' ? '<p class="muted tap-tip">Tap a face to flip it down (or back up).</p>' : ''}
      ${v.phase === 'over' && ui.overHidden ? '<button class="btn primary small" data-action="show-over">Show results</button>' : ''}`;
  }

  function myAnswers(v) { return game.answersFor(v, v.mySeat); }

  function renderSide() {
    const v = ui.view;
    const side = $('#side');
    const parts = [];
    if (v.phase === 'pick') parts.push(pickPanel(v));
    if (v.phase === 'play' || v.phase === 'over') {
      if (v.me.secret && !v.solo) parts.push(secretBox(v));
      parts.push(actionPanel(v));
    }
    parts.push(logPanel(v));
    const active = document.activeElement;
    const hadFocus = active && active.id === 'custom-q';
    const caret = hadFocus ? active.selectionStart : null;
    side.innerHTML = parts.join('');
    const input = $('#custom-q', side);
    if (input && ui.draftQuestion) input.value = ui.draftQuestion;
    if (input && hadFocus) { input.focus(); try { input.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
  }

  function secretBox(v) {
    const c = data.BY_ID[v.me.secret];
    return `<div class="box secret-box">
      <div class="mini-card">${avatar.svg(c, { title: false })}</div>
      <div><div class="eyebrow">Your mystery person</div><div class="secret-name">${esc(c.name)}</div>
      <div class="muted small">${esc(v.opp.name)} is trying to find them.</div></div>
    </div>`;
  }

  function pickPanel(v) {
    if (v.me.secret) {
      return `<div class="box">
        <h3>Locked in ✔</h3>
        <p>${v.opp.ready ? 'Both players are ready!' : `Waiting for <b>${esc(v.opp.name)}</b> to choose a mystery person…`}</p>
        ${v.opp.ready ? '' : '<div class="spinner small" aria-hidden="true"></div>'}
      </div>`;
    }
    const sel = ui.selected ? data.BY_ID[ui.selected] : null;
    return `<div class="box pick-box">
      <h3>Pick your mystery person</h3>
      <p class="muted">Tap a face on the board, then lock it in. Keep it secret!</p>
      ${sel ? `<div class="pick-preview"><div class="mini-card">${avatar.svg(sel, { title: false })}</div><b>${esc(sel.name)}</b></div>` : ''}
      <div class="row">
        <button class="btn primary" data-action="lock-in" ${sel ? '' : 'disabled'}>Lock in${sel ? ' ' + esc(sel.name) : ''}</button>
        <button class="btn ghost" data-action="random-pick">🎲 Pick for me</button>
      </div>
      <p class="muted small">${v.opp.ready ? `${esc(v.opp.name)} has already chosen.` : ''}</p>
    </div>`;
  }

  function actionPanel(v) {
    const opp = esc(v.opp.name);
    const out = [];
    if (v.phase === 'play') {
      if (v.pending && v.pending.seat !== v.mySeat) {
        const c = data.BY_ID[v.me.secret];
        out.push(`<div class="box answer-box">
          <div class="eyebrow">${opp} asks</div>
          <p class="question-quote">“${esc(v.pending.text)}”</p>
          <div class="answer-help"><div class="mini-card">${avatar.svg(c, { title: false })}</div>
            <span>Look at your mystery person, <b>${esc(c.name)}</b>, and answer honestly.</span></div>
          <div class="row">
            <button class="btn yes big" data-action="answer" data-yes="1">Yes</button>
            <button class="btn no big" data-action="answer" data-yes="0">No</button>
          </div>
        </div>`);
      } else if (v.pending) {
        out.push(`<div class="box waiting-box"><div class="spinner small" aria-hidden="true"></div>
          <p>Waiting for ${opp} to answer:<br><span class="question-quote">“${esc(v.pending.text)}”</span></p></div>`);
      }
    }
    out.push(lastAnswerBox(v));
    if (v.phase === 'play' && !v.pending) {
      if (v.turn === v.mySeat) out.push(askPanel(v));
      else out.push(`<div class="box waiting-box"><div class="spinner small" aria-hidden="true"></div>
        <p><b>${opp}</b> is choosing a question…<br><span class="muted small">You can flip your faces while you wait.</span></p></div>`);
    }
    return out.join('');
  }

  function toFlipIds(v) {
    const alive = new Set(data.candidates(myAnswers(v)));
    return data.BOARD.map((c) => c.id).filter((id) => !alive.has(id) && !ui.flipped.has(id));
  }

  function lastAnswerBox(v) {
    let last = null;
    for (let i = v.log.length - 1; i >= 0; i--) {
      const e = v.log[i];
      if (e.seat === v.mySeat && e.kind === 'q') { last = e; break; }
    }
    if (!last || v.phase !== 'play') return '';
    const flipIds = toFlipIds(v);
    const left = TOTAL - ui.flipped.size;
    let action = '';
    if (last.qid) {
      action = flipIds.length
        ? `<button class="btn secondary" data-action="auto-flip">Flip down the ${flipIds.length} who don’t match</button>`
        : '<p class="ok small">✔ Your board matches every answer so far.</p>';
    } else {
      action = `<p class="muted small">This was a typed question — flip the faces yourself.</p>`;
    }
    const lastOne = left === 1 && flipIds.length === 0 && v.turn === v.mySeat && !v.pending
      ? `<p class="nudge">Only one face left — make your final guess!</p>` : '';
    return `<div class="box last-box">
      <div class="eyebrow">Your last question</div>
      <p class="qa"><span>${esc(last.text)}</span> <b class="${last.yes ? 'yes' : 'no'}">${yesNo(last.yes)}</b></p>
      ${action}${lastOne}
    </div>`;
  }

  function askPanel(v) {
    const answers = myAnswers(v);
    const asked = {};
    answers.forEach((a) => { asked[a.qid] = a.yes; });
    const hints = hintsOn(v);
    const ids = data.candidates(answers);
    const best = hints ? data.recommend(answers) : null;
    const groups = [];
    data.QUESTIONS.forEach((q) => {
      let g = groups.find((x) => x.name === q.group);
      if (!g) groups.push((g = { name: q.group, qs: [] }));
      g.qs.push(q);
    });

    let hintLine = '';
    if (hints && best && ids.length > 1) {
      const sp = data.split(best, ids);
      hintLine = `<div class="hint-line">💡 <span>Best next question: <b>“${esc(data.Q_BY_ID[best].text)}”</b><br>
        It splits the <b>${ids.length}</b> people who are still possible into <b>${sp.yes}</b> and <b>${sp.no}</b>.</span></div>`;
    } else if (hints && ids.length === 1) {
      hintLine = `<div class="hint-line">💡 <span>Only <b>${esc(nameOf(ids[0]))}</b> matches every answer. Make your guess!</span></div>`;
    }

    const groupHtml = groups.map((g) => `
      <div class="q-group"><div class="q-group-title">${esc(g.name)}</div><div class="chips">
        ${g.qs.map((q) => chip(q, asked, hints, ids, best)).join('')}
      </div></div>`).join('');

    return `<div class="box ask-box">
      <h3>Your turn — ask a yes/no question</h3>
      ${hintLine}
      <div class="q-groups">${groupHtml}</div>
      ${v.solo ? '' : `<form class="custom-q" data-form="custom-q">
        <input id="custom-q" maxlength="120" placeholder="…or type your own yes/no question" autocomplete="off">
        <button class="btn secondary" type="submit">Ask</button></form>`}
      <div class="guess-row">
        <button class="btn guess" data-action="start-guess">🎯 Make a final guess</button>
      </div>
    </div>`;
  }

  function swatch(q) {
    if (!q.swatch) return '';
    const col = q.swatchType === 'hair' ? avatar.HAIR[q.swatch] : avatar.SHIRT[q.swatch];
    return `<span class="swatch" style="background:${col}"></span>`;
  }

  function chip(q, asked, hints, ids, best) {
    const wasAsked = Object.prototype.hasOwnProperty.call(asked, q.id);
    let extra = '';
    let cls = 'chip';
    if (wasAsked) {
      cls += ' asked';
      extra = `<span class="chip-ans ${asked[q.id] ? 'yes' : 'no'}">${yesNo(asked[q.id])}</span>`;
    } else if (hints) {
      const sp = data.split(q.id, ids);
      const useless = sp.yes === 0 || sp.no === 0;
      if (useless) cls += ' useless';
      if (q.id === best) cls += ' best';
      extra = `<span class="split" title="${sp.yes} would be Yes, ${sp.no} would be No">${sp.yes}|${sp.no}</span>`;
    }
    return `<button class="${cls}" data-action="ask" data-q="${q.id}" title="${esc(q.text)}" ${wasAsked ? 'disabled' : ''}>
      ${q.id === best && !wasAsked ? '<span class="star" aria-label="best">★</span>' : ''}${swatch(q)}<span>${esc(q.label)}</span>${extra}</button>`;
  }

  function logPanel(v) {
    if (!v.log.length) return '';
    const opp = esc(v.opp.name);
    const items = v.log.slice().reverse().map((e) => {
      const who = e.seat === v.mySeat ? 'You' : opp;
      if (e.kind === 'guess') {
        return `<li class="${e.seat === v.mySeat ? 'mine' : 'theirs'}"><span class="who">${who}</span>
          <span class="txt">guessed <b>${esc(nameOf(e.id))}</b></span>
          <b class="${e.correct ? 'yes' : 'no'}">${e.correct ? 'Right!' : 'Wrong'}</b></li>`;
      }
      return `<li class="${e.seat === v.mySeat ? 'mine' : 'theirs'}"><span class="who">${who}</span>
        <span class="txt">${esc(e.text)}</span><b class="${e.yes ? 'yes' : 'no'}">${yesNo(e.yes)}</b></li>`;
    }).join('');
    return `<div class="box log-box"><h3>Questions so far</h3><ol class="log">${items}</ol></div>`;
  }

  // ---------- end of round ----------
  function halvingSteps(v) {
    const steps = [{ label: 'Start', count: TOTAL }];
    const answers = [];
    let typed = false;
    v.log.forEach((e) => {
      if (e.seat !== v.mySeat) return;
      if (e.kind === 'q' && e.qid) {
        answers.push({ qid: e.qid, yes: e.yes });
        steps.push({ label: `${data.Q_BY_ID[e.qid].label} ${yesNo(e.yes)}`, count: data.candidates(answers).length });
      } else if (e.kind === 'q') {
        typed = true;
        steps.push({ label: `“${e.text}” ${yesNo(e.yes)}`, count: null });
      }
    });
    return { steps, typed };
  }

  function verdict(v, steps, typed) {
    const myGuess = v.log.find((e) => e.kind === 'guess' && e.seat === v.mySeat);
    const counts = steps.filter((s) => s.count != null).map((s) => s.count);
    const last = counts[counts.length - 1];
    const halvedEveryTime = counts.every((c, i) => c === TOTAL >> i);
    const n = counts.length - 1;
    if (myGuess && myGuess.correct) {
      if (halvedEveryTime && last === 1 && !typed) {
        return `🌟 <b>Perfect halving!</b> ${counts.join(' → ')}. Every question cut the group exactly in half — that’s a <b>binary search</b>.`;
      }
      if (last === 1) return `You found them in <b>${v.me.asked}</b> questions. Questions that cut the group exactly in half always find the mystery person in <b>4</b>.`;
      return `Lucky guess! <b>${last}</b> people were still possible, so you had a 1-in-${last} chance.`;
    }
    if (myGuess && !myGuess.correct) {
      return last > 1
        ? `<b>${last}</b> people were still possible when you guessed, so it was a 1-in-${last} chance. Try to narrow it down to 1 first!`
        : 'Double-check the answers before guessing — the faces left on your board should match every answer.';
    }
    if (n === 0) return 'You didn’t get to ask any questions this time.';
    const halved = halvedEveryTime && !typed ? ' Every question you asked cut the group in half — nice!' : '';
    return `You had narrowed it down to <b>${last}</b> ${last === 1 ? 'person' : 'people'} with ${v.me.asked} question${v.me.asked === 1 ? '' : 's'}.${halved}`;
  }

  function renderOver() {
    const v = ui.view;
    const el = $('#over');
    if (v.phase !== 'over') { el.hidden = true; el.innerHTML = ''; ui.overHidden = null; return; }
    const key = `${v.id}:${v.round}`;
    if (ui.overHidden === key) { el.hidden = true; return; }
    if (!el.hidden && el.dataset.key === key) return;
    el.dataset.key = key;
    const opp = esc(v.opp.name);
    const won = v.winner === v.mySeat;
    const guessEntry = v.log.filter((e) => e.kind === 'guess').pop();
    const oppSecret = esc(nameOf(v.opp.secret));
    const mySecret = esc(nameOf(v.me.secret));
    let title;
    if (won && v.endReason === 'guessed') title = `🎉 You found ${oppSecret}!`;
    else if (won) title = `🎉 ${opp} guessed ${esc(nameOf(guessEntry.id))} — wrong! You win`;
    else if (v.endReason === 'guessed') title = `${opp} found ${mySecret} first`;
    else title = `Not quite — it was ${oppSecret}`;

    const { steps, typed } = halvingSteps(v);
    const bars = steps.map((s) => `
      <div class="step"><span class="step-label">${esc(s.label)}</span>
        <span class="bar"><span style="width:${s.count == null ? 0 : (s.count / TOTAL) * 100}%"></span></span>
        <b class="step-count">${s.count == null ? '–' : s.count}</b></div>`).join('');

    el.innerHTML = `<div class="over-card ${won ? 'won' : 'lost'}" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <h2 id="over-title">${title}</h2>
      <div class="reveal">
        <figure><div class="mini-card big">${avatar.svg(data.BY_ID[v.opp.secret], { title: false })}</div>
          <figcaption>${v.solo ? 'The computer’s' : opp + '’s'} mystery person<br><b>${oppSecret}</b></figcaption></figure>
        ${v.solo ? '' : `<figure><div class="mini-card big">${avatar.svg(data.BY_ID[v.me.secret], { title: false })}</div>
          <figcaption>Your mystery person<br><b>${mySecret}</b></figcaption></figure>`}
      </div>
      <div class="halving">
        <h3>How you narrowed it down</h3>
        <div class="steps">${bars}</div>
        <p class="verdict">${verdict(v, steps, typed)}</p>
        ${v.solo ? '' : `<p class="muted small">You asked ${v.me.asked} · ${opp} asked ${v.opp.asked}</p>`}
      </div>
      <div class="row center">
        <button class="btn primary big" data-action="rematch">Play again</button>
        <button class="btn ghost" data-action="${session.role === 'host' ? 'menu' : 'leave'}">${session.role === 'host' ? 'More…' : 'Leave'}</button>
        <button class="btn ghost" data-action="hide-over">See the board</button>
      </div>
    </div>`;
    el.hidden = false;
  }

  // ------------------------------------------------------------------ events
  function nameInputValue(id) {
    const el = $(id);
    const n = el ? game.cleanName(el.value, '') : '';
    if (n) saveName(n);
    return n;
  }

  const actions = {
    home() { ui.screen = 'home'; ui.joinError = ''; cleanUrl(); render(); },
    howto: showHowTo,
    host() { startHost(nameInputValue('#name') || 'Teacher'); },
    solo() { ui.soloHints = false; startSolo(nameInputValue('#name') || 'You'); },
    leave: confirmLeave,
    'copy-link'() {
      const input = $('#join-link');
      const text = input.value;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => toast('Link copied!'))
        .catch(() => { input.select(); toast('Press Ctrl+C (or ⌘C) to copy'); });
    },
    'toggle-hints'(el) {
      if (!session) return;
      if (session.role === 'solo') { ui.soloHints = el.checked; render(); return; }
      if (session.role === 'host') dispatch({ type: 'settings', hints: el.checked });
    },
    'show-invite'() {
      const url = net.joinUrl(session.code);
      modal({
        title: `Game code ${esc(session.code)}`,
        html: `<div class="invite-modal"><div class="qr">${qrSvg(url)}</div>
          <p>Go to <b>${esc(prettyBaseUrl())}</b> and enter <b class="code-inline">${esc(session.code)}</b></p></div>`
      });
    },
    menu() {
      const items = [{ label: 'How to play', cls: 'ghost', onClick: showHowTo }];
      if (session.role === 'host') items.push({ label: 'Invite a different student', cls: 'ghost', onClick: inviteNewStudent });
      items.push({ label: session.role === 'solo' ? 'Quit practice' : 'Leave game', cls: 'danger', onClick: confirmLeave });
      items.push({ label: 'Close', cls: 'primary' });
      modal({ title: 'Menu', html: '<p class="muted">Teacher guide: <a href="guide.html" target="_blank" rel="noopener">open the strategy guide</a></p>', actions: items });
    },
    'lock-in'() { if (ui.selected) dispatch({ type: 'pick', id: ui.selected }); },
    'random-pick'() {
      const b = data.BOARD;
      ui.selected = b[Math.floor(Math.random() * b.length)].id;
      updateBoard(); renderSide();
    },
    ask(el) { ui.draftQuestion = ''; dispatch({ type: 'ask', qid: el.dataset.q }); },
    answer(el) { dispatch({ type: 'answer', yes: el.dataset.yes === '1' }); },
    'auto-flip'() {
      const ids = toFlipIds(ui.view);
      if (ids.length) dispatch({ type: 'flip', ids, down: true });
    },
    'start-guess'() {
      ui.guessMode = true;
      updateBoardHead(); updateBoard();
      const board = $('#board');
      board && board.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'cancel-guess'() { ui.guessMode = false; updateBoardHead(); updateBoard(); },
    rematch() { dispatch({ type: 'rematch' }); },
    'hide-over'() { ui.overHidden = `${ui.view.id}:${ui.view.round}`; render(); },
    'show-over'() { ui.overHidden = null; render(); }
  };

  function onCardClick(card) {
    const v = ui.view;
    const id = card.dataset.id;
    if (!v) return;
    if (v.phase === 'pick' && !v.me.secret) {
      ui.selected = id;
      updateBoard(); renderSide();
      return;
    }
    if (v.phase !== 'play') return;
    if (ui.guessMode) {
      const c = data.BY_ID[id];
      modal({
        title: `Is it ${esc(c.name)}?`,
        html: `<div class="confirm-guess"><div class="mini-card big">${avatar.svg(c, { title: false })}</div>
          <p>This is your final guess. If you’re wrong, you lose the round!</p></div>`,
        actions: [
          { label: 'Not yet', cls: 'ghost' },
          { label: `Yes, guess ${c.name}`, cls: 'primary', onClick() { ui.guessMode = false; dispatch({ type: 'guess', id }); } }
        ]
      });
      return;
    }
    dispatch({ type: 'flip', id, down: !ui.flipped.has(id) });
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card && !card.disabled && $('#board') && $('#board').contains(card)) { onCardClick(card); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('input[type=checkbox][data-action]')) actions[el.dataset.action](el, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList.contains('code-input')) {
      const pos = el.selectionStart;
      el.value = net.normalizeCode(el.value);
      try { el.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
    }
    if (el.id === 'custom-q') ui.draftQuestion = el.value;
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    if (kind === 'join-home') {
      const code = net.normalizeCode($('#home-code').value);
      const name = nameInputValue('#name');
      if (!net.isValidCode(code)) { $('#home-error').textContent = `Codes are ${net.CODE_LENGTH} letters/numbers, like K7QF.`; return; }
      if (!name) { ui.joinCode = code; ui.joinError = ''; ui.screen = 'join'; render(); return; }
      startGuest(code, name);
    } else if (kind === 'join') {
      const code = net.normalizeCode($('#join-code').value);
      const name = nameInputValue('#join-name');
      ui.joinCode = code;
      if (!net.isValidCode(code)) { ui.joinError = `Codes are ${net.CODE_LENGTH} letters/numbers, like K7QF.`; render(); return; }
      if (!name) { ui.joinError = 'Please type your name so the host knows who joined.'; render(); $('#join-name').focus(); return; }
      ui.joinError = '';
      startGuest(code, name);
    } else if (kind === 'custom-q') {
      const input = $('#custom-q');
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      ui.draftQuestion = '';
      dispatch({ type: 'ask', text });
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (session && session.role !== 'solo' && ui.view && ui.view.phase === 'play') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ------------------------------------------------------------------ boot
  function boot() {
    const q = new URLSearchParams(location.search);
    const joinParam = net.normalizeCode(q.get('join') || '');
    const savedHost = store.get(SS, 'wh-host');
    const savedGuest = store.get(SS, 'wh-guest');

    if (joinParam) {
      if (savedGuest && savedGuest.code === joinParam && savedGuest.name) return startGuest(savedGuest.code, savedGuest.name);
      ui.joinCode = joinParam;
      ui.screen = 'join';
      return render();
    }
    if (savedHost && savedHost.code && savedHost.state) return startHost(savedHost.state.players.host.name, savedHost);
    if (savedGuest && savedGuest.code && savedGuest.name) return startGuest(savedGuest.code, savedGuest.name);
    render();
  }

  if (typeof window.Peer !== 'function') {
    // PeerJS failed to load: solo practice still works.
    window.Peer = function () { throw new Error('Connection library did not load.'); };
  }
  boot();
})();
