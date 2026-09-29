# 01: The player plays the folder it is served from

**Status:** done

**Blocked by:** None (can start immediately). Changes nothing a reader of the deployed demo can see.

## What to build

The player stops playing a copy of the demo compiled into its bundle. With no `?vn=` in its address,
it fetches `manifest.yaml` and `script.yaml` from the directory it is served from and plays those.
`dist/` already holds both at its root, so the deployed demo plays exactly as before, and the demo's
YAML leaves the player bundle. This is what makes any published folder play: the same player,
dropped beside another project's files, plays that project.

Spec: `.scratch/published-folder/spec.md`, "The player plays the folder it is served from".

- **The boot leaves the entry point**, for the reason `editorBoot` did: an entry point that boots
  itself on import and finds its elements by id cannot be reached by a suite. The boot is told the
  root, the container, the folder's URL and the payload if there is one, and returns a booted player
  or a refusal. The entry point shrinks to wiring - the fullscreen button and the error line.
- **The relative resolver gets its base URL**, which its own comment has anticipated since tranche 1.
  In production the base is the document's own directory, which is what it resolves against today;
  in a suite it is the served `test-assets/` folder.
- **`?vn=` is unchanged.** A payload's assets still resolve against the folder the player is served
  from.
- **The page's title becomes the manifest's `title`** as the player boots, for a folder and a payload
  alike, so a published VN's tab does not say "WebVn". Set by the player, never by rewriting the
  HTML: publish (ticket 04) copies the player's files byte for byte.
- **Three refusals, one surface** - the existing one-line load error, since a styled screen belongs
  to `.scratch/stage-dialogs/`:
  - `manifest.yaml` would not load;
  - `script.yaml` would not load;
  - the manifest does not parse (this one exists today).

  On a `file:` page the refusal says the folder has to be opened from a web host. That is the first
  thing anyone tries after extracting a zip, and a blank stage there looks like a bug.
- **The demo module survives as a test fixture.** The player no longer imports it. Its comment that
  it "has no reason to exist" once the player reads `manifest.yaml` at boot is corrected, not left
  standing. (The picker still imports it until ticket 03.)

## Acceptance criteria

- [x] Booted against the served `test-assets/` folder in a browser suite, the player reaches the
      demo's first stop with its assets resolved against that folder.
- [x] After booting, the page's title is the manifest's title, for a folder and for a payload.
- [x] Booted against a folder with no `manifest.yaml`, and against one with no `script.yaml`, it
      refuses on the load-error surface rather than playing anything.
- [x] Booted with a `?vn=` payload, it plays the payload and not the folder.
- [x] The player bundle no longer contains the demo's YAML - checked against `npm run build`.
- [x] By hand: `npm run build`, serve `dist/` statically, open `player.html` - the demo plays as it
      did. Open it from `file:` and the message says to use a web host.
- [x] `CLAUDE.md` says where the player boot now lives, and the `file:` message joins its hand checks.

## Comments

**Landed 2026-09-28** on `claude/laughing-bell-erlp50`.

- The boot is `src/playerBoot.ts`, `bootPlayer({ root, container, folder, payload })`, returning a
  booted player or a refusal. `src/playerIndex.ts` is wiring. The shared names - `manifest.yaml`,
  `script.yaml`, and the rule that a 200 served as `text/html` is not the file asked for - are in a new
  top-level `src/publishedFolder.ts`, which tickets 02 and 04 grow. The player applies that
  `text/html` rule too, so a single-page-app host answering `manifest.yaml` with its front page is
  refused as "would not load" rather than as a manifest that does not parse.
- The booted result carries `missing` (what `loadAssets` reported) and `firstStop`. The suite asserts
  on `missing` being empty to prove assets resolved against the folder: removing the resolver's base
  turns that test red, measured.
- `RelativePathResolver` takes an optional base. It stays optional because the loaders' own default,
  with no base, is still "resolve against the document".
- The `file:` case is reachable from a suite after all: a page on `http:` fetching a `file:` URL fails
  the same way, so `test/browser/PlayerBoot.test.ts` boots against `file:///...` and reads the message.
  What is still by hand is opening the page itself from disk.
- **Checked by hand 2026-09-28**, against `npm run build`: `dist/` served by `python3 -m http.server`,
  `player.html` plays the demo with the tab reading "WebVn Demo" and no error line;
  `file:///.../dist/player.html` shows "The VN could not be loaded: it has to be opened from a web host,
  and opening index.html straight from your computer will not start it." `dist/playerIndex.js` no
  longer contains the demo's script (`app.js` still does, through the picker, until ticket 03).
- Fixture folders for this and ticket 02 live in `test/fixtures/published/`, beside `test-assets/`
  rather than inside it, since CopyPlugin copies `test-assets/` into `dist/`.
