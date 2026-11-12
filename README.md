# Who’s Hiding? — a guessing game that teaches binary search

A two-player, guess-the-mystery-person game for the classroom. The teacher hosts a game and gets a
**4-character code and a QR code**. A student scans it (or types the code) and they play on separate devices.
There is also a solo practice mode.

![The game board](docs/screenshot.png)

The 16 faces are designed so that **halving** always finds the mystery person in exactly 4 questions:

| Question | Men (8) | Women (8) |
| --- | --- | --- |
| 1 | **Is it a man?** | **Is it a man?** |
| 2 | Hat? | Earrings? |
| 3 | Glasses? | Necklace? |
| 4 | Beard? | Bow in hair? |

16 → 8 → 4 → 2 → 1. Each of the 8 men has a different combination of hat / glasses / beard, and each of the 8
women has a different combination of earrings / necklace / bow, so each question halves the group in any order.

Decoys hide the pattern: 3 women wear hats, 3 women wear glasses, 2 men wear earrings and 1 man wears a necklace.
That makes “Hat?” (7 vs 9) and “Glasses?” (7 vs 9) look like good first questions. Only “Is it a man?” splits the
board 8 vs 8.

The **teacher guide** (`guide.html`, linked from the home screen) has the full decision tree with every face,
the decoys, a trait table, and lesson ideas. It prints on one landscape page per section.

## Putting it online (one time, about 2 minutes)

It’s a plain static website with no server to run and no build step. The easiest host is GitHub Pages:

1. Merge this branch into `main`.
2. GitHub Pages is free for **public** repositories. This repository is currently private, so either make it public
   (Settings → General → Danger Zone → Change visibility; it holds no secrets) or use a paid GitHub plan.
3. Go to **Settings → Pages**. Under “Build and deployment”, choose **Deploy from a branch**, then branch `main`,
   folder `/ (root)`, and click **Save**.
4. After a minute the game is live at **https://nwlb91.github.io/GuessWhoClass/**

Any other static host works too (Netlify, Cloudflare Pages, a school web server). Upload the whole folder.

## Playing in class

1. On your computer, open the site, type your name and click **Host a game**. Put the code and QR code on the
   projector.
2. The student scans the QR code with a phone or tablet, or opens the site and types the code, then enters their name.
3. Both players secretly pick a mystery person. The student asks first.
4. On your turn, tap a question from the list (answered automatically, so nobody can make a mistake) or type your
   own (the other player taps Yes/No). Tap faces to flip them down, or press **Flip down the N who don’t match**.
5. Make a final guess when you know. A wrong guess loses the round (the classic rule).
6. At the end, both players see a “how you narrowed it down” chart, such as 16 → 8 → 4 → 2 → 1.

More tips:

- **Strategy hints** (a toggle in the lobby or in the top bar) show how each question would split the faces still
  standing, for example `8|8` or `7|9`, and star the best one. Turn it on after students have tried on their own.
- **Next student:** ☰ menu → *Invite a different student* (same code, fresh game).
- **Several games at once:** open the site in more tabs. Each tab hosts its own game with its own code.
  Students can also host games for each other.
- **Lost connection or refreshed the page?** Both sides reconnect to the same game automatically, as long as
  the host’s tab stays open.

## How it works

- `index.html` with `js/app.js` is the game UI. `js/game.js` has the rules: the host’s browser keeps the real game
  state, and each player only receives a view that hides the other player’s mystery person.
- `js/characters.js` defines the cast, the question list and the strategy. `js/avatar.js` draws every face as SVG.
  There are no image files.
- `js/net.js` connects the two browsers directly with WebRTC via [PeerJS](https://peerjs.com). The free public
  PeerJS server only introduces the browsers to each other. No game data is stored anywhere and no accounts are
  needed.
- PeerJS and the QR-code generator are bundled in `vendor/`, so the game doesn’t depend on other CDNs.

**School networks:** the game needs to reach `0.peerjs.com` (to connect) and, on strict networks, PeerJS’s relay
servers (`*.turn.peerjs.com`). If students get stuck on “Connecting…”, ask IT to allow those. Solo practice works
without any connection.

## Tests

```bash
node tests/run-tests.js
```

Checks the cast design (every strategy question halves its group, decoys don’t, every face is reachable in
exactly 4 questions) and the game rules.

```bash
npm install --no-save peer playwright && node tests/e2e.js
```

Plays a full two-browser game through a local PeerJS server: join via the link, typed questions, a reload
mid-game, the final guess, rematch, hints and solo mode.

## Credits

All characters and art are original. Third-party libraries (MIT licensed) are listed in `vendor/LICENSES.md`.
