/* Builds the decision tree, first-question splits and path table on the teacher guide. */
(function () {
  'use strict';
  var data = window.WH.data;
  var avatar = window.WH.avatar;
  var Q = data.Q_BY_ID;
  var TREE = data.STRATEGY.tree;
  var TOTAL = data.BOARD.length;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function face(id, cls) {
    return '<div class="tface' + (cls ? ' ' + cls : '') + '">' + avatar.svg(data.BY_ID[id], { title: false }) + '</div>';
  }

  // ---------- decision tree ----------
  // Each subtree is drawn on a grid with one column per person. A question sits
  // over the columns of everyone it still has to tell apart; a bracket under it
  // runs from the middle of its "yes" people to the middle of its "no" people.
  function drawTree(container, node) {
    var cols = data.leavesOf(node).length;
    container.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(58px, 1fr))';
    container.style.minWidth = (cols * 62) + 'px';
    function place(item, row, start, span) {
      item.style.gridRow = String(row);
      item.style.gridColumn = (start + 1) + ' / span ' + span;
      container.appendChild(item);
    }
    (function walk(n, depth, start) {
      if (data.isLeaf(n)) {
        var c = data.BY_ID[n];
        place(el('div', 'tleaf', face(n) + '<b>' + c.name + '</b><span class="tdepth">' + depth + ' questions</span>'),
          depth * 2 + 1, start, 1);
        return;
      }
      var y = data.leavesOf(n.yes).length;
      var no = data.leavesOf(n.no).length;
      var span = y + no;
      place(el('div', 'tnode', '<span class="tq">' + Q[n.q].label + '</span><span class="tcount">' + span + ' left</span>'),
        depth * 2 + 1, start, span);
      var br = el('div', 'tbranch', '<span class="ty">yes</span><span class="tn">no</span>');
      br.style.marginLeft = ((y / 2) / span * 100) + '%';
      br.style.marginRight = ((no / 2) / span * 100) + '%';
      place(br, depth * 2 + 2, start, span);
      walk(n.yes, depth + 1, start);
      walk(n.no, depth + 1, start + y);
    })(node, 1, 0);
  }
  drawTree(document.getElementById('tree-men'), TREE.yes);
  drawTree(document.getElementById('tree-women'), TREE.no);

  // ---------- tempting first questions ----------
  var ids = data.BOARD.map(function (c) { return c.id; });
  var tempting = ['man', 'hat', 'earrings', 'hair-black', 'glasses', 'necklace', 'teeth', 'beard', 'bow', 'tie', 'freckles'];
  var box = document.getElementById('first-splits');
  box.innerHTML = tempting.map(function (qid) {
    var sp = data.split(qid, ids);
    var perfect = sp.yes === sp.no;
    return '<div class="fs-row' + (perfect ? ' perfect' : '') + '"><span class="fs-q">' + Q[qid].label + '</span>' +
      '<span class="fs-bar"><span class="fs-yes" style="width:' + (sp.yes / TOTAL * 100) + '%">' + sp.yes + '</span>' +
      '<span class="fs-no">' + sp.no + '</span></span>' +
      '<span class="fs-note">' + (perfect ? 'perfect half' : 'flips down ' + Math.min(sp.yes, sp.no) + ' or ' + Math.max(sp.yes, sp.no)) + '</span></div>';
  }).join('');

  // ---------- each person's path ----------
  var table = document.getElementById('paths');
  var rows = data.leavesOf(TREE).map(function (id) {
    var c = data.BY_ID[id];
    var path = data.strategyPath(id);
    var chips = path.map(function (p) {
      return '<span class="pchip ' + (p[1] ? 'yes' : 'no') + '">' + Q[p[0]].label.replace('?', '') + ' ' + (p[1] ? '✓' : '✗') + '</span>';
    }).join('<span class="parrow">›</span>');
    return '<tr><td>' + face(id, 'tiny') + '</td><td><b>' + c.name + '</b></td><td class="ptd">' + chips + '</td><td>' + path.length + '</td></tr>';
  }).join('');
  table.innerHTML = '<thead><tr><th></th><th>Name</th><th>Questions that find them</th><th>#</th></tr></thead><tbody>' + rows + '</tbody>';
})();
