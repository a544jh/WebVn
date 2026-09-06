// Lucide (ISC), vendored as inline SVG rather than installed. That is the pattern gg.css already
// set, and eight chrome icons do not earn a package against the entrypoint size warning the build
// already prints. Add path data per ticket rather than vendoring a set nobody calls.
//
// In src/chrome/ and not src/editor/ because the picker draws a trash and a plus before any editor
// exists.
//
// gg.css is untouched and keeps the stage. Its four icons run at `--ggs: 2.5`, around 55px, where
// they work; the problem was only ever reaching for them at the 14-15px this chrome uses, where a
// border-drawn icon at fractional scale lands on half-pixels and goes soft.

const SVG_NS = "http://www.w3.org/2000/svg"

// One entry per icon, holding its `d` attributes in Lucide's own drawing order.
//
// `download` and `upload` are the archive's pair and are read as a pair: the same tray, with the
// arrow pointing into it for import and out of it for export. **Direction follows the data, not the
// verb** - a download arrow on export would be naming the browser's file transfer rather than the
// project leaving the library, and drawn that way round both buttons pointed the same way.
const PATHS = {
  "chevron-left": ["m15 18-6-6 6-6"],
  plus: ["M5 12h14", "M12 5v14"],
  "trash-2": [
    "M10 11v6",
    "M14 11v6",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M3 6h18",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  maximize: [
    "M8 3H5a2 2 0 0 0-2 2v3",
    "M21 8V5a2 2 0 0 0-2-2h-3",
    "M3 16v3a2 2 0 0 0 2 2h3",
    "M16 21h3a2 2 0 0 0 2-2v-3",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
} satisfies Record<string, string[]>

export type IconName = keyof typeof PATHS

// Built once per name and handed out as a clone, which is the pattern the sub-renderers already use.
const built = new Map<IconName, SVGElement>()

// An element rather than a string of markup, because the chrome builds its DOM with `createElement`
// and nothing else here uses `innerHTML`.
//
// The colour is `currentColor` and is set on whatever *contains* the icon, so a muted row, a
// disabled control and an orange refused row each need no icon-specific rule.
export const icon = (name: IconName, size = 16): SVGElement => {
  let template = built.get(name)
  if (template === undefined) {
    template = draw(name)
    built.set(name, template)
  }
  const element = template.cloneNode(true) as SVGElement
  // Set on the clone rather than baked into the template, so one name can be drawn at two sizes.
  element.setAttribute("width", String(size))
  element.setAttribute("height", String(size))
  return element
}

const draw = (name: IconName): SVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  // 1.75 rather than Lucide's 2: that default is drawn for 24px and reads heavy at the 14-15px
  // this chrome uses.
  svg.setAttribute("stroke-width", "1.75")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  // Decoration beside a label in every call site so far. A row that draws an icon and no text says
  // what it is with `aria-label` on the control, which is where a screen reader looks anyway.
  svg.setAttribute("aria-hidden", "true")
  svg.classList.add("vn-icon")
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", d)
    svg.appendChild(path)
  }
  return svg
}
