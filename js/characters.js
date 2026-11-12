/*
 * The cast, the yes/no questions, and the halving strategy.
 *
 * The 24 people are built around a decision tree (STRATEGY.tree) in which
 * every question depends on all the answers before it, and every question
 * splits the people still possible as evenly as it can:
 *
 *   24 -> 12 -> 6 -> 3 -> 1 or 2 -> 1
 *
 * So the mystery person is always found in 5 questions or fewer (8 people in
 * 4, the other 16 in 5). 24 isn't a power of two, so a group of 3 can only be
 * split 1 | 2. Four yes/no questions can only tell apart 2^4 = 16 people;
 * five can tell apart 2^5 = 32.
 *
 *   Is it a man?
 *     yes: Hat?
 *       yes: Glasses?   -> yes: Beard?      no: Earrings?
 *       no:  Beard?     -> yes: Gray hair?  no: Bald?
 *     no: Earrings?
 *       yes: Hat?       -> yes: Necklace?   no: Glasses?
 *       no:  Bow?       -> yes: Black hair? no: Red hair?
 *   ...and with two people left, one last question tells them apart.
 *
 * To stop players stumbling into halving by luck, the tree's question is the
 * ONLY menu question that splits each big group (24, 12 or 6 people) exactly
 * in half. Every other question splits those groups unevenly (like 4|8 or
 * 2|4), and there are 32 questions to choose from. Hats, glasses, earrings
 * and necklaces also turn up as decoys where the tree never asks about them.
 */
(function (root) {
  'use strict';

  // Traits: hat, glasses, beard, earrings, necklace, bow, tie, badge, stripes/dots (shirt
  // pattern), teeth (big toothy smile), freckles, bandage, headphones, headband, flower,
  // plus hair and shirt colors.
  // The tree's question is the only one that splits each big group (24, 12 or 6
  // people) exactly in half; every other question splits those groups unevenly.
  var CHARACTERS = [
    // ---- Men ----
    // man > hat > glasses > beard
    { id: 'arjun', name: 'Arjun', gender: 'man', skin: 'brown', hair: 'black', hairStyle: 'short',
      hat: 'fedora', hatColor: '#6B4F3A', glasses: 'rect', beard: true, shirt: 'teal' },
    // man > hat > glasses > no beard > striped shirt
    { id: 'quincy', name: 'Quincy', gender: 'man', skin: 'dark', hair: 'brown', hairStyle: 'short',
      hat: 'cap', hatColor: '#3E7FDB', glasses: 'round', shirt: 'orange', pattern: 'stripes' },
    // man > hat > glasses > no beard > no stripes
    { id: 'nate', name: 'Nate', gender: 'man', skin: 'light', hair: 'blonde', hairStyle: 'sidepart',
      hat: 'tophat', hatColor: '#34344A', glasses: 'round', shirt: 'blue', tie: '#E2504F', freckles: true },
    // man > hat > no glasses > no earrings > freckles
    { id: 'felix', name: 'Felix', gender: 'man', skin: 'light', hair: 'red', hairStyle: 'short',
      hat: 'beanie', hatColor: '#F0873A', shirt: 'green', freckles: true, teeth: true },
    // man > hat > no glasses > earrings
    { id: 'jamal', name: 'Jamal', gender: 'man', skin: 'dark', hair: 'black', hairStyle: 'short',
      hat: 'cap', hatColor: '#E2504F', shirt: 'yellow', earrings: 'stud', badge: true, teeth: true },
    // man > hat > no glasses > no earrings > no freckles
    { id: 'victor', name: 'Victor', gender: 'man', skin: 'lightMed', hair: 'gray', hairStyle: 'short',
      hat: 'fedora', hatColor: '#7D7F88', shirt: 'blue', necklace: 'chain', pattern: 'dots' },
    // man > no hat > beard > gray hair
    { id: 'omar', name: 'Omar', gender: 'man', skin: 'medium', hair: 'gray', hairStyle: 'sidepart',
      beard: true, shirt: 'pink', tie: '#3E7FDB' },
    // man > no hat > no beard > not bald
    { id: 'hiro', name: 'Hiro', gender: 'man', skin: 'lightMed', hair: 'black', hairStyle: 'spiky',
      glasses: 'round', shirt: 'red', pattern: 'stripes', teeth: true },
    // man > no hat > no beard > bald > no necklace
    { id: 'tariq', name: 'Tariq', gender: 'man', skin: 'tan', hair: null, hairStyle: 'bald',
      shirt: 'yellow', bandage: true, headphones: '#22AFAE' },
    // man > no hat > beard > not gray > no tie
    { id: 'carlos', name: 'Carlos', gender: 'man', skin: 'tan', hair: 'brown', hairStyle: 'curly',
      beard: true, shirt: 'orange', earrings: 'stud', badge: true, headband: '#E2504F' },
    // man > no hat > beard > not gray > tie
    { id: 'sanjay', name: 'Sanjay', gender: 'man', skin: 'brown', hair: 'black', hairStyle: 'sidepart',
      beard: true, shirt: 'green', earrings: 'stud', tie: '#8C5AD6' },
    // man > no hat > no beard > bald > necklace
    { id: 'kofi', name: 'Kofi', gender: 'man', skin: 'dark', hair: null, hairStyle: 'bald',
      shirt: 'purple', necklace: 'chain', pattern: 'dots' },

    // ---- Women ----
    // woman > earrings > no hat > no glasses > purple shirt
    { id: 'elena', name: 'Elena', gender: 'woman', skin: 'light', hair: 'brown', hairStyle: 'wavy',
      earrings: 'hoop', necklace: 'pearls', shirt: 'purple', badge: true, flower: '#F9C6DD' },
    // woman > earrings > no hat > no glasses > not purple
    { id: 'rosa', name: 'Rosa', gender: 'woman', skin: 'medium', hair: 'black', hairStyle: 'bob',
      earrings: 'drop', earringColor: '#3DAA66', shirt: 'red', pattern: 'stripes', teeth: true, headband: '#F3C233' },
    // woman > earrings > hat > necklace
    { id: 'priya', name: 'Priya', gender: 'woman', skin: 'brown', hair: 'black', hairStyle: 'long',
      earrings: 'drop', earringColor: '#E2504F', necklace: 'gold', shirt: 'yellow',
      hat: 'sunhat', hatColor: '#F2DCA6' },
    // woman > earrings > no hat > glasses
    { id: 'lucia', name: 'Lucia', gender: 'woman', skin: 'tan', hair: 'brown', hairStyle: 'ponytail',
      earrings: 'hoop', bow: '#E2504F', shirt: 'green', glasses: 'round', teeth: true },
    // woman > earrings > hat > no necklace > no polka dots
    { id: 'bianca', name: 'Bianca', gender: 'woman', skin: 'light', hair: 'blonde', hairStyle: 'bob',
      earrings: 'drop', earringColor: '#3E7FDB', shirt: 'red', hat: 'beanie', hatColor: '#8C5AD6', freckles: true },
    // woman > earrings > hat > no necklace > polka dots
    { id: 'ximena', name: 'Ximena', gender: 'woman', skin: 'tan', hair: 'blonde', hairStyle: 'long',
      earrings: 'hoop', shirt: 'pink', pattern: 'dots', hat: 'cap', hatColor: '#22AFAE' },
    // woman > no earrings > bow > black hair > not blue shirt
    { id: 'imani', name: 'Imani', gender: 'woman', skin: 'dark', hair: 'black', hairStyle: 'afro',
      necklace: 'turquoise', bow: '#F3C233', shirt: 'orange', badge: true, teeth: true },
    // woman > no earrings > no bow > not red hair
    { id: 'dara', name: 'Dara', gender: 'woman', skin: 'medium', hair: 'gray', hairStyle: 'long',
      necklace: 'pearls', shirt: 'teal', bandage: true },
    // woman > no earrings > no bow > red hair > no glasses
    { id: 'wren', name: 'Wren', gender: 'woman', skin: 'lightMed', hair: 'red', hairStyle: 'ponytail',
      shirt: 'purple', pattern: 'stripes', freckles: true, headphones: '#3E7FDB' },
    // woman > no earrings > bow > black hair > blue shirt
    { id: 'mei', name: 'Mei', gender: 'woman', skin: 'lightMed', hair: 'black', hairStyle: 'bun',
      bow: '#8C5AD6', shirt: 'blue', pattern: 'stripes', bandage: true },
    // woman > no earrings > bow > not black hair
    { id: 'uma', name: 'Uma', gender: 'woman', skin: 'light', hair: 'blonde', hairStyle: 'long',
      bow: '#F0873A', shirt: 'teal', tie: '#E2504F' },
    // woman > no earrings > no bow > red hair > glasses
    { id: 'grace', name: 'Grace', gender: 'woman', skin: 'light', hair: 'red', hairStyle: 'wavy',
      shirt: 'pink', glasses: 'rect', pattern: 'dots', flower: '#FFFFFF' }
  ];

  // Board order: alphabetical (A..X), which hides the structure above.
  var BOARD = CHARACTERS.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  var BY_ID = {};
  CHARACTERS.forEach(function (c) { BY_ID[c.id] = c; });

  function has(v) { return v !== undefined && v !== null && v !== false; }

  var HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'gray'];
  var SHIRT_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

  // Every question that can be asked from the menu. `test` answers it for a character.
  var QUESTIONS = [
    { id: 'man', group: 'Person', label: 'Man?', text: 'Is it a man?',
      test: function (c) { return c.gender === 'man'; } },
    { id: 'woman', group: 'Person', label: 'Woman?', text: 'Is it a woman?',
      test: function (c) { return c.gender === 'woman'; } },

    { id: 'hat', group: 'Head & face', label: 'Hat?', text: 'Are they wearing a hat?',
      test: function (c) { return has(c.hat); } },
    { id: 'glasses', group: 'Head & face', label: 'Glasses?', text: 'Are they wearing glasses?',
      test: function (c) { return has(c.glasses); } },
    { id: 'earrings', group: 'Head & face', label: 'Earrings?', text: 'Are they wearing earrings?',
      test: function (c) { return has(c.earrings); } },
    { id: 'bow', group: 'Head & face', label: 'Bow in hair?', text: 'Do they have a bow in their hair?',
      test: function (c) { return has(c.bow); } },
    { id: 'beard', group: 'Head & face', label: 'Beard?', text: 'Do they have a beard?',
      test: function (c) { return !!c.beard; } },
    { id: 'bald', group: 'Head & face', label: 'Bald?', text: 'Are they bald?',
      test: function (c) { return c.hairStyle === 'bald'; } },
    { id: 'freckles', group: 'Head & face', label: 'Freckles?', text: 'Do they have freckles?',
      test: function (c) { return !!c.freckles; } },
    { id: 'teeth', group: 'Head & face', label: 'Big smile?', text: 'Are they smiling so you can see their teeth?',
      test: function (c) { return !!c.teeth; } },
    { id: 'bandage', group: 'Head & face', label: 'Bandage?', text: 'Do they have a bandage on their face?',
      test: function (c) { return !!c.bandage; } },
    { id: 'headphones', group: 'Head & face', label: 'Headphones?', text: 'Are they wearing headphones?',
      test: function (c) { return has(c.headphones); } },
    { id: 'headband', group: 'Head & face', label: 'Headband?', text: 'Are they wearing a headband?',
      test: function (c) { return has(c.headband); } },
    { id: 'flower', group: 'Head & face', label: 'Flower in hair?', text: 'Do they have a flower in their hair?',
      test: function (c) { return has(c.flower); } },

    { id: 'necklace', group: 'Neck & shirt', label: 'Necklace?', text: 'Are they wearing a necklace?',
      test: function (c) { return has(c.necklace); } },
    { id: 'tie', group: 'Neck & shirt', label: 'Tie?', text: 'Are they wearing a tie?',
      test: function (c) { return has(c.tie); } },
    { id: 'badge', group: 'Neck & shirt', label: 'Star badge?', text: 'Are they wearing a star badge?',
      test: function (c) { return !!c.badge; } },
    { id: 'stripes', group: 'Neck & shirt', label: 'Striped shirt?', text: 'Are they wearing a striped shirt?',
      test: function (c) { return c.pattern === 'stripes'; } },
    { id: 'dots', group: 'Neck & shirt', label: 'Polka dots?', text: 'Are they wearing a polka-dot shirt?',
      test: function (c) { return c.pattern === 'dots'; } }
  ];

  HAIR_COLORS.forEach(function (color) {
    QUESTIONS.push({ id: 'hair-' + color, group: 'Hair color', label: cap(color) + ' hair?',
      text: 'Is their hair ' + color + '?', swatch: color, swatchType: 'hair',
      test: function (c) { return c.hair === color; } });
  });
  SHIRT_COLORS.forEach(function (color) {
    QUESTIONS.push({ id: 'shirt-' + color, group: 'Shirt color', label: cap(color) + ' shirt?',
      text: 'Is their shirt ' + color + '?', swatch: color, swatchType: 'shirt',
      test: function (c) { return c.shirt === color; } });
  });

  var Q_BY_ID = {};
  QUESTIONS.forEach(function (q) { Q_BY_ID[q.id] = q; });

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- The halving strategy: a decision tree ----
  // Each node asks `q`; `yes` / `no` lead to the next node, or to a character id.
  var TREE = {
    q: 'man',
    yes: { q: 'hat',
      yes: { q: 'glasses',
        yes: { q: 'beard', yes: 'arjun', no: { q: 'stripes', yes: 'quincy', no: 'nate' } },
        no: { q: 'earrings', yes: 'jamal', no: { q: 'freckles', yes: 'felix', no: 'victor' } } },
      no: { q: 'beard',
        yes: { q: 'hair-gray', yes: 'omar', no: { q: 'tie', yes: 'sanjay', no: 'carlos' } },
        no: { q: 'bald', yes: { q: 'necklace', yes: 'kofi', no: 'tariq' }, no: 'hiro' } } },
    no: { q: 'earrings',
      yes: { q: 'hat',
        yes: { q: 'necklace', yes: 'priya', no: { q: 'dots', yes: 'ximena', no: 'bianca' } },
        no: { q: 'glasses', yes: 'lucia', no: { q: 'shirt-purple', yes: 'elena', no: 'rosa' } } },
      no: { q: 'bow',
        yes: { q: 'hair-black', yes: { q: 'shirt-blue', yes: 'mei', no: 'imani' }, no: 'uma' },
        no: { q: 'hair-red', yes: { q: 'glasses', yes: 'grace', no: 'wren' }, no: 'dara' } } }
  };

  var STRATEGY = { tree: TREE };

  function isLeaf(node) { return typeof node === 'string'; }

  /** All character ids under a tree node (yes-side first). */
  function leavesOf(node) {
    return isLeaf(node) ? [node] : leavesOf(node.yes).concat(leavesOf(node.no));
  }

  /** The most questions halving can need: ceil(log2(number of people)). */
  var MAX_QUESTIONS = Math.ceil(Math.log(BOARD.length) / Math.LN2);

  /** Characters (ids) still possible given a list of {qid, yes} answers. */
  function candidates(answers, pool) {
    pool = pool || BOARD.map(function (c) { return c.id; });
    return pool.filter(function (id) {
      var c = BY_ID[id];
      return answers.every(function (a) {
        var q = Q_BY_ID[a.qid];
        return !q || q.test(c) === a.yes;
      });
    });
  }

  /** How a question splits a set of candidate ids: {yes: n, no: n}. */
  function split(qid, ids) {
    var q = Q_BY_ID[qid];
    var yes = 0;
    ids.forEach(function (id) { if (q.test(BY_ID[id])) yes++; });
    return { yes: yes, no: ids.length - yes };
  }

  /** True when going from `before` to `after` people was as close to half as possible. */
  function isHalving(before, after) {
    return after === Math.floor(before / 2) || after === Math.ceil(before / 2);
  }

  /** The tree node whose people are exactly `ids`, if any. */
  function nodeFor(ids, node) {
    node = node || TREE;
    if (isLeaf(node)) return null;
    var under = leavesOf(node);
    if (under.length < ids.length) return null;
    if (under.length === ids.length) {
      return under.every(function (id) { return ids.indexOf(id) >= 0; }) ? node : null;
    }
    return nodeFor(ids, node.yes) || nodeFor(ids, node.no);
  }

  /**
   * Recommend the next question: the tree's question when the people still
   * possible match a point in the tree, otherwise whichever menu question
   * splits them most evenly.
   */
  function recommend(answers) {
    var ids = candidates(answers);
    if (ids.length <= 1) return null;
    var node = nodeFor(ids);
    if (node) return node.q;
    var asked = {};
    answers.forEach(function (a) { asked[a.qid] = true; });
    var best = null;
    var bestScore = 0;
    QUESTIONS.forEach(function (q) {
      if (asked[q.id]) return;
      var sp = split(q.id, ids);
      var score = Math.min(sp.yes, sp.no);
      if (score > bestScore) { best = q.id; bestScore = score; }
    });
    return best;
  }

  /**
   * The questions the tree asks to find a character, e.g.
   * [['man', true], ['hat', false], ['beard', false], ['bald', false]].
   */
  function strategyPath(id) {
    var path = [];
    var node = TREE;
    while (!isLeaf(node)) {
      var yes = leavesOf(node.yes).indexOf(id) >= 0;
      path.push([node.q, yes]);
      node = yes ? node.yes : node.no;
    }
    return path;
  }

  var api = {
    CHARACTERS: CHARACTERS,
    BOARD: BOARD,
    BY_ID: BY_ID,
    QUESTIONS: QUESTIONS,
    Q_BY_ID: Q_BY_ID,
    HAIR_COLORS: HAIR_COLORS,
    SHIRT_COLORS: SHIRT_COLORS,
    STRATEGY: STRATEGY,
    MAX_QUESTIONS: MAX_QUESTIONS,
    isLeaf: isLeaf,
    leavesOf: leavesOf,
    nodeFor: nodeFor,
    candidates: candidates,
    split: split,
    isHalving: isHalving,
    recommend: recommend,
    strategyPath: strategyPath
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WH = root.WH || {}; root.WH.data = api; }
})(this);
