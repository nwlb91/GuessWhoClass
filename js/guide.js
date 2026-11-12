/* Builds the decision tree, decoy summary and trait table on the teacher guide. */
(function () {
  'use strict';
  var data = window.WH.data;
  var avatar = window.WH.avatar;
  var S = data.STRATEGY;
  var Q = data.Q_BY_ID;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- decision tree on a 16-column grid ----------
  // Each tree node covers a contiguous run of leaves. Leaves are ordered so that
  // "yes" branches sit on the left.
  var men = data.BOARD.filter(function (c) { return c.gender === 'man'; });
  var women = data.BOARD.filter(function (c) { return c.gender === 'woman'; });

  function order(list, qids) {
    // sort by the answers to qids: yes before no, most significant first
    return list.slice().sort(function (a, b) {
      for (var i = 0; i < qids.length; i++) {
        var x = Q[qids[i]].test(a) ? 0 : 1, y = Q[qids[i]].test(b) ? 0 : 1;
        if (x !== y) return x - y;
      }
      return 0;
    });
  }
  var leaves = order(men, S.man).concat(order(women, S.woman));

  var tree = document.getElementById('tree');
  function place(node, row, start, span) {
    node.style.gridRow = String(row);
    node.style.gridColumn = (start + 1) + ' / span ' + span;
    tree.appendChild(node);
  }
  function qNode(qid, count, row, start, span) {
    var n = el('div', 'tnode', '<span class="tq">' + Q[qid].label + '</span><span class="tcount">' + count + ' left</span>');
    place(n, row, start, span);
    var br = el('div', 'tbranch', '<span class="ty">yes</span><span class="tn">no</span>');
    place(br, row + 1, start, span);
  }

  qNode('man', 16, 1, 0, 16);
  for (var lvl = 0; lvl < 3; lvl++) {
    var span = 8 >> lvl;
    for (var start = 0; start < 16; start += span) {
      var g = start < 8 ? 'man' : 'woman';
      qNode(S[g][lvl], span, 3 + lvl * 2, start, span);
    }
  }
  leaves.forEach(function (c, i) {
    var leaf = el('div', 'tleaf', '<div class="tface">' + avatar.svg(c, { title: false }) + '</div><b>' + c.name + '</b>');
    place(leaf, 9, i, 1);
  });

  // ---------- decoys ----------
  var decoys = [
    ['hat', 'woman', 'Women in hats'],
    ['glasses', 'woman', 'Women in glasses'],
    ['earrings', 'man', 'Men with earrings'],
    ['necklace', 'man', 'Man with a necklace']
  ];
  var box = document.getElementById('decoys');
  decoys.forEach(function (d) {
    var people = data.BOARD.filter(function (c) { return c.gender === d[1] && Q[d[0]].test(c); });
    var total = data.BOARD.filter(function (c) { return Q[d[0]].test(c); }).length;
    var card = el('div', 'decoy',
      '<div class="decoy-faces">' + people.map(function (c) {
        return '<figure><div class="tface">' + avatar.svg(c, { title: false }) + '</div><figcaption>' + c.name + '</figcaption></figure>';
      }).join('') + '</div>' +
      '<div><b>' + d[2] + '</b><br><span class="muted small">“' + Q[d[0]].label + '” splits the 16 into ' + total + ' | ' + (16 - total) + '</span></div>');
    box.appendChild(card);
  });

  // ---------- trait table ----------
  var cols = ['hat', 'glasses', 'beard', 'earrings', 'necklace', 'bow'];
  var table = document.getElementById('traits');
  var head = '<thead><tr><th></th><th>Name</th><th>Man / woman</th>' +
    cols.map(function (q) { return '<th>' + Q[q].label.replace('?', '') + '</th>'; }).join('') + '</tr></thead>';
  var body = '<tbody>' + leaves.map(function (c) {
    var keySet = S[c.gender];
    return '<tr><td><div class="tface tiny">' + avatar.svg(c, { title: false }) + '</div></td><td><b>' + c.name + '</b></td><td>' + c.gender + '</td>' +
      cols.map(function (q) {
        if (!Q[q].test(c)) return '<td></td>';
        var key = keySet.indexOf(q) >= 0;
        return '<td><span class="' + (key ? 'key-dot' : 'decoy-dot') + '" title="' + (key ? 'strategy feature' : 'decoy') + '"></span></td>';
      }).join('') + '</tr>';
  }).join('') + '</tbody>';
  table.innerHTML = head + body;
})();
