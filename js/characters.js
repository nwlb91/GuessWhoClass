/*
 * The cast, the yes/no questions, and the halving strategy.
 *
 * The 16 people are built so that a perfect "binary search" always finds the
 * mystery person in exactly 4 questions:
 *
 *   1. Is it a man?                      16 -> 8
 *   2. Men: hat?      Women: earrings?    8 -> 4
 *   3. Men: glasses?  Women: necklace?    4 -> 2
 *   4. Men: beard?    Women: bow?         2 -> 1
 *
 * Among the 8 men, every combination of hat / glasses / beard appears exactly
 * once; among the 8 women, every combination of earrings / necklace / bow
 * appears exactly once. So each of those questions cuts the group in half no
 * matter what order you ask them in.
 *
 * Decoys keep the pattern from being obvious: 3 women wear hats, 3 women wear
 * glasses, 2 men wear earrings, and 1 man wears a chain necklace.
 */
(function (root) {
  'use strict';

  var CHARACTERS = [
    // ---- Men: hat / glasses / beard (all 8 combinations) ----
    { id: 'arjun', name: 'Arjun', gender: 'man', skin: 'brown', hair: 'black', hairStyle: 'short',
      hat: 'fedora', hatColor: '#6B4F3A', glasses: 'rect', beard: true, shirt: 'teal' },
    { id: 'nate', name: 'Nate', gender: 'man', skin: 'light', hair: 'blonde', hairStyle: 'sidepart',
      hat: 'tophat', hatColor: '#34344A', glasses: 'round', beard: false, shirt: 'blue' },
    { id: 'felix', name: 'Felix', gender: 'man', skin: 'light', hair: 'red', hairStyle: 'short',
      hat: 'beanie', hatColor: '#F0873A', glasses: null, beard: true, shirt: 'green' },
    { id: 'jamal', name: 'Jamal', gender: 'man', skin: 'dark', hair: 'black', hairStyle: 'short',
      hat: 'cap', hatColor: '#E2504F', glasses: null, beard: false, shirt: 'yellow',
      earrings: 'stud' },                                   // decoy: a man with earrings
    { id: 'omar', name: 'Omar', gender: 'man', skin: 'medium', hair: 'gray', hairStyle: 'sidepart',
      hat: null, glasses: 'rect', beard: true, shirt: 'pink' },
    { id: 'hiro', name: 'Hiro', gender: 'man', skin: 'lightMed', hair: 'black', hairStyle: 'spiky',
      hat: null, glasses: 'round', beard: false, shirt: 'red' },
    { id: 'carlos', name: 'Carlos', gender: 'man', skin: 'tan', hair: 'brown', hairStyle: 'curly',
      hat: null, glasses: null, beard: true, shirt: 'orange',
      earrings: 'stud' },                                   // decoy: a man with earrings
    { id: 'kofi', name: 'Kofi', gender: 'man', skin: 'dark', hair: null, hairStyle: 'bald',
      hat: null, glasses: null, beard: false, shirt: 'purple',
      necklace: 'chain' },                                  // decoy: a man with a necklace

    // ---- Women: earrings / necklace / bow (all 8 combinations) ----
    { id: 'elena', name: 'Elena', gender: 'woman', skin: 'light', hair: 'brown', hairStyle: 'wavy',
      earrings: 'hoop', necklace: 'pearls', bow: '#EB6EA9', shirt: 'purple' },
    { id: 'priya', name: 'Priya', gender: 'woman', skin: 'brown', hair: 'black', hairStyle: 'long',
      earrings: 'drop', earringColor: '#E2504F', necklace: 'gold', bow: null, shirt: 'yellow',
      hat: 'sunhat', hatColor: '#F2DCA6' },                 // decoy: a woman with a hat
    { id: 'lucia', name: 'Lucia', gender: 'woman', skin: 'tan', hair: 'brown', hairStyle: 'ponytail',
      earrings: 'hoop', necklace: null, bow: '#E2504F', shirt: 'green',
      glasses: 'round' },                                   // decoy: a woman with glasses
    { id: 'bianca', name: 'Bianca', gender: 'woman', skin: 'light', hair: 'blonde', hairStyle: 'bob',
      earrings: 'drop', earringColor: '#3E7FDB', necklace: null, bow: null, shirt: 'red',
      hat: 'beanie', hatColor: '#8C5AD6' },                 // decoy: a woman with a hat
    { id: 'imani', name: 'Imani', gender: 'woman', skin: 'dark', hair: 'black', hairStyle: 'afro',
      earrings: null, necklace: 'turquoise', bow: '#F3C233', shirt: 'orange' },
    { id: 'dara', name: 'Dara', gender: 'woman', skin: 'medium', hair: 'gray', hairStyle: 'long',
      earrings: null, necklace: 'pearls', bow: null, shirt: 'teal',
      hat: 'beret', hatColor: '#E2504F',                    // decoy: a woman with a hat
      glasses: 'rect' },                                    // decoy: a woman with glasses
    { id: 'mei', name: 'Mei', gender: 'woman', skin: 'lightMed', hair: 'black', hairStyle: 'bun',
      earrings: null, necklace: null, bow: '#8C5AD6', shirt: 'blue' },
    { id: 'grace', name: 'Grace', gender: 'woman', skin: 'light', hair: 'red', hairStyle: 'wavy',
      earrings: null, necklace: null, bow: null, shirt: 'pink',
      glasses: 'rect' }                                     // decoy: a woman with glasses
  ];

  // Board order: alphabetical (A..P), which hides the structure above.
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

  // ---- The halving strategy ----
  var STRATEGY = {
    first: 'man',
    man: ['hat', 'glasses', 'beard'],
    woman: ['earrings', 'necklace', 'bow'],
    mnemonic: {
      man: 'Hat, Glasses, Beard: read his face from the top down.',
      woman: 'Earrings, Necklace, then tie it up with a Bow (like wrapping a present).'
    }
  };

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

  /**
   * Recommend the next question: the strategy's question if it still halves the
   * remaining people, otherwise whichever menu question splits them most evenly.
   */
  function recommend(answers) {
    var ids = candidates(answers);
    if (ids.length <= 1) return null;
    var asked = {};
    answers.forEach(function (a) { asked[a.qid] = true; });

    var preferred = [];
    var genders = {};
    ids.forEach(function (id) { genders[BY_ID[id].gender] = true; });
    if (genders.man && genders.woman) preferred.push(STRATEGY.first);
    else preferred = STRATEGY[genders.man ? 'man' : 'woman'].slice();

    function score(qid) {
      var s = split(qid, ids);
      return Math.min(s.yes, s.no);
    }
    var best = null;
    var bestScore = 0;
    preferred.concat(QUESTIONS.map(function (q) { return q.id; })).forEach(function (qid) {
      if (asked[qid]) return;
      var sc = score(qid);
      if (sc > bestScore) { best = qid; bestScore = sc; }
    });
    return best;
  }

  /** The path of a character through the strategy tree, e.g. [['man',true],['hat',false],...]. */
  function strategyPath(id) {
    var c = BY_ID[id];
    var isMan = c.gender === 'man';
    var path = [['man', isMan]];
    STRATEGY[isMan ? 'man' : 'woman'].forEach(function (qid) {
      path.push([qid, Q_BY_ID[qid].test(c)]);
    });
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
    candidates: candidates,
    split: split,
    recommend: recommend,
    strategyPath: strategyPath
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WH = root.WH || {}; root.WH.data = api; }
})(this);
