/*
 * Draws a character as an SVG string. Everything is original, hand-built shapes.
 * viewBox is 0 0 100 110: head centred at (50, 52), shoulders at the bottom.
 */
(function (root) {
  'use strict';

  var SKIN = {
    light: '#F7D7C4', lightMed: '#EDC19F', tan: '#D8A47D',
    medium: '#BC8357', brown: '#8E5A37', dark: '#5E3A23'
  };
  var HAIR = { black: '#2A2523', brown: '#7B4A26', blonde: '#EBC15A', red: '#C9521E', gray: '#BDBDC4' };
  var SHIRT = {
    red: '#E2504F', orange: '#F0873A', yellow: '#F3C233', green: '#3DAA66',
    teal: '#22AFAE', blue: '#3E7FDB', purple: '#8C5AD6', pink: '#EB6EA9'
  };
  var NECKLACE = { pearls: '#FBF7EE', gold: '#E2B02E', turquoise: '#2EC4C0' };
  var GOLD = '#E2B02E';
  var INK = '#2B2B2B';

  function shade(hex, amt) {
    // amt < 0 darkens, > 0 lightens
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) {
      var v = amt < 0 ? c * (1 + amt) : c + (255 - c) * amt;
      return Math.max(0, Math.min(255, Math.round(v)));
    }
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }

  // ---------- hair ----------
  function hairBack(c, col) {
    var s = c.hairStyle, st = shade(col, -0.25);
    var a = 'fill="' + col + '" stroke="' + st + '" stroke-width="0.8"';
    switch (s) {
      case 'long':
        return '<path ' + a + ' d="M27 50 C25 27 37 21 50 21 C63 21 75 27 73 50 L77 98 Q50 104 23 98 Z"/>';
      case 'wavy':
        return '<path ' + a + ' d="M27 50 C24 26 37 20 50 20 C63 20 76 26 73 50 C79 58 72 64 78 72 C84 80 74 86 79 96 Q50 104 21 96 C26 86 16 80 22 72 C28 64 21 58 27 50 Z"/>';
      case 'bob':
        return '<path ' + a + ' d="M26 50 C24 26 37 21 50 21 C63 21 76 26 74 50 L75 76 Q68 80 63 75 L37 75 Q32 80 25 76 Z"/>';
      case 'ponytail':
        return '<path ' + a + ' d="M64 30 C84 26 90 48 82 74 C80 82 74 84 74 76 C78 60 76 46 66 40 Z"/>';
      case 'afro':
        var out = '';
        var pts = [[24, 40], [28, 26], [38, 17], [50, 14], [62, 17], [72, 26], [76, 40], [77, 54], [73, 66], [27, 66], [23, 54]];
        pts.forEach(function (p) { out += '<circle ' + a + ' cx="' + p[0] + '" cy="' + p[1] + '" r="11"/>'; });
        out += '<circle fill="' + col + '" cx="50" cy="44" r="27"/>';
        return out;
      case 'bun':
        return '<circle ' + a + ' cx="50" cy="20" r="10"/>';
      default:
        return '';
    }
  }

  function hairFront(c, col) {
    var st = shade(col, -0.25);
    var a = 'fill="' + col + '" stroke="' + st + '" stroke-width="0.8" stroke-linejoin="round"';
    switch (c.hairStyle) {
      case 'short':
        return '<path ' + a + ' d="M30 53 C27 31 38 24 50 24 C62 24 73 31 70 53 C69 45 67 40 63 37 C56 39 45 39 37 37 C33 40 31 46 30 53 Z"/>';
      case 'sidepart':
        return '<path ' + a + ' d="M30 53 C27 30 38 23 50 23 C62 23 73 30 70 53 C69 45 67 40 64 36 C58 34 50 33 44 36 C40 33 35 36 33 40 C31 44 30 48 30 53 Z"/>' +
          '<path fill="none" stroke="' + st + '" stroke-width="1" d="M44 25 C42 29 42 32 44 36"/>';
      case 'spiky':
        return '<path ' + a + ' d="M30 53 C28 40 30 32 33 29 L31 19 L40 25 L43 14 L50 23 L57 14 L60 25 L69 19 L67 29 C70 32 72 40 70 53 C69 46 67 41 63 38 C56 40 45 40 37 38 C33 41 31 46 30 53 Z"/>';
      case 'curly':
      case 'afro': {
        var out = '';
        var pts = [[31, 46], [31, 37], [35, 29], [42, 24], [50, 22], [58, 24], [65, 29], [69, 37], [69, 46]];
        pts.forEach(function (p) { out += '<circle ' + a + ' cx="' + p[0] + '" cy="' + p[1] + '" r="6.2"/>'; });
        out += '<path fill="' + col + '" d="M33 46 C33 32 42 27 50 27 C58 27 67 32 67 46 C62 38 56 35 50 35 C44 35 38 38 33 46 Z"/>';
        return out;
      }
      case 'long':
      case 'wavy':
        return '<path ' + a + ' d="M30 52 C27 30 38 23 50 23 C62 23 73 30 70 52 C68 40 60 32 48 33 C41 35 34 42 30 52 Z"/>';
      case 'bob':
        return '<path ' + a + ' d="M30 50 C28 30 38 23 50 23 C62 23 72 30 70 50 C70 44 69 41 68 40 L32 40 C31 42 30 45 30 50 Z"/>';
      case 'ponytail':
      case 'bun':
        return '<path ' + a + ' d="M30 50 C28 30 38 24 50 24 C62 24 72 30 70 50 C68 41 62 35 50 34 C38 35 32 41 30 50 Z"/>';
      case 'bald':
        return '<ellipse cx="41" cy="34" rx="6" ry="3" fill="#FFFFFF" opacity="0.28" transform="rotate(-25 41 34)"/>';
      default:
        return '';
    }
  }

  // Long-haired styles drape locks over the shoulders.
  function hairLocks(c, col) {
    var st = shade(col, -0.25);
    var a = 'fill="' + col + '" stroke="' + st + '" stroke-width="0.8"';
    if (c.hairStyle === 'long') {
      return '<path ' + a + ' d="M30 46 C26 60 25 80 26 98 L35 98 C34 82 33 66 34 52 Z"/>' +
             '<path ' + a + ' d="M70 46 C74 60 75 80 74 98 L65 98 C66 82 67 66 66 52 Z"/>';
    }
    if (c.hairStyle === 'wavy') {
      return '<path ' + a + ' d="M30 46 C24 56 30 62 25 70 C20 78 28 86 25 98 L35 98 C37 88 31 80 35 72 C39 64 32 58 34 52 Z"/>' +
             '<path ' + a + ' d="M70 46 C76 56 70 62 75 70 C80 78 72 86 75 98 L65 98 C63 88 69 80 65 72 C61 64 68 58 66 52 Z"/>';
    }
    return '';
  }

  // ---------- accessories ----------
  function hat(c) {
    if (!c.hat) return '';
    var col = c.hatColor || '#555';
    var dk = shade(col, -0.3);
    var a = 'fill="' + col + '" stroke="' + dk + '" stroke-width="1" stroke-linejoin="round"';
    switch (c.hat) {
      case 'cap':
        return '<path ' + a + ' d="M28 43 C27 17 73 17 72 43 Z"/>' +
          '<path fill="' + dk + '" d="M26 42 Q50 35 74 42 Q78 48 70 48 Q50 44 30 48 Q22 48 26 42 Z"/>' +
          '<circle cx="50" cy="20" r="2.2" fill="' + dk + '"/>' +
          '<path fill="none" stroke="' + dk + '" stroke-width="0.8" d="M50 21 L50 38 M40 22 Q37 30 37 39 M60 22 Q63 30 63 39"/>';
      case 'beanie':
        return '<circle cx="50" cy="14" r="5.5" ' + a + '/>' +
          '<path ' + a + ' d="M29 42 C27 14 73 14 71 42 Z"/>' +
          '<rect x="27" y="36" width="46" height="9" rx="4" fill="' + dk + '"/>' +
          '<path fill="none" stroke="' + shade(col, 0.25) + '" stroke-width="1.2" d="M36 37 V44 M43 37 V44 M50 37 V44 M57 37 V44 M64 37 V44"/>';
      case 'fedora':
        return '<ellipse cx="50" cy="37" rx="33" ry="6.5" fill="' + dk + '"/>' +
          '<path ' + a + ' d="M33 37 C32 22 36 13 43 13 Q50 18 57 13 C64 13 68 22 67 37 Z"/>' +
          '<path fill="' + shade(col, -0.55) + '" d="M33.3 30 L66.7 30 L67 35.5 L33 35.5 Z"/>';
      case 'tophat':
        return '<ellipse cx="50" cy="34" rx="28" ry="5.5" fill="' + dk + '"/>' +
          '<rect x="35" y="3" width="30" height="31" rx="2" ' + a + '/>' +
          '<rect x="35" y="25" width="30" height="5.5" fill="' + shade(col, 0.45) + '"/>';
      case 'sunhat':
        return '<ellipse cx="50" cy="34" rx="44" ry="9.5" ' + a + '/>' +
          '<path ' + a + ' d="M33 34 C32 16 68 16 67 34 Z"/>' +
          '<path fill="#E2504F" d="M33.2 28 C40 30 60 30 66.8 28 L67 33 C60 35 40 35 33 33 Z"/>';
      case 'beret':
        return '<ellipse cx="53" cy="29" rx="26" ry="10" ' + a + ' transform="rotate(-8 53 29)"/>' +
          '<rect x="53" y="16" width="3" height="5" rx="1.5" fill="' + dk + '"/>';
      default:
        return '';
    }
  }

  function glasses(c) {
    if (!c.glasses) return '';
    var s = 'fill="rgba(210,235,255,0.35)" stroke="' + INK + '" stroke-width="1.9"';
    var lenses = c.glasses === 'round'
      ? '<circle cx="42" cy="52" r="6.3" ' + s + '/><circle cx="58" cy="52" r="6.3" ' + s + '/>'
      : '<rect x="35" y="47" width="13.5" height="10" rx="2.5" ' + s + '/><rect x="51.5" y="47" width="13.5" height="10" rx="2.5" ' + s + '/>';
    return lenses +
      '<path fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round" d="M48.3 51 Q50 49 51.7 51 M35.7 50.5 L30.5 49.5 M64.3 50.5 L69.5 49.5"/>';
  }

  function earrings(c) {
    if (!c.earrings) return '';
    var out = '';
    [30, 70].forEach(function (x) {
      if (c.earrings === 'hoop') {
        out += '<circle cx="' + x + '" cy="61.5" r="3.8" fill="none" stroke="' + GOLD + '" stroke-width="1.8"/>';
      } else if (c.earrings === 'drop') {
        var col = c.earringColor || '#E2504F';
        out += '<path stroke="' + GOLD + '" stroke-width="1.2" d="M' + x + ' 57.5 V61"/>' +
          '<circle cx="' + x + '" cy="63.5" r="2.9" fill="' + col + '" stroke="' + shade(col, -0.35) + '" stroke-width="0.8"/>';
      } else { // stud
        out += '<circle cx="' + x + '" cy="58.2" r="2.5" fill="' + GOLD + '" stroke="' + shade(GOLD, -0.4) + '" stroke-width="0.7"/>';
      }
    });
    return out;
  }

  function quadPoint(t, p0, p1, p2) {
    var u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  }

  function necklace(c) {
    if (!c.necklace) return '';
    var p0 = [39, 85], p1 = [50, 102], p2 = [61, 85];
    if (c.necklace === 'chain') {
      var pend = quadPoint(0.5, p0, p1, p2);
      return '<path fill="none" stroke="' + GOLD + '" stroke-width="1.7" stroke-dasharray="2 0.8" d="M39 85 Q50 102 61 85"/>' +
        '<circle cx="' + pend[0] + '" cy="' + (pend[1] + 2.6) + '" r="2.8" fill="' + GOLD + '" stroke="' + shade(GOLD, -0.4) + '" stroke-width="0.7"/>';
    }
    var col = NECKLACE[c.necklace] || NECKLACE.pearls;
    var out = '<path fill="none" stroke="' + shade(col, -0.45) + '" stroke-width="0.6" d="M39 85 Q50 102 61 85"/>';
    for (var i = 0; i <= 8; i++) {
      var p = quadPoint(0.06 + i * 0.11, p0, p1, p2);
      out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.3" fill="' + col + '" stroke="' + shade(col, -0.45) + '" stroke-width="0.7"/>';
    }
    return out;
  }

  var BOW_POS = { ponytail: [67, 32, 20], bun: [61, 22, 15], afro: [66, 22, 25], wavy: [66, 30, 22], long: [66, 30, 22], bob: [66, 30, 22] };

  function bow(c) {
    if (!c.bow) return '';
    var p = BOW_POS[c.hairStyle] || [66, 30, 22];
    var col = c.bow, dk = shade(col, -0.35);
    var a = 'fill="' + col + '" stroke="' + dk + '" stroke-width="1" stroke-linejoin="round"';
    return '<g transform="translate(' + p[0] + ' ' + p[1] + ') rotate(' + p[2] + ')">' +
      '<path ' + a + ' d="M0 0 C-4 -9 -13 -9 -12 0 C-13 9 -4 9 0 0 Z"/>' +
      '<path ' + a + ' d="M0 0 C4 -9 13 -9 12 0 C13 9 4 9 0 0 Z"/>' +
      '<circle r="3" ' + a + '/></g>';
  }

  function beard(c, col) {
    if (!c.beard) return '';
    var st = shade(col, -0.25);
    var a = 'fill="' + col + '" stroke="' + st + '" stroke-width="0.8" stroke-linejoin="round"';
    return '<path ' + a + ' d="M30 51 C30 71 39 83 50 84 C61 83 70 71 70 51 C68 59 64 63 58 63 C54 61 46 61 42 63 C36 63 32 59 30 51 Z"/>' +
      '<path ' + a + ' d="M41 65 C44 60 48 60.5 50 62.5 C52 60.5 56 60 59 65 C55 66 52 65.2 50 64.5 C48 65.2 45 66 41 65 Z"/>' +
      '<path fill="#D9706F" d="M45.5 68.5 Q50 73.5 54.5 68.5 Q50 70 45.5 68.5 Z"/>';
  }

  // ---------- face ----------
  function face(c, skin) {
    var isWoman = c.gender === 'woman';
    var browCol = c.hair ? shade(HAIR[c.hair], c.hair === 'blonde' || c.hair === 'gray' ? -0.3 : 0) : '#3A2A22';
    var bw = isWoman ? 1.7 : 2.5;
    var out = '';
    // blush
    out += '<ellipse cx="37.5" cy="61" rx="3.6" ry="2.1" fill="#FF6F6F" opacity="0.22"/>' +
           '<ellipse cx="62.5" cy="61" rx="3.6" ry="2.1" fill="#FF6F6F" opacity="0.22"/>';
    // eyes
    [42, 58].forEach(function (x) {
      out += '<ellipse cx="' + x + '" cy="52" rx="3.9" ry="4.3" fill="#FFFFFF"/>' +
             '<circle cx="' + x + '" cy="52.6" r="2.5" fill="#2A211C"/>' +
             '<circle cx="' + (x + 0.9) + '" cy="51.5" r="0.8" fill="#FFFFFF"/>';
    });
    // eyelashes
    if (isWoman) {
      out += '<path fill="none" stroke="#2A211C" stroke-width="1.1" stroke-linecap="round" d="' +
        'M38.6 49.4 L36.4 47.6 M40.2 48.3 L39 46.1 M61.4 49.4 L63.6 47.6 M59.8 48.3 L61 46.1"/>';
    }
    // brows
    out += '<path fill="none" stroke="' + browCol + '" stroke-width="' + bw + '" stroke-linecap="round" d="' +
      'M37.5 45 Q42 42.6 46.2 44.4 M53.8 44.4 Q58 42.6 62.5 45"/>';
    // nose
    out += '<path fill="none" stroke="' + shade(skin, -0.28) + '" stroke-width="1.6" stroke-linecap="round" d="M50.5 55 Q47.6 60.5 50.8 61.2"/>';
    // mouth (bearded men get theirs drawn with the beard)
    if (!c.beard) {
      out += isWoman
        ? '<path fill="#C9475A" d="M43.5 65.5 Q50 72.5 56.5 65.5 Q50 67.6 43.5 65.5 Z"/>'
        : '<path fill="none" stroke="#7A3A30" stroke-width="2" stroke-linecap="round" d="M44.5 66 Q50 70.5 55.5 66"/>';
    }
    return out;
  }

  function svg(c, opts) {
    opts = opts || {};
    var skin = SKIN[c.skin] || SKIN.medium;
    var skinDk = shade(skin, -0.12);
    var hairCol = c.hair ? HAIR[c.hair] : null;
    var shirt = SHIRT[c.shirt] || SHIRT.blue;
    var bg = opts.background === false ? '' : '<rect width="100" height="110" fill="' + (opts.background || '#E8F0FB') + '"/>';
    var title = opts.title === false ? '' : '<title>' + c.name + '</title>';

    var parts = [
      bg,
      hairCol ? hairBack(c, hairCol) : '',
      // neck + shirt
      '<rect x="43" y="68" width="14" height="20" fill="' + skinDk + '"/>',
      '<path fill="' + shirt + '" stroke="' + shade(shirt, -0.25) + '" stroke-width="1" d="M8 111 C10 93 26 85 43 85 Q50 95 57 85 C74 85 90 93 92 111 Z"/>',
      '<path fill="none" stroke="' + shade(shirt, -0.25) + '" stroke-width="1" d="M43 85 Q50 95 57 85"/>',
      necklace(c),
      hairCol ? hairLocks(c, hairCol) : '',
      // head
      '<ellipse cx="50" cy="52" rx="20" ry="24" fill="' + skin + '"/>',
      hairCol || c.hairStyle === 'bald' ? hairFront(c, hairCol || skin) : '',
      // ears (on top of hair, as if tucked behind)
      '<circle cx="30" cy="54" r="4.6" fill="' + skin + '" stroke="' + skinDk + '" stroke-width="0.8"/>',
      '<circle cx="70" cy="54" r="4.6" fill="' + skin + '" stroke="' + skinDk + '" stroke-width="0.8"/>',
      earrings(c),
      face(c, skin),
      hairCol ? beard(c, hairCol) : '',
      glasses(c),
      hat(c),
      bow(c)
    ];
    var cls = opts.className ? ' class="' + opts.className + '"' : '';
    return '<svg' + cls + ' viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + c.name + '">' +
      title + parts.join('') + '</svg>';
  }

  var api = { svg: svg, SKIN: SKIN, HAIR: HAIR, SHIRT: SHIRT, shade: shade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WH = root.WH || {}; root.WH.avatar = api; }
})(this);
