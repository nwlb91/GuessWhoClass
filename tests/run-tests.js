/* Plain Node tests (no dependencies): `node tests/run-tests.js` */
'use strict';
const assert = require('assert');
const data = require('../js/characters.js');
const game = require('../js/game.js');
const avatar = require('../js/avatar.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const ids = data.BOARD.map((c) => c.id);
const Q = (id) => data.Q_BY_ID[id];
const where = (qid, pool) => (pool || ids).filter((id) => Q(qid).test(data.BY_ID[id]));

console.log('Cast design');

test('16 people, 8 men and 8 women, unique names with initials A–P', () => {
  assert.strictEqual(ids.length, 16);
  assert.strictEqual(where('man').length, 8);
  assert.strictEqual(where('woman').length, 8);
  const initials = data.BOARD.map((c) => c.name[0]).join('');
  assert.strictEqual(initials, 'ABCDEFGHIJKLMNOP');
});

test('every strategy question halves its group, at every step, in the planned order', () => {
  ['man', 'woman'].forEach((g) => {
    let groups = [where(g)];
    data.STRATEGY[g].forEach((qid) => {
      const next = [];
      groups.forEach((grp) => {
        const yes = where(qid, grp);
        assert.strictEqual(yes.length * 2, grp.length, `${qid} should halve ${grp.join(',')}`);
        next.push(yes, grp.filter((id) => yes.indexOf(id) < 0));
      });
      groups = next;
    });
    groups.forEach((grp) => assert.strictEqual(grp.length, 1));
  });
});

test('within each gender, the 3 strategy traits form all 8 combinations (so any order works)', () => {
  ['man', 'woman'].forEach((g) => {
    const seen = new Set(where(g).map((id) => data.STRATEGY[g].map((qid) => (Q(qid).test(data.BY_ID[id]) ? 1 : 0)).join('')));
    assert.strictEqual(seen.size, 8);
  });
});

test('every character is found in exactly 4 strategy questions', () => {
  ids.forEach((id) => {
    const answers = data.strategyPath(id).map(([qid, yes]) => ({ qid, yes }));
    assert.strictEqual(answers.length, 4);
    assert.deepStrictEqual(data.candidates(answers), [id]);
  });
});

test('decoys: some women wear hats and glasses, some men wear earrings or a necklace', () => {
  const women = where('woman'), men = where('man');
  assert.strictEqual(where('hat', women).length, 3);
  assert.strictEqual(where('glasses', women).length, 3);
  assert.strictEqual(where('earrings', men).length, 2);
  assert.strictEqual(where('necklace', men).length, 1);
});

test('decoy traits are not perfect first questions (only "man"/"woman" split 8|8)', () => {
  const perfect = data.QUESTIONS.filter((q) => where(q.id).length === 8).map((q) => q.id);
  assert.deepStrictEqual(perfect.sort(), ['man', 'woman']);
});

test('a woman with a hat never also has a bow (bow would be hidden)', () => {
  where('woman').forEach((id) => {
    const c = data.BY_ID[id];
    assert.ok(!(c.hat && c.bow), id);
  });
});

test('bald people have no hat (so "bald?" is answerable from the picture)', () => {
  where('bald').forEach((id) => assert.ok(!data.BY_ID[id].hat, id));
});

test('no two characters look the same to the question list', () => {
  const sigs = new Set(ids.map((id) => data.QUESTIONS.map((q) => (q.test(data.BY_ID[id]) ? 1 : 0)).join('')));
  assert.strictEqual(sigs.size, 16);
});

test('recommend() follows the strategy from the start', () => {
  assert.strictEqual(data.recommend([]), 'man');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: true }]), 'hat');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: false }]), 'earrings');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: false }, { qid: 'earrings', yes: true }]), 'necklace');
  assert.strictEqual(data.recommend(data.strategyPath('grace').map(([qid, yes]) => ({ qid, yes }))), null);
});

test('recommend() still finds a halving question after an off-strategy start', () => {
  const answers = [{ qid: 'hair-black', yes: false }];
  const pool = data.candidates(answers);
  const sp = data.split(data.recommend(answers), pool);
  assert.ok(Math.abs(sp.yes - sp.no) <= 1, JSON.stringify(sp));
});

test('every character renders to an SVG', () => {
  data.CHARACTERS.forEach((c) => {
    const s = avatar.svg(c);
    assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), c.id);
    assert.ok(!/undefined|NaN/.test(s), c.id + ' has undefined/NaN in SVG');
  });
});

console.log('Game rules');

function playToPlay() {
  let s = game.create({ hostName: 'Ms. Lee' });
  s = game.apply(s, 'guest', { type: 'join', name: 'Sam' }).state;
  s = game.apply(s, 'host', { type: 'pick', id: 'hiro' }).state;
  s = game.apply(s, 'guest', { type: 'pick', id: 'grace' }).state;
  return s;
}

test('lobby -> pick -> play, student goes first', () => {
  let s = game.create({ hostName: 'Ms. Lee' });
  assert.strictEqual(s.phase, 'lobby');
  s = game.apply(s, 'guest', { type: 'join', name: '  Sam  ' }).state;
  assert.strictEqual(s.phase, 'pick');
  assert.strictEqual(s.players.guest.name, 'Sam');
  s = playToPlay();
  assert.strictEqual(s.phase, 'play');
  assert.strictEqual(s.turn, 'guest');
});

test('views hide the opponent’s mystery person until the round ends', () => {
  const s = playToPlay();
  assert.strictEqual(game.viewFor(s, 'guest').opp.secret, null);
  assert.strictEqual(game.viewFor(s, 'host').opp.secret, null);
  assert.strictEqual(game.viewFor(s, 'guest').me.secret, 'grace');
  assert.ok(!JSON.stringify(game.viewFor(s, 'guest')).includes('hiro'));
});

test('list questions are answered automatically and pass the turn', () => {
  let s = playToPlay();
  assert.ok(game.apply(s, 'host', { type: 'ask', qid: 'man' }).error, 'host cannot ask on guest turn');
  s = game.apply(s, 'guest', { type: 'ask', qid: 'man' }).state;   // host has hiro
  assert.deepStrictEqual(s.log[0], { seat: 'guest', kind: 'q', qid: 'man', text: 'Is it a man?', yes: true });
  assert.strictEqual(s.turn, 'host');
  s = game.apply(s, 'host', { type: 'ask', qid: 'glasses' }).state; // guest has grace (glasses)
  assert.strictEqual(s.log[1].yes, true);
  assert.strictEqual(s.turn, 'guest');
});

test('typed questions wait for the other player to answer', () => {
  let s = playToPlay();
  s = game.apply(s, 'guest', { type: 'ask', text: 'Does your person look happy?' }).state;
  assert.ok(s.pending);
  assert.strictEqual(s.turn, 'guest');
  assert.ok(game.apply(s, 'guest', { type: 'answer', yes: true }).error, 'asker cannot answer');
  assert.ok(game.apply(s, 'guest', { type: 'ask', qid: 'hat' }).error, 'cannot ask twice');
  s = game.apply(s, 'host', { type: 'answer', yes: false }).state;
  assert.strictEqual(s.pending, null);
  assert.strictEqual(s.turn, 'host');
  assert.strictEqual(s.log[0].yes, false);
  assert.strictEqual(s.players.guest.asked, 1);
});

test('flips are tracked per player and shown to the opponent as a count', () => {
  let s = playToPlay();
  s = game.apply(s, 'host', { type: 'flip', ids: ['arjun', 'nate', 'nope'], down: true }).state;
  assert.deepStrictEqual(s.players.host.flipped, ['arjun', 'nate']);
  assert.strictEqual(game.viewFor(s, 'guest').opp.remaining, 14);
  s = game.apply(s, 'host', { type: 'flip', id: 'arjun', down: false }).state;
  assert.deepStrictEqual(s.players.host.flipped, ['nate']);
});

test('correct guess wins; wrong guess loses (classic rule)', () => {
  let s = playToPlay();
  const win = game.apply(s, 'guest', { type: 'guess', id: 'hiro' }).state;
  assert.strictEqual(win.phase, 'over');
  assert.strictEqual(win.winner, 'guest');
  assert.strictEqual(game.viewFor(win, 'guest').opp.secret, 'hiro');
  const lose = game.apply(s, 'guest', { type: 'guess', id: 'omar' }).state;
  assert.strictEqual(lose.winner, 'host');
  assert.strictEqual(lose.endReason, 'wrong-guess');
});

test('rematch resets the round and alternates who goes first', () => {
  let s = playToPlay();
  s = game.apply(s, 'guest', { type: 'guess', id: 'hiro' }).state;
  s = game.apply(s, 'host', { type: 'rematch' }).state;
  assert.strictEqual(s.phase, 'pick');
  assert.strictEqual(s.round, 2);
  assert.strictEqual(s.players.host.secret, null);
  assert.strictEqual(s.log.length, 0);
  s = game.apply(s, 'host', { type: 'pick', id: 'mei' }).state;
  s = game.apply(s, 'guest', { type: 'pick', id: 'kofi' }).state;
  assert.strictEqual(s.turn, 'host');
});

test('solo practice: computer hides someone, play starts at once, turn stays with you', () => {
  let s = game.create({ solo: true, hostName: 'Ava', random: () => 0.99 });
  assert.strictEqual(s.phase, 'play');
  assert.strictEqual(s.players.guest.secret, 'priya');
  s = game.apply(s, 'host', { type: 'ask', qid: 'man' }).state;
  assert.strictEqual(s.turn, 'host');
  assert.ok(game.apply(s, 'host', { type: 'ask', text: 'Happy?' }).error, 'no typed questions in solo');
  s = game.apply(s, 'host', { type: 'guess', id: 'priya' }).state;
  assert.strictEqual(s.winner, 'host');
  s = game.apply(s, 'host', { type: 'rematch', random: () => 0 }).state;
  assert.strictEqual(s.phase, 'play');
  assert.strictEqual(s.players.guest.secret, 'arjun');
});

test('apply never mutates the previous state and rejects junk', () => {
  const s = playToPlay();
  const before = JSON.stringify(s);
  game.apply(s, 'guest', { type: 'ask', qid: 'man' });
  assert.strictEqual(JSON.stringify(s), before);
  assert.ok(game.apply(s, 'guest', { type: 'ask', qid: 'nonsense' }).error);
  assert.ok(game.apply(s, 'guest', { type: 'settings', hints: true }).error);
  assert.ok(game.apply(s, 'guest', { type: 'pick', id: 'kofi' }).error);
  assert.ok(game.apply(s, 'intruder', { type: 'ask', qid: 'man' }).error);
  assert.ok(game.apply(s, 'guest', null).error);
});

test('names are trimmed and limited', () => {
  let s = game.create({ hostName: '' });
  assert.strictEqual(s.players.host.name, 'Teacher');
  s = game.apply(s, 'guest', { type: 'join', name: 'x'.repeat(50) }).state;
  assert.strictEqual(s.players.guest.name.length, 20);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
