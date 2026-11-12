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

const tree = data.STRATEGY.tree;
function internalNodes(node, depth, out) {
  out = out || [];
  if (data.isLeaf(node)) return out;
  out.push({ node, depth: depth || 0 });
  internalNodes(node.yes, (depth || 0) + 1, out);
  internalNodes(node.no, (depth || 0) + 1, out);
  return out;
}
const nodes = internalNodes(tree);

test('24 people, 12 men and 12 women, unique names with initials A–X', () => {
  assert.strictEqual(ids.length, 24);
  assert.strictEqual(where('man').length, 12);
  assert.strictEqual(where('woman').length, 12);
  assert.strictEqual(data.BOARD.map((c) => c.name[0]).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWX');
});

test('the decision tree has every person exactly once as a leaf', () => {
  assert.deepStrictEqual(data.leavesOf(tree).slice().sort(), ids.slice().sort());
  assert.strictEqual(nodes.length, 23); // a binary tree with 24 leaves has 23 questions
});

test('every question in the tree sends exactly the right people each way', () => {
  nodes.forEach(({ node }) => {
    const people = data.leavesOf(node);
    const yes = where(node.q, people).sort();
    assert.deepStrictEqual(yes, data.leavesOf(node.yes).slice().sort(), `${node.q} at ${people.join(',')}`);
  });
});

test('every question in the tree halves its group as evenly as possible (24→12→6→3→1|2→1)', () => {
  nodes.forEach(({ node }) => {
    const n = data.leavesOf(node).length;
    const y = data.leavesOf(node.yes).length;
    assert.ok(data.isHalving(n, y), `${node.q}: ${n} -> ${y}|${n - y}`);
  });
});

test('every person is found in 4 or 5 questions (8 in 4, 16 in 5)', () => {
  const byLen = {};
  ids.forEach((id) => {
    const path = data.strategyPath(id);
    byLen[path.length] = (byLen[path.length] || 0) + 1;
    assert.deepStrictEqual(data.candidates(path.map(([qid, yes]) => ({ qid, yes }))), [id]);
  });
  assert.deepStrictEqual(byLen, { 4: 8, 5: 16 });
  assert.strictEqual(data.MAX_QUESTIONS, 5);
});

test('the next question depends on the previous answer (yes/no branches ask different things)', () => {
  nodes.forEach(({ node }) => {
    if (!data.isLeaf(node.yes) && !data.isLeaf(node.no)) {
      assert.notStrictEqual(node.yes.q, node.no.q, `after ${node.q}`);
    }
  });
});

test('no question is asked twice on the same path', () => {
  ids.forEach((id) => {
    const qs = data.strategyPath(id).map(([qid]) => qid);
    assert.strictEqual(new Set(qs).size, qs.length, id + ': ' + qs.join(' > '));
  });
});

test('the four questions on the 3rd level are all different', () => {
  const level2 = nodes.filter((x) => x.depth === 2).map((x) => x.node.q);
  assert.strictEqual(level2.length, 4);
  assert.strictEqual(new Set(level2).size, 4, level2.join(','));
});

test('decoys: hats, glasses, earrings and necklaces also appear where they are not asked', () => {
  const women = where('woman'), men = where('man');
  assert.strictEqual(where('hat', women).length, 4);
  assert.strictEqual(where('glasses', women).length, 4);
  assert.strictEqual(where('earrings', men).length, 3);
  assert.strictEqual(where('necklace', men).length, 2);
  assert.ok(where('stripes').length >= 6);
});

test('only "man"/"woman" split all 24 into 12|12', () => {
  const perfect = data.QUESTIONS.filter((q) => where(q.id).length === 12).map((q) => q.id);
  assert.deepStrictEqual(perfect.sort(), ['man', 'woman']);
});

test('a woman with a hat never also has a bow (bow would be hidden)', () => {
  where('woman').forEach((id) => {
    const c = data.BY_ID[id];
    assert.ok(!(c.hat && c.bow), id);
  });
});

test('bald people have no hat and no beard (so hair questions are clear)', () => {
  where('bald').forEach((id) => assert.ok(!data.BY_ID[id].hat && !data.BY_ID[id].beard, id));
});

test('no two characters look the same to the question list', () => {
  const sigs = new Set(ids.map((id) => data.QUESTIONS.map((q) => (q.test(data.BY_ID[id]) ? 1 : 0)).join('')));
  assert.strictEqual(sigs.size, 24);
});

test('recommend() follows the tree', () => {
  assert.strictEqual(data.recommend([]), 'man');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: true }]), 'hat');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: true }, { qid: 'hat', yes: true }]), 'glasses');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: true }, { qid: 'hat', yes: false }]), 'beard');
  assert.strictEqual(data.recommend([{ qid: 'man', yes: false }]), 'earrings');
  assert.strictEqual(data.recommend([{ qid: 'woman', yes: true }, { qid: 'earrings', yes: false }]), 'bow');
  ids.forEach((id) => {
    const path = data.strategyPath(id);
    for (let i = 0; i < path.length; i++) {
      const so = path.slice(0, i).map(([qid, yes]) => ({ qid, yes }));
      assert.strictEqual(data.recommend(so), path[i][0], `${id} step ${i + 1}`);
    }
    assert.strictEqual(data.recommend(path.map(([qid, yes]) => ({ qid, yes }))), null);
  });
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
  assert.strictEqual(game.viewFor(s, 'guest').opp.remaining, 22);
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
  assert.strictEqual(s.players.guest.secret, 'ximena');
  s = game.apply(s, 'host', { type: 'ask', qid: 'man' }).state;
  assert.strictEqual(s.turn, 'host');
  assert.ok(game.apply(s, 'host', { type: 'ask', text: 'Happy?' }).error, 'no typed questions in solo');
  s = game.apply(s, 'host', { type: 'guess', id: 'ximena' }).state;
  assert.strictEqual(s.winner, 'host');
  s = game.apply(s, 'host', { type: 'rematch', random: () => 0 }).state;
  assert.strictEqual(s.phase, 'play');
  assert.strictEqual(s.players.guest.secret, 'arjun');
});

test('strategy hints are only ever sent to the host', () => {
  let s = game.create({ hostName: 'T', hints: true });
  s = game.apply(s, 'guest', { type: 'join', name: 'S' }).state;
  assert.strictEqual(game.viewFor(s, 'host').settings.hints, true);
  assert.strictEqual(game.viewFor(s, 'guest').settings.hints, false);
  assert.ok(game.apply(s, 'guest', { type: 'settings', hints: true }).error, 'guest cannot turn hints on');
});

function confirmGame() {
  let s = game.create({ hostName: 'T', confirmAnswers: true });
  s = game.apply(s, 'guest', { type: 'join', name: 'S' }).state;
  s = game.apply(s, 'host', { type: 'pick', id: 'hiro' }).state;   // glasses, no hat
  s = game.apply(s, 'guest', { type: 'pick', id: 'grace' }).state;
  return s;
}

test('confirm answers: a list question waits until the other player sends the answer', () => {
  let s = confirmGame();
  s = game.apply(s, 'guest', { type: 'ask', qid: 'glasses' }).state;
  assert.deepStrictEqual(s.pending, { seat: 'guest', text: 'Are they wearing glasses?', qid: 'glasses' });
  assert.strictEqual(s.log.length, 0);
  assert.strictEqual(s.turn, 'guest');
  assert.ok(!('yes' in game.viewFor(s, 'guest').pending), 'the asker cannot see the answer early');
  assert.ok(game.apply(s, 'guest', { type: 'answer' }).error, 'asker cannot answer');
  s = game.apply(s, 'host', { type: 'answer' }).state;
  assert.strictEqual(s.pending, null);
  assert.strictEqual(s.log[0].qid, 'glasses');
  assert.strictEqual(s.log[0].yes, true);
  assert.strictEqual(s.turn, 'host');
  assert.strictEqual(s.players.guest.asked, 1);
});

test('confirm answers: the true answer is sent even if the other player taps the wrong one', () => {
  let s = confirmGame();
  s = game.apply(s, 'guest', { type: 'ask', qid: 'hat' }).state;
  s = game.apply(s, 'host', { type: 'answer', yes: true }).state;   // Hiro has no hat
  assert.strictEqual(s.log[0].yes, false);
});

test('confirm answers: turning the setting off answers a waiting list question', () => {
  let s = confirmGame();
  s = game.apply(s, 'guest', { type: 'ask', qid: 'man' }).state;
  s = game.apply(s, 'host', { type: 'settings', confirmAnswers: false }).state;
  assert.strictEqual(s.pending, null);
  assert.strictEqual(s.log[0].yes, true);
  assert.strictEqual(s.turn, 'host');
  s = game.apply(s, 'host', { type: 'ask', qid: 'man' }).state;      // now answered at once
  assert.strictEqual(s.log.length, 2);
});

test('auto-flip is a host setting that both players see', () => {
  let s = game.create({ hostName: 'T' });
  s = game.apply(s, 'guest', { type: 'join', name: 'S' }).state;
  assert.strictEqual(game.viewFor(s, 'guest').settings.autoFlip, false);
  assert.ok(game.apply(s, 'guest', { type: 'settings', autoFlip: true }).error, 'guest cannot change it');
  s = game.apply(s, 'host', { type: 'settings', autoFlip: true }).state;
  assert.strictEqual(game.viewFor(s, 'host').settings.autoFlip, true);
  assert.strictEqual(game.viewFor(s, 'guest').settings.autoFlip, true);
  let solo = game.create({ solo: true });
  solo = game.apply(solo, 'host', { type: 'settings', autoFlip: true }).state;
  assert.strictEqual(game.viewFor(solo, 'host').settings.autoFlip, true);
});

test('confirm answers does not affect solo practice', () => {
  let s = game.create({ solo: true, confirmAnswers: true });
  s = game.apply(s, 'host', { type: 'ask', qid: 'man' }).state;
  assert.strictEqual(s.pending, null);
  assert.strictEqual(s.log.length, 1);
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
