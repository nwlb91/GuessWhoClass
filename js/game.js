/*
 * Game rules. The host's browser owns the real game state and runs every
 * action through `apply`; each player is sent a `viewFor` their seat, which
 * hides the opponent's mystery person until the round is over.
 *
 * Seats are 'host' and 'guest'. In solo practice the guest seat is the
 * computer, which just picks a mystery person and answers questions.
 */
(function (root) {
  'use strict';

  var data = (typeof module !== 'undefined' && module.exports)
    ? require('./characters.js')
    : root.WH.data;

  var NAME_MAX = 20;
  var QUESTION_MAX = 120;

  function other(seat) { return seat === 'host' ? 'guest' : 'host'; }

  function cleanName(name, fallback) {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    return name || fallback;
  }

  function blankPlayer(name) {
    return { name: name, secret: null, flipped: [], asked: 0, connected: false };
  }

  function create(opts) {
    opts = opts || {};
    var state = {
      id: Math.random().toString(36).slice(2, 10),
      phase: opts.solo ? 'pick' : 'lobby',   // lobby -> pick -> play -> over -> (rematch) pick
      solo: !!opts.solo,
      // hints: the host sees how each question splits the board (never sent to the guest)
      // confirmAnswers: list questions wait for the answerer to tap "Send" on the true answer
      // autoFlip: each answer to a list question flips down the faces it rules out
      settings: { hints: !!opts.hints, confirmAnswers: !!opts.confirmAnswers, autoFlip: !!opts.autoFlip },
      round: 1,
      firstTurn: opts.solo ? 'host' : 'guest', // the student goes first in round 1
      turn: null,
      players: {
        host: blankPlayer(cleanName(opts.hostName, opts.solo ? 'You' : 'Teacher')),
        guest: blankPlayer(opts.solo ? 'Computer' : null)
      },
      pending: null,      // question waiting for the other player: {seat, text, qid?}
      log: [],
      winner: null,
      endReason: null,
      seq: 0
    };
    state.players.host.connected = true;
    if (state.solo) {
      // Practice: the computer hides someone and play starts straight away.
      state.players.guest.connected = true;
      state.players.guest.secret = randomId(opts.random);
      startPlay(state);
    }
    return state;
  }

  function randomId(rand) {
    rand = rand || Math.random;
    var b = data.BOARD;
    return b[Math.floor(rand() * b.length)].id;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function fail(state, msg) { return { state: state, error: msg }; }

  /** Apply an action from `seat`. Returns {state, error?}. Never mutates the input. */
  function apply(prev, seat, action) {
    if (seat !== 'host' && seat !== 'guest') return fail(prev, 'Unknown player.');
    if (!action || typeof action.type !== 'string') return fail(prev, 'Bad action.');
    var s = clone(prev);
    var me = s.players[seat];
    var opp = s.players[other(seat)];
    var oppSeat = other(seat);

    switch (action.type) {
      case 'join': {
        if (seat !== 'guest' || s.solo) return fail(prev, 'Only a guest can join.');
        me.name = cleanName(action.name, 'Student');
        me.connected = true;
        if (s.phase === 'lobby') s.phase = 'pick';
        break;
      }

      case 'connection': {
        if (s.solo) return fail(prev, 'Not in solo.');
        me.connected = !!action.connected;
        break;
      }

      case 'settings': {
        if (seat !== 'host') return fail(prev, 'Only the host can change settings.');
        if (typeof action.hints === 'boolean') s.settings.hints = action.hints;
        if (typeof action.confirmAnswers === 'boolean') s.settings.confirmAnswers = action.confirmAnswers;
        if (typeof action.autoFlip === 'boolean') s.settings.autoFlip = action.autoFlip;
        // Turning confirmation off answers any list question that was waiting for it.
        if (!s.settings.confirmAnswers && s.pending && s.pending.qid) {
          resolvePending(s, data.Q_BY_ID[s.pending.qid].test(data.BY_ID[s.players[other(s.pending.seat)].secret]));
        }
        break;
      }

      case 'pick': {
        if (s.phase !== 'pick') return fail(prev, 'It is not time to pick.');
        if (!data.BY_ID[action.id]) return fail(prev, 'Unknown person.');
        if (me.secret) return fail(prev, 'You already picked.');
        me.secret = action.id;
        if (opp.secret) startPlay(s);
        break;
      }

      case 'ask': {
        if (s.phase !== 'play') return fail(prev, 'The game has not started.');
        if (s.turn !== seat) return fail(prev, 'Wait for your turn.');
        if (s.pending) return fail(prev, 'Waiting for an answer.');
        if (action.qid) {
          var q = data.Q_BY_ID[action.qid];
          if (!q) return fail(prev, 'Unknown question.');
          if (s.settings.confirmAnswers && !s.solo) {
            // The answer is worked out when the other player confirms it, so it never sits in the state early.
            s.pending = { seat: seat, text: q.text, qid: q.id };
            break;
          }
          me.asked++;
          s.log.push({ seat: seat, kind: 'q', qid: q.id, text: q.text, yes: q.test(data.BY_ID[opp.secret]) });
          s.turn = s.solo ? seat : oppSeat;
        } else {
          if (s.solo) return fail(prev, 'The computer can only answer questions from the list.');
          var text = String(action.text || '').replace(/\s+/g, ' ').trim().slice(0, QUESTION_MAX);
          if (!text) return fail(prev, 'Type a question first.');
          s.pending = { seat: seat, text: text };
        }
        break;
      }

      case 'answer': {
        if (s.phase !== 'play' || !s.pending) return fail(prev, 'There is no question to answer.');
        if (s.pending.seat === seat) return fail(prev, 'Your opponent has to answer.');
        if (s.pending.qid) {
          // List question: the true answer for this player's mystery person is sent, whatever was tapped.
          resolvePending(s, data.Q_BY_ID[s.pending.qid].test(data.BY_ID[me.secret]));
        } else {
          if (typeof action.yes !== 'boolean') return fail(prev, 'Answer yes or no.');
          resolvePending(s, action.yes);
        }
        break;
      }

      case 'flip': {
        if (s.phase !== 'play') return fail(prev, 'Cards can only be flipped during play.');
        var ids = Array.isArray(action.ids) ? action.ids : [action.id];
        var set = {};
        me.flipped.forEach(function (id) { set[id] = true; });
        ids.forEach(function (id) {
          if (!data.BY_ID[id]) return;
          if (action.down) set[id] = true; else delete set[id];
        });
        me.flipped = data.BOARD.map(function (c) { return c.id; }).filter(function (id) { return set[id]; });
        break;
      }

      case 'guess': {
        if (s.phase !== 'play') return fail(prev, 'The game has not started.');
        if (s.turn !== seat) return fail(prev, 'Wait for your turn.');
        if (s.pending) return fail(prev, 'Waiting for an answer.');
        if (!data.BY_ID[action.id]) return fail(prev, 'Unknown person.');
        var correct = action.id === opp.secret;
        s.log.push({ seat: seat, kind: 'guess', id: action.id, correct: correct });
        s.phase = 'over';
        s.turn = null;
        // Classic rule: a wrong final guess loses the round.
        s.winner = correct ? seat : oppSeat;
        s.endReason = correct ? 'guessed' : 'wrong-guess';
        break;
      }

      case 'rematch': {
        if (s.phase !== 'over') return fail(prev, 'Finish this round first.');
        s.round++;
        s.firstTurn = s.solo ? 'host' : other(s.firstTurn);
        s.phase = 'pick';
        s.turn = null;
        s.pending = null;
        s.log = [];
        s.winner = null;
        s.endReason = null;
        ['host', 'guest'].forEach(function (k) {
          s.players[k].secret = null;
          s.players[k].flipped = [];
          s.players[k].asked = 0;
        });
        if (s.solo) {
          s.players.guest.secret = randomId(action.random);
          startPlay(s);
        }
        break;
      }

      default:
        return fail(prev, 'Unknown action.');
    }
    s.seq = (prev.seq || 0) + 1;
    return { state: s };
  }

  /** Record the answer to the waiting question and pass the turn to whoever answered it. */
  function resolvePending(s, yes) {
    var p = s.pending;
    s.players[p.seat].asked++;
    s.log.push({ seat: p.seat, kind: 'q', qid: p.qid || null, text: p.text, yes: yes });
    s.turn = other(p.seat);
    s.pending = null;
  }

  function startPlay(s) {
    s.phase = 'play';
    s.turn = s.firstTurn;
    s.log = [];
    s.pending = null;
    ['host', 'guest'].forEach(function (k) {
      s.players[k].flipped = [];
      s.players[k].asked = 0;
    });
  }

  /** Structured answers a seat has received, as [{qid, yes}] for the solver. */
  function answersFor(stateOrView, seat) {
    return stateOrView.log
      .filter(function (e) { return e.kind === 'q' && e.seat === seat && e.qid; })
      .map(function (e) { return { qid: e.qid, yes: e.yes }; });
  }

  /** What one seat is allowed to see. */
  function viewFor(s, seat) {
    var me = s.players[seat];
    var opp = s.players[other(seat)];
    var reveal = s.phase === 'over';
    return {
      id: s.id,
      seq: s.seq,
      phase: s.phase,
      solo: s.solo,
      settings: {
        hints: seat === 'host' && !!s.settings.hints,   // only the host ever sees hints
        confirmAnswers: !!s.settings.confirmAnswers,
        autoFlip: !!s.settings.autoFlip
      },
      round: s.round,
      turn: s.turn,
      firstTurn: s.firstTurn,
      mySeat: seat,
      pending: s.pending ? clone(s.pending) : null,
      log: clone(s.log),
      winner: s.winner,
      endReason: s.endReason,
      me: { name: me.name, secret: me.secret, flipped: me.flipped.slice(), asked: me.asked },
      opp: {
        name: opp.name,
        secret: reveal ? opp.secret : null,
        ready: !!opp.secret,
        remaining: data.BOARD.length - opp.flipped.length,
        asked: opp.asked,
        connected: opp.connected
      }
    };
  }

  var api = {
    create: create,
    apply: apply,
    viewFor: viewFor,
    answersFor: answersFor,
    other: other,
    cleanName: cleanName
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WH = root.WH || {}; root.WH.game = api; }
})(this);
