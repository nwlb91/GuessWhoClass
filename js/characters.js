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
 * Decoys keep the pattern from being obvious: hats, glasses, earrings,
 * necklaces and striped shirts also turn up where they are never asked about.
 */
(function (root) {
  'use strict';

  var CHARACTERS = [
    // ---- Men ----
    // man > hat > glasses > beard > (striped shirt?)
    { id: 'arjun', name: 'Arjun', gender: 'man', skin: 'brown', hair: 'black', hairStyle: 'short',
      hat: 'fedora', hatColor: '#6B4F3A', glasses: 'rect', beard: true, shirt: 'teal' },
    { id: 'quincy', name: 'Quincy', gender: 'man', skin: 'dark', hair: 'brown', hairStyle: 'short',
      hat: 'cap', hatColor: '#3E7FDB', glasses: 'round', beard: true, shirt: 'orange', stripes: true },
    // man > hat > glasses > no beard
    { id: 'nate', name: 'Nate', gender: 'man', skin: 'light', hair: 'blonde', hairStyle: 'sidepart',
      hat: 'tophat', hatColor: '#34344A', glasses: 'round', beard: false, shirt: 'blue' },
    // man > hat > no glasses > no earrings > (red hair?)
    { id: 'felix', name: 'Felix', gender: 'man', skin: 'light', hair: 'red', hairStyle: 'short',
      hat: 'beanie', hatColor: '#F0873A', glasses: null, beard: true, shirt: 'green' },
    // man > hat > no glasses > earrings  /  > no earrings > (not red hair)
    { id: 'jamal', name: 'Jamal', gender: 'man', skin: 'dark', hair: 'black', hairStyle: 'short',
      hat: 'cap', hatColor: '#E2504F', glasses: null, beard: false, shirt: 'yellow',
      earrings: 'stud' },                                   // decoy: a man with earrings
    { id: 'victor', name: 'Victor', gender: 'man', skin: 'lightMed', hair: 'gray', hairStyle: 'short',
      hat: 'fedora', hatColor: '#7D7F88', glasses: null, beard: false, shirt: 'blue', stripes: true,
      necklace: 'chain' },                                  // decoy: a man with a necklace
    // man > no hat > beard > gray hair
    { id: 'omar', name: 'Omar', gender: 'man', skin: 'medium', hair: 'gray', hairStyle: 'sidepart',
      hat: null, glasses: 'rect', beard: true, shirt: 'pink' },
    // man > no hat > no beard > not bald  /  > bald > (no necklace)
    { id: 'hiro', name: 'Hiro', gender: 'man', skin: 'lightMed', hair: 'black', hairStyle: 'spiky',
      hat: null, glasses: 'round', beard: false, shirt: 'red', stripes: true },
    { id: 'tariq', name: 'Tariq', gender: 'man', skin: 'tan', hair: null, hairStyle: 'bald',
      hat: null, glasses: 'rect', beard: false, shirt: 'yellow' },
    // man > no hat > beard > not gray > (black hair?)
    { id: 'carlos', name: 'Carlos', gender: 'man', skin: 'tan', hair: 'brown', hairStyle: 'curly',
      hat: null, glasses: null, beard: true, shirt: 'orange',
      earrings: 'stud' },                                   // decoy: a man with earrings
    { id: 'sanjay', name: 'Sanjay', gender: 'man', skin: 'brown', hair: 'black', hairStyle: 'sidepart',
      hat: null, glasses: null, beard: true, shirt: 'green', stripes: true,
      earrings: 'stud' },                                   // decoy: a man with earrings
    // man > no hat > no beard > bald > (necklace)
    { id: 'kofi', name: 'Kofi', gender: 'man', skin: 'dark', hair: null, hairStyle: 'bald',
      hat: null, glasses: null, beard: false, shirt: 'purple',
      necklace: 'chain' },                                  // decoy: a man with a necklace

    // ---- Women ----
    // woman > earrings > no hat > no glasses > (purple shirt?)
    { id: 'elena', name: 'Elena', gender: 'woman', skin: 'light', hair: 'brown', hairStyle: 'wavy',
      earrings: 'hoop', necklace: 'pearls', bow: '#EB6EA9', shirt: 'purple' },
    { id: 'rosa', name: 'Rosa', gender: 'woman', skin: 'medium', hair: 'black', hairStyle: 'bob',
      earrings: 'drop', earringColor: '#3DAA66', necklace: 'gold', bow: '#3E7FDB', shirt: 'red', stripes: true },
    // woman > earrings > hat > necklace
    { id: 'priya', name: 'Priya', gender: 'woman', skin: 'brown', hair: 'black', hairStyle: 'long',
      earrings: 'drop', earringColor: '#E2504F', necklace: 'gold', bow: null, shirt: 'yellow',
      hat: 'sunhat', hatColor: '#F2DCA6' },                 // decoy: a woman with a hat
    // woman > earrings > no hat > glasses
    { id: 'lucia', name: 'Lucia', gender: 'woman', skin: 'tan', hair: 'brown', hairStyle: 'ponytail',
      earrings: 'hoop', necklace: null, bow: '#E2504F', shirt: 'green',
      glasses: 'round' },                                   // decoy: a woman with glasses
    // woman > earrings > hat > no necklace > (blonde hair?)
    { id: 'bianca', name: 'Bianca', gender: 'woman', skin: 'light', hair: 'blonde', hairStyle: 'bob',
      earrings: 'drop', earringColor: '#3E7FDB', necklace: null, bow: null, shirt: 'red',
      hat: 'beanie', hatColor: '#8C5AD6' },                 // decoy: a woman with a hat
    { id: 'ximena', name: 'Ximena', gender: 'woman', skin: 'tan', hair: 'brown', hairStyle: 'long',
      earrings: 'hoop', necklace: null, bow: null, shirt: 'pink', stripes: true,
      hat: 'cap', hatColor: '#22AFAE' },                    // decoy: a woman with a hat
    // woman > no earrings > bow > black hair > (not blue shirt)
    { id: 'imani', name: 'Imani', gender: 'woman', skin: 'dark', hair: 'black', hairStyle: 'afro',
      earrings: null, necklace: 'turquoise', bow: '#F3C233', shirt: 'orange' },
    // woman > no earrings > no bow > not red hair  /  > red hair > (no glasses)
    { id: 'dara', name: 'Dara', gender: 'woman', skin: 'medium', hair: 'gray', hairStyle: 'long',
      earrings: null, necklace: 'pearls', bow: null, shirt: 'teal',
      hat: 'beret', hatColor: '#E2504F',                    // decoy: a woman with a hat
      glasses: 'rect' },                                    // decoy: a woman with glasses
    { id: 'wren', name: 'Wren', gender: 'woman', skin: 'lightMed', hair: 'red', hairStyle: 'ponytail',
      earrings: null, necklace: 'coral', bow: null, shirt: 'purple', stripes: true },
    // woman > no earrings > bow > black hair > (blue shirt)  /  > not black hair
    { id: 'mei', name: 'Mei', gender: 'woman', skin: 'lightMed', hair: 'black', hairStyle: 'bun',
      earrings: null, necklace: null, bow: '#8C5AD6', shirt: 'blue', stripes: true },
    { id: 'uma', name: 'Uma', gender: 'woman', skin: 'light', hair: 'blonde', hairStyle: 'long',
      earrings: null, necklace: null, bow: '#F0873A', shirt: 'teal',
      glasses: 'round' },                                   // decoy: a woman with glasses
    // woman > no earrings > no bow > red hair > (glasses)
    { id: 'grace', name: 'Grace', gender: 'woman', skin: 'light', hair: 'red', hairStyle: 'wavy',
      earrings: null, necklace: null, bow: null, shirt: 'pink',
      glasses: 'rect' }                                     // decoy: a woman with glasses
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

    { id: 'hat', group: 'Wearing', label: 'Hat?', text: 'Are they wearing a hat?',
      test: function (c) { return has(c.hat); } },
    { id: 'glasses', group: 'Wearing', label: 'Glasses?', text: 'Are they wearing glasses?',
      test: function (c) { return has(c.glasses); } },
    { id: 'earrings', group: 'Wearing', label: 'Earrings?', text: 'Are they wearing earrings?',
      test: function (c) { return has(c.earrings); } },
    { id: 'necklace', group: 'Wearing', label: 'Necklace?', text: 'Are they wearing a necklace?',
      test: function (c) { return has(c.necklace); } },
    { id: 'bow', group: 'Wearing', label: 'Bow in hair?', text: 'Do they have a bow in their hair?',
      test: function (c) { return has(c.bow); } },
    { id: 'stripes', group: 'Wearing', label: 'Striped shirt?', text: 'Are they wearing a striped shirt?',
      test: function (c) { return !!c.stripes; } },

    { id: 'beard', group: 'Face & hair', label: 'Beard?', text: 'Do they have a beard?',
      test: function (c) { return !!c.beard; } },
    { id: 'bald', group: 'Face & hair', label: 'Bald?', text: 'Are they bald?',
      test: function (c) { return c.hairStyle === 'bald'; } }
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
        yes: { q: 'beard', yes: { q: 'stripes', yes: 'quincy', no: 'arjun' }, no: 'nate' },
        no: { q: 'earrings', yes: 'jamal', no: { q: 'hair-red', yes: 'felix', no: 'victor' } } },
      no: { q: 'beard',
        yes: { q: 'hair-gray', yes: 'omar', no: { q: 'hair-black', yes: 'sanjay', no: 'carlos' } },
        no: { q: 'bald', yes: { q: 'necklace', yes: 'kofi', no: 'tariq' }, no: 'hiro' } } },
    no: { q: 'earrings',
      yes: { q: 'hat',
        yes: { q: 'necklace', yes: 'priya', no: { q: 'hair-blonde', yes: 'bianca', no: 'ximena' } },
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
