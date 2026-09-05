# 00: The editor chrome's own vocabulary

Status: ready-for-agent

Blocked by: nothing (can start immediately, in parallel with 01).

Numbered 00 rather than renumbering 01-06, which are referenced by number in `spec.md` and in the
commit that extracted them.

## What to build

A font and an icon helper for the authoring chrome, so the tickets below have something to build
with. No behaviour changes, and the only thing an author sees is that the editor stops rendering in
the browser's default serif.

This is a prefactor in the same sense ticket 01 is: it is not *about* the project library, but the
library is the first thing that needs it, and 02, 03 and 04 all draw from it. `design.md` has the
reasoning for both choices; this ticket is the work.

## The font

`body` sets only `background-color: dimgray`, and `.vn-editor-tab` is `font: inherit`, so every
button, tab, radio and label in the editor renders in the browser's default serif today. That is an
accident rather than a choice, and the picker is about to be the largest piece of UI in the app.

- Add **Source Sans 3** to the existing Google Fonts `<link>` in `src/index.html` and
  `src/player.html`, beside Source Code Pro.
- Give the chrome `font-family: "Source Sans 3", system-ui, sans-serif`. It belongs on `body` in
  `defaultTheme.css`, which both entry points load - not on each control.
- **Do not touch the stage.** `.vn-textbox-renderer`, `#vn-decision-renderer`, `#vn-actions`,
  `.vn-pause-menu-item`, `.vn-save-heading` and `.vn-now-playing` all name `var(--vn-font)`
  explicitly and must keep it. `player.html` gets the `<link>` for consistency but the player has no
  chrome to restyle.
- The debug panel keeps `var(--vn-font)`: its path chips are shorthand, and its own comment says they
  match the panel on purpose.

Whether this earns a `--vn-editor-font` token is a judgement call for whoever builds it, and the
block comment in `defaultTheme.css` states the rule to weigh it against: a value earns a token by
repeating, or by being spelled in a layer another has to agree with. One `font-family` on `body` is
neither, which is the same reason the chrome's `#eee`, `#ccc` and `3px` are literals. The argument
the other way is that a second theme would want to replace the face, and that is what the token block
is for.

## The icons

Vendor **Lucide** (lucide-static, ISC) as inline SVG. Do not add a dependency: `gg.css` is already
vendored, and the entrypoint size warning the build prints is a standing argument against a package
for eight icons.

- `src/editor/icons.ts`, holding the path data and one helper.
- Signature roughly `icon(name, size = 16): SVGElement`. It must return an element rather than a
  string, because the chrome builds its DOM with `createElement` and nothing else here uses
  `innerHTML`.
- `stroke="currentColor"`, `stroke-width="1.75"`, `fill="none"`, `viewBox="0 0 24 24"`,
  `stroke-linecap`/`stroke-linejoin` `round`. The colour is set on whatever *contains* the icon, so a
  muted row, a disabled control and an orange refused row each need no icon-specific rule.
- Build the element once per name and hand out `cloneNode(true)`, which is the pattern the
  sub-renderers already use for dropping listeners.
- Start with what 02 and 03 need: `chevron-left`, `plus`, `trash-2`. Add per ticket rather than
  vendoring a set nobody calls.
- **`gg.css` is untouched.** Its four icons stay on the stage. See `design.md` for why replacing them
  would be churn, and why reusing them in the chrome does not work.

## Acceptance criteria

- [ ] The editor's buttons, tabs and labels render in Source Sans 3, and the face is fetched by both
      html files
- [ ] The VN stage still renders in Source Code Pro - name tag, textbox, decisions, actions, pause
      menu, save headings - and the demo suite's computed-colour assertions still pass
- [ ] `icon("chevron-left")` returns an `SVGElement` that inherits its colour from its container
- [ ] Two calls for the same name return independent elements
- [ ] `gg.css` is unchanged and the stage's four icons still render
- [ ] `npm test` and `npm run test:demo` pass; lint, prettier and typecheck are clean

## Not in scope

- **Any picker UI.** Ticket 02.
- **A `--vn-editor-font` token**, unless the builder judges it earns one - see above.
- **Restyling existing chrome beyond the font.** The `#eee`/`#ccc`/`3px` vocabulary is already
  consistent and is not this ticket's to revisit.
