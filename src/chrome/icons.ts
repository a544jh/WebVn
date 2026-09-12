import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  IconNode,
  Link,
  Maximize,
  Plus,
  Replace,
  Trash2,
  Upload,
} from "lucide"

// Lucide (ISC), imported per icon rather than transcribed by hand. `lucide` declares
// `sideEffects: false` and ships one ESM module per icon, so what reaches the bundle is the data for
// the icons named below and nothing else - which is what the size measurement in
// `.scratch/asset-panel/` settled, against the earlier reading that "eight chrome icons do not earn
// a package".
//
// **The package's own data shape is the reason this is an import rather than a copy.** An `IconNode`
// is a list of `[tag, attributes]` pairs - `Eye` is a path and a circle, `Replace` is six paths and a
// rect - so `draw` below renders whatever element each entry names. The hand-vendored version held a
// list of `d` strings and could only emit `<path>`, which is why four of the icons this chrome wants
// were unbuildable and two more were drawn from memory and got their geometry wrong.
//
// In src/chrome/ and not src/editor/ because the picker draws a trash and a plus before any editor
// exists.
//
// gg.css is untouched and keeps the stage. Its four icons run at `--ggs: 2.5`, around 55px, where
// they work; the problem was only ever reaching for them at the 14-15px this chrome uses, where a
// border-drawn icon at fractional scale lands on half-pixels and goes soft.

const SVG_NS = "http://www.w3.org/2000/svg"

// One entry per icon this chrome draws. Naming them individually is what keeps the other ~1500 out
// of the bundle, so add a name here rather than importing the set.
//
// `download` and `upload` are the archive's pair and are read as a pair: the same tray, with the
// arrow pointing into it for import and out of it for export. **Direction follows the data, not the
// verb** - a download arrow on export would be naming the browser's file transfer rather than the
// project leaving the library, and drawn that way round both buttons pointed the same way.
const ICONS = {
  "chevron-left": ChevronLeft,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  plus: Plus,
  "trash-2": Trash2,
  download: Download,
  upload: Upload,
  maximize: Maximize,
  link: Link,
  eye: Eye,
  replace: Replace,
} satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

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
  // Whatever element the entry names - a path, a circle, a rect - with its attributes as given.
  for (const [tag, attributes] of ICONS[name]) {
    const child = document.createElementNS(SVG_NS, tag)
    for (const [attribute, value] of Object.entries(attributes)) {
      child.setAttribute(attribute, String(value))
    }
    svg.appendChild(child)
  }
  return svg
}
