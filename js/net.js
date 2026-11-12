/*
 * Peer-to-peer connection between the host (teacher) and one guest (student),
 * using PeerJS (WebRTC). No game server is needed: the free PeerJS cloud
 * broker only introduces the two browsers to each other, then they talk directly.
 *
 * For local testing you can point at your own PeerServer with URL parameters:
 *   ?peerhost=localhost&peerport=9000&peerpath=/&peersecure=0
 */
(function (root) {
  'use strict';

  var ID_PREFIX = 'whos-hiding-v1-';
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
  var CODE_LENGTH = 4;
  var TIMEOUT_MS = 13000;

  var PEER_PARAMS = ['peerhost', 'peerport', 'peerpath', 'peersecure', 'peerdebug'];

  function peerParams() {
    var out = {};
    var q = new URLSearchParams(root.location ? root.location.search : '');
    PEER_PARAMS.forEach(function (k) { if (q.has(k)) out[k] = q.get(k); });
    return out;
  }

  function peerOptions() {
    var p = peerParams();
    var opts = { debug: p.peerdebug ? Number(p.peerdebug) : 0 };
    if (p.peerhost) {
      opts.host = p.peerhost;
      opts.port = Number(p.peerport || 9000);
      opts.path = p.peerpath || '/';
      opts.secure = p.peersecure === '1';
    }
    return opts;
  }

  function makeCode() {
    var out = '';
    var buf = new Uint32Array(CODE_LENGTH);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(buf) : buf.forEach(function (_, i) { buf[i] = Math.random() * 1e9; });
    for (var i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    return out;
  }

  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  }

  function isValidCode(code) {
    if (code.length !== CODE_LENGTH) return false;
    for (var i = 0; i < code.length; i++) if (CODE_ALPHABET.indexOf(code[i]) < 0) return false;
    return true;
  }

  function hostPeerId(code) { return ID_PREFIX + code.toLowerCase(); }

  /** Link that opens the join screen with the code filled in (keeps test-server params). */
  function joinUrl(code) {
    var loc = root.location;
    var q = new URLSearchParams();
    q.set('join', code);
    var p = peerParams();
    Object.keys(p).forEach(function (k) { q.set(k, p[k]); });
    return loc.origin + loc.pathname + '?' + q.toString();
  }

  // ------------------------------------------------------------------ host
  /**
   * handlers: onOpen(code), onError(message, fatal), onGuestHello(conn, msg) -> 'ok' | reason,
   *           onGuestAction(action), onGuestStatus(connected), onCodeTaken()
   */
  function HostLink(code, handlers) {
    this.code = code;
    this.h = handlers;
    this.peer = null;
    this.conn = null;        // the accepted guest connection
    this.lastSeen = 0;
    this.destroyed = false;
    this.takenRetries = 0;
    this.guestUp = false;
    this._tick = null;
  }

  HostLink.prototype.start = function () {
    var self = this;
    if (self.destroyed) return;
    var peer = new root.Peer(hostPeerId(self.code), peerOptions());
    self.peer = peer;

    peer.on('open', function () {
      self.takenRetries = 0;
      self.h.onOpen && self.h.onOpen(self.code);
    });
    peer.on('connection', function (conn) { self._incoming(conn); });
    peer.on('disconnected', function () {
      // Lost the broker (not the student). Reconnect so new joins keep working.
      if (!self.destroyed && !peer.destroyed) setTimeout(function () {
        if (!self.destroyed && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1500);
    });
    peer.on('error', function (err) {
      if (self.destroyed) return;
      if (err.type === 'unavailable-id') {
        // Usually our own previous page still holds the code for a few seconds after a refresh.
        peer.destroy();
        self.takenRetries++;
        if (self.takenRetries <= 6 && self.h.resuming) {
          setTimeout(function () { self.start(); }, 2500);
        } else {
          self.h.onCodeTaken && self.h.onCodeTaken();
        }
        return;
      }
      if (err.type === 'peer-unavailable') return; // not relevant for host
      var fatal = ['browser-incompatible', 'ssl-unavailable', 'invalid-id', 'invalid-key'].indexOf(err.type) >= 0;
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
        self.h.onError && self.h.onError('Can’t reach the connection server. Check the internet connection — retrying…', false);
        setTimeout(function () {
          if (!self.destroyed && !peer.destroyed && peer.disconnected) peer.reconnect();
          else if (!self.destroyed && peer.destroyed) self.start();
        }, 4000);
        return;
      }
      self.h.onError && self.h.onError(err.message || String(err), fatal);
    });

    if (!self._tick) self._tick = setInterval(function () { self._checkAlive(); }, 2000);
  };

  HostLink.prototype._incoming = function (conn) {
    var self = this;
    var helloTimer = setTimeout(function () { try { conn.close(); } catch (e) { /* ignore */ } }, 15000);
    conn.on('data', function (msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        clearTimeout(helloTimer);
        var verdict = self.h.onGuestHello ? self.h.onGuestHello(msg, conn === self.conn) : 'ok';
        if (verdict !== 'ok') {
          safeSend(conn, { t: 'reject', reason: verdict });
          setTimeout(function () { try { conn.close(); } catch (e) { /* ignore */ } }, 500);
          return;
        }
        if (self.conn && self.conn !== conn) { var old = self.conn; self.conn = null; try { old.close(); } catch (e) { /* ignore */ } }
        self.conn = conn;
        self.lastSeen = Date.now();
        self._setGuest(true);
        safeSend(conn, { t: 'welcome' });
        self.h.onGuestJoined && self.h.onGuestJoined(msg);
        return;
      }
      if (conn !== self.conn) return;
      self.lastSeen = Date.now();
      if (!self.guestUp) self._setGuest(true);
      if (msg.t === 'ping') safeSend(conn, { t: 'pong' });
      else if (msg.t === 'action') self.h.onGuestAction && self.h.onGuestAction(msg.action);
    });
    conn.on('close', function () {
      if (conn === self.conn) { self.conn = null; self._setGuest(false); }
    });
    conn.on('error', function () { /* close handler covers it */ });
  };

  HostLink.prototype._checkAlive = function () {
    if (this.conn && this.guestUp && Date.now() - this.lastSeen > TIMEOUT_MS) {
      var c = this.conn;
      this.conn = null;
      try { c.close(); } catch (e) { /* ignore */ }
      this._setGuest(false);
    }
  };

  HostLink.prototype._setGuest = function (up) {
    if (this.guestUp === up) return;
    this.guestUp = up;
    this.h.onGuestStatus && this.h.onGuestStatus(up);
  };

  HostLink.prototype.send = function (msg) { if (this.conn) safeSend(this.conn, msg); };

  HostLink.prototype.destroy = function () {
    this.destroyed = true;
    clearInterval(this._tick);
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
  };

  // ----------------------------------------------------------------- guest
  /**
   * handlers: onStatus(status, detail) where status is 'connecting' | 'connected' |
   *           'reconnecting' | 'notfound' | 'rejected' | 'error';  onMessage(msg)
   */
  function GuestLink(code, hello, handlers) {
    this.code = code;
    this.hello = hello;
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.everConnected = false;
    this.destroyed = false;
    this.lastHeard = 0;
    this.status = null;
    this._retryTimer = null;
    this._tick = null;
    this._openTimer = null;
    this.attempts = 0;
  }

  GuestLink.prototype.start = function () {
    var self = this;
    self._status('connecting');
    var peer = new root.Peer(peerOptions());
    self.peer = peer;
    peer.on('open', function () { self._connect(); });
    peer.on('disconnected', function () {
      if (!self.destroyed && !peer.destroyed) setTimeout(function () {
        if (!self.destroyed && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 1500);
    });
    peer.on('error', function (err) {
      if (self.destroyed) return;
      if (err.type === 'peer-unavailable') {
        if (!self.everConnected && self.attempts >= 2) {
          self._status('notfound');
          return;
        }
        self._retry(3000);
        return;
      }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed' || err.type === 'disconnected') {
        self._status(self.everConnected ? 'reconnecting' : 'connecting', 'Can’t reach the connection server — retrying…');
        setTimeout(function () {
          if (self.destroyed) return;
          if (!peer.destroyed && peer.disconnected) peer.reconnect();
          else if (peer.destroyed) self.start();
        }, 4000);
        return;
      }
      self._status('error', err.message || String(err));
    });
    if (!self._tick) self._tick = setInterval(function () { self._checkAlive(); }, 2000);
  };

  GuestLink.prototype._connect = function () {
    var self = this;
    if (self.destroyed || !self.peer || self.peer.destroyed) return;
    if (self.peer.disconnected) { self.peer.reconnect(); return; }
    self.attempts++;
    var conn = self.peer.connect(hostPeerId(self.code), { reliable: true, serialization: 'json' });
    self.conn = conn;
    clearTimeout(self._openTimer);
    self._openTimer = setTimeout(function () {
      if (self.conn === conn && !conn.open) { try { conn.close(); } catch (e) { /* ignore */ } self._retry(1000); }
    }, 12000);
    conn.on('open', function () {
      clearTimeout(self._openTimer);
      self.lastHeard = Date.now();
      safeSend(conn, Object.assign({ t: 'hello' }, self.hello));
    });
    conn.on('data', function (msg) {
      if (conn !== self.conn || !msg || typeof msg !== 'object') return;
      self.lastHeard = Date.now();
      if (msg.t === 'welcome') {
        self.everConnected = true;
        self._status('connected');
      } else if (msg.t === 'reject') {
        self.destroyed = true;
        self._status('rejected', msg.reason);
      } else if (msg.t !== 'pong') {
        if (self.status !== 'connected') { self.everConnected = true; self._status('connected'); }
        self.h.onMessage && self.h.onMessage(msg);
      }
    });
    conn.on('close', function () {
      if (conn !== self.conn || self.destroyed) return;
      self.conn = null;
      self._retry(1500);
    });
    conn.on('error', function () { /* close handler covers it */ });
  };

  GuestLink.prototype._retry = function (ms) {
    var self = this;
    if (self.destroyed) return;
    self._status(self.everConnected ? 'reconnecting' : 'connecting');
    clearTimeout(self._retryTimer);
    self._retryTimer = setTimeout(function () { self._connect(); }, ms);
  };

  GuestLink.prototype._checkAlive = function () {
    if (this.destroyed) return;
    if (this.conn && this.conn.open) {
      safeSend(this.conn, { t: 'ping' });
      if (this.status === 'connected' && Date.now() - this.lastHeard > TIMEOUT_MS) {
        var c = this.conn;
        this.conn = null;
        try { c.close(); } catch (e) { /* ignore */ }
        this._retry(500);
      }
    }
  };

  GuestLink.prototype._status = function (status, detail) {
    this.status = status;
    this.h.onStatus && this.h.onStatus(status, detail);
  };

  GuestLink.prototype.send = function (msg) {
    if (this.conn && this.conn.open) { safeSend(this.conn, msg); return true; }
    return false;
  };

  GuestLink.prototype.destroy = function () {
    this.destroyed = true;
    clearTimeout(this._retryTimer);
    clearTimeout(this._openTimer);
    clearInterval(this._tick);
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
  };

  function safeSend(conn, msg) {
    try { if (conn.open) conn.send(msg); } catch (e) { /* connection dropped; reconnect logic handles it */ }
  }

  root.WH = root.WH || {};
  root.WH.net = {
    HostLink: HostLink,
    GuestLink: GuestLink,
    makeCode: makeCode,
    normalizeCode: normalizeCode,
    isValidCode: isValidCode,
    joinUrl: joinUrl,
    CODE_LENGTH: CODE_LENGTH
  };
})(this);
