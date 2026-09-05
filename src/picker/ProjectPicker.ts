import { confirmDialog } from "../chrome/dialog"
import { icon } from "../chrome/icons"
import { deleteSaveData } from "../core/save"
import { demoManifest } from "../demoStory"
import { isPersisted } from "../storage/persistence"
import { takeProjectLock } from "../storage/projectLock"
import {
  deleteProject,
  EditorState,
  forgetProject,
  listProjects,
  mintProject,
  ProjectSummary,
  readEditorState,
} from "../storage/projectStore"
import { recoverProjects } from "../storage/recoverProjects"
import { seedDemoProject } from "../storage/seedDemoProject"
import { askForNewProject } from "./newProjectDialog"
import "../chrome/chrome.css"
import "./picker.css"

// The front door: the page an author lands on before any project is open, listing what the store
// enumerates and opening whichever is chosen.
//
// A **view**, not a third html entry. The app stays one page: this is swapped in where the editor
// would mount, and opening a project never reloads. It lives in src/picker/ rather than src/editor/,
// because it must render without an editor and outlives any one editor session, and rather than
// src/storage/, which is deliberately UI-free.
//
// Enumeration is the truth about what exists, so the list is a walk of projects/ every time it is
// shown. There is no index file, ever, and nothing here caches one.
//
// The layout is the design canvas's, which `design.md` names as the pixels: a header, one panel
// holding a title strip with the two actions in it, and the rows inside that panel.

// What the host does when a row is chosen. Resolves with a reason the project could not be opened -
// another tab holds it - or null when it was, in which case this picker is already down. Refusing is
// a place the author can stay: they are on the list, looking at what they have.
export type OpenProject = (directory: string) => Promise<string | null>

// A row's own line, and what the list is ordered by. `openedAt` is undefined for a project nobody
// has opened yet, which is a thing to say rather than a zero; `createdAt` is undefined for one that
// predates this file recording it.
interface ListedProject extends ProjectSummary {
  readonly openedAt: Date | undefined
  readonly createdAt: Date | undefined
}

export class ProjectPicker {
  // Everything this view listens to, so `stop()` takes it all off at once.
  //
  // **Insurance rather than a fix, and worth being honest about.** Every listener registered through
  // it today is on an element this picker made inside its own root, and both `render` and `stop`
  // call `replaceChildren` - so those elements are detached and unreferenced, and nothing in the app
  // can reach their handlers. It is not the bug ProjectStoring's `stop()` closes, whose listeners
  // are on `document` and `window` and genuinely outlive their session. What actually carries this
  // teardown is the `stopped` flag and the generation below.
  //
  // It is kept because the moment a dialog here needs `document` - a key handler, an outside click -
  // the picker is in exactly ProjectStoring's position, and this is where that listener will go.
  private listeners = new AbortController()

  // Every render walks the store, and the author can leave while that walk is in flight. Bumped by
  // each render and by `stop()`, so a walk that resolves late paints nothing - the same guard, and
  // the same hazard, as DomRenderer.renderGeneration.
  private generation = 0

  // One-way, like every other teardown here: a stopped picker paints nothing, whether the render was
  // already in flight when it was stopped or is asked for afterwards. Both happen - the host stops
  // this one the moment a project opens, and the walk it is stopped in the middle of resolves later.
  private stopped = false

  // **Seeded with a refusal only when the host has one this picker could not have raised itself** -
  // a URL that named a project which would not open, refused before any picker existed to say so.
  // Every other banner it shows, it produced. A parameter rather than a setter because a picker is
  // built fresh for each showing and rendered immediately after, so a setter could only ever be
  // called in the one line between the two.
  constructor(
    private root: HTMLElement,
    private openProject: OpenProject,
    private refusal: RefusalNotice | null = null
  ) {}

  // Walk the store and draw what it holds. Called to show the picker and again after anything that
  // changes the library.
  public async render(): Promise<void> {
    if (this.stopped) return
    const generation = ++this.generation

    // Before the walk, and on every render rather than once a page: this is what finishes a rename
    // its tab was killed in the middle of, and running it here is the only placement where the list
    // never shows a row the sweep is about to remove.
    await recoverProjects()

    const [projects, editorState, persisted] = await Promise.all([listProjects(), readEditorState(), isPersisted()])
    if (generation !== this.generation) return

    this.root.replaceChildren(this.draw(order(projects, editorState), persisted))
  }

  public stop(): void {
    this.stopped = true
    this.generation++
    this.listeners.abort()
    this.root.replaceChildren()
  }

  private draw(projects: ListedProject[], persisted: boolean): HTMLElement {
    const page = document.createElement("div")
    page.classList.add("vn-picker")

    page.appendChild(header())

    const panel = document.createElement("div")
    panel.classList.add("vn-picker-panel")
    panel.appendChild(this.drawPanelBar(projects))
    // Inside the panel and under its title strip, because it is news about this list rather than
    // about the page - the artboard puts it there and it is right: the row it names is under it.
    if (this.refusal !== null) panel.appendChild(banner(this.refusal))
    panel.appendChild(this.drawList(projects))
    page.appendChild(panel)

    page.appendChild(storageLine(persisted))
    return page
  }

  // The panel's title strip: what this is, then the two things you can do to it.
  private drawPanelBar(projects: ListedProject[]): HTMLElement {
    const bar = document.createElement("div")
    bar.classList.add("vn-picker-bar")

    const caption = document.createElement("span")
    caption.classList.add("vn-picker-caption")
    caption.textContent = "Projects"
    bar.appendChild(caption)

    // Shown only while the demo is absent. Its id is fixed, so a second press would collide with an
    // existing directory - hiding the button once the demo is listed is both the collision fix and
    // the honest signal. An author who deletes the demo gets the button back, which is correct: they
    // can have it again. No icon: it is a one-off, and the plus belongs to the action that repeats.
    if (!projects.some((project) => project.directory === demoManifest.id)) {
      bar.appendChild(this.action("vn-picker-demo", null, "Add demo project", () => void this.addDemo()))
    }
    bar.appendChild(this.action("vn-picker-new", "plus", "New project", () => void this.create()))
    return bar
  }

  private drawList(projects: ListedProject[]): HTMLElement {
    const list = document.createElement("ul")
    list.classList.add("vn-picker-projects")
    if (projects.length === 0) {
      list.appendChild(emptyLibrary())
      return list
    }
    for (const project of projects) list.appendChild(this.drawRow(project))
    return list
  }

  // Up to three lines: what it is called, what is wrong with it, and when it was last opened.
  //
  // Title where the manifest parses, the directory name where it does not - **in the story's
  // monospace face**, because at that point it is an identifier rather than a name, and the row is
  // saying so. **A project whose manifest does not parse is listed**: it is an author's project with
  // a typo in it, and this is the one place they would go to open it and fix it, which is why
  // ProjectSummary carries a nullable id rather than the store returning a list of ids.
  private drawRow(project: ListedProject): HTMLElement {
    const row = document.createElement("li")
    row.classList.add("vn-picker-project")

    const open = document.createElement("button")
    open.type = "button"
    open.classList.add("vn-picker-open")
    open.dataset.vnProject = project.directory

    const name = document.createElement("span")
    name.classList.add("vn-picker-title")
    name.textContent = project.title ?? project.directory
    if (project.title === null) name.classList.add("vn-picker-identifier")
    open.appendChild(name)

    // The id, under the name, in the story's monospace face - the same rule the title above follows
    // when it is standing in for a directory. It is what the project is *addressed* by: its folder,
    // its save key and its export filename, and the thing a rename changes. Two projects may be
    // called the same and only one of them can be `my-story`.
    //
    // Nothing to show when the manifest does not parse: no id has been declared, and the title line
    // is already the directory. The two lines would be the same word twice.
    if (project.id !== null) {
      const id = document.createElement("span")
      id.classList.add("vn-picker-id")
      id.textContent = project.id
      open.appendChild(id)
    }

    if (project.title === null) {
      const problem = document.createElement("span")
      problem.classList.add("vn-picker-unparsed")
      problem.textContent = "manifest.yaml does not parse - opens anyway, marked in the gutter"
      open.appendChild(problem)
    }

    const opened = document.createElement("span")
    opened.classList.add("vn-picker-opened")
    opened.textContent = openedLabel(project.openedAt)
    open.appendChild(opened)

    open.addEventListener("click", () => void this.choose(project.directory), { signal: this.listeners.signal })
    row.appendChild(open)

    const remove = document.createElement("button")
    remove.type = "button"
    remove.classList.add("vn-picker-delete")
    remove.dataset.vnProject = project.directory
    // The row's own button carries the name, so the icon says the rest. An icon with no text needs
    // the label a screen reader looks for.
    remove.setAttribute("aria-label", `Delete ${project.title ?? project.directory}`)
    remove.title = "Delete this project"
    remove.appendChild(icon("trash-2", 15))
    remove.addEventListener("click", () => void this.remove(project), { signal: this.listeners.signal })
    row.appendChild(remove)

    return row
  }

  private action(className: string, name: "plus" | null, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.classList.add("vn-picker-action", className)
    if (name !== null) button.appendChild(icon(name, 14))
    button.appendChild(document.createTextNode(label))
    button.addEventListener("click", onClick, { signal: this.listeners.signal })
    return button
  }

  // Order, then: choose, take the lock, boot, record when. A refusal at the lock changes nothing and
  // says so on the page - from the front door there is nothing to be stranded from, because the
  // previous project was released on the way out.
  private async choose(directory: string): Promise<void> {
    const reason = await this.openProject(directory)
    // Null means the project opened, which means this picker is already down: rendering over the
    // editor that replaced it is exactly what the generation guard above is for, and `stop()` has
    // bumped it.
    if (reason === null) return
    this.refusal = { lead: reason, detail: "Close it there, or pick a different project." }
    await this.render()
  }

  // It writes under the demo directory's lock, like any other write, and **leaves the author on the
  // picker**: the row appears and the button goes, which is the confirmation. Unlike New project,
  // which opens what it made, this populates the library rather than starting work.
  private async addDemo(): Promise<void> {
    const lock = await takeProjectLock(demoManifest.id)
    if (lock === null) {
      this.refusal = {
        lead: `${demoManifest.title} is open in another tab.`,
        detail: "The demo was not written. Close it there and try again.",
      }
      await this.render()
      return
    }
    try {
      this.refusal = null
      await seedDemoProject()
    } finally {
      await lock.release()
    }
    await this.render()
  }

  // One of the two ways to leave the front door without picking an existing row - a rename is the
  // other. Not a switch: there is no session to switch from, so only the choose-and-boot half of
  // opening applies and never the teardown half.
  //
  // A refused lock is possible even here: another tab can hold `projects/<id>/` if that id was just
  // deleted and re-made, or if two tabs race the same new id. The project is created but not opened,
  // and the author is left on the picker with the row present.
  private async create(): Promise<void> {
    // Walked as the dialog opens rather than taken from the last render, which may be old - and
    // walked again below, because another tab can create the id while the dialog is up and
    // `createProject` writes into projects/<id>/ unconditionally. The dialog's own check is what
    // puts the message beside the field; this one is what makes it true at the moment of the write.
    const taken = async (): Promise<Set<string>> => new Set((await listProjects()).map((p) => p.directory))
    const before = await taken()

    const chosen = await askForNewProject((id) => before.has(id))
    if (chosen === null) return

    if ((await taken()).has(chosen.id)) {
      this.refusal = { lead: `"${chosen.id}" already names a project.`, detail: "Nothing was created." }
      await this.render()
      return
    }

    await mintProject(chosen.id, chosen.title)
    const reason = await this.openProject(chosen.id)
    if (reason === null) return
    this.refusal = { lead: reason, detail: `"${chosen.id}" was created, but not opened.` }
    await this.render()
  }

  // Ask first, and say the project cannot be recovered - which is plainly true right now, because
  // there is no export yet.
  //
  // **Take the lock on what is about to be deleted, and refuse if it is held.** On the picker this
  // tab holds nothing and has no live storer to flush into a directory being removed, so the case
  // that remains is the project being open **in another tab** - and a tree another tab is writing
  // into must not be removed underneath it. The recovery sweep works out the same policy for its own
  // delete; this is that policy, not a second one.
  //
  // The author stays on the picker afterwards. Auto-opening something because you deleted something
  // else is not a thing to want, and from the front door there is nothing to land in.
  private async remove(project: ListedProject): Promise<void> {
    const name = project.title ?? project.directory
    const confirmed = await confirmDialog(
      `Delete "${name}"?`,
      [
        `This removes projects/${project.directory}/ and everything in it - the script, the manifest and every asset.`,
        "It cannot be recovered. There is no export yet, so nothing outside this browser has a copy.",
      ],
      "Delete"
    )
    if (!confirmed) return

    const lock = await takeProjectLock(project.directory)
    if (lock === null) {
      this.refusal = { lead: `${name} is open in another tab.`, detail: "It was not deleted." }
      await this.render()
      return
    }
    try {
      this.refusal = null
      await deleteProject(project.directory)
      // The bookkeeping goes with the tree, in both places it lives. An entry that outlives its
      // directory is inherited by the next project to reuse the id: from `editor.yaml` that means
      // someone else's creation date and place in the list, and from localStorage it means someone
      // else's save slots, whose paths describe a story the new project does not have.
      await forgetProject(project.directory)
      // Keyed by the manifest's id rather than the directory, which is what the save key actually
      // is. A project whose manifest does not parse has declared no id and so has no saves to drop.
      if (project.id !== null) deleteSaveData(project.id)
    } finally {
      await lock.release()
    }
    await this.render()
  }
}

const header = (): HTMLElement => {
  const elem = document.createElement("div")
  elem.classList.add("vn-picker-header")

  const name = document.createElement("span")
  name.classList.add("vn-picker-app")
  name.textContent = "WebVn"
  elem.appendChild(name)

  const what = document.createElement("span")
  what.classList.add("vn-picker-subtitle")
  what.textContent = "pick a project to open"
  elem.appendChild(what)
  return elem
}

// **Creation order, oldest first, and it does not move.** A list that reorders itself under the
// author is the thing to avoid: with recency ordering every trip back from a project reshuffles the
// rows, and the spatial memory of where each one sits is worth more than having the likeliest one on
// top. Oldest first rather than newest is the strongest form of that - a new project appends at the
// bottom and no existing row moves at all.
//
// The rows still say when each was last opened, which is the canvas's line: recency survives as
// information without being the sort.
//
// A project with no recorded creation predates this file recording one, so it is older than
// everything that has one and sorts first, among its own kind by the name it is addressed under.
// Nothing backfills a date on the way past: this walk must not write - two tabs listing at once
// would race, and the recovery sweep already shares this path.
const order = (projects: ProjectSummary[], state: EditorState): ListedProject[] =>
  projects
    .map((project) => ({
      ...project,
      openedAt: parseDate(state.lastOpened?.[project.directory]),
      createdAt: parseDate(state.created?.[project.directory]),
    }))
    .sort((a, b) => {
      if (a.createdAt !== undefined && b.createdAt !== undefined) return a.createdAt.getTime() - b.createdAt.getTime()
      if (a.createdAt !== undefined) return 1
      if (b.createdAt !== undefined) return -1
      return a.directory.localeCompare(b.directory)
    })

// editor.yaml is a hint, so anything unreadable in it reads as absent rather than as a date of zero.
const parseDate = (at: string | undefined): Date | undefined => {
  if (at === undefined) return undefined
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// "opened just now", "opened yesterday", "opened 5 days ago". Through Intl rather than a table of
// plurals, which is a table that only works in English.
const openedLabel = (at: Date | undefined): string => {
  if (at === undefined) return "not opened yet"
  const elapsed = Date.now() - at.getTime()
  if (elapsed < MINUTE) return "opened just now"

  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  if (elapsed < HOUR) return `opened ${relative.format(-Math.round(elapsed / MINUTE), "minute")}`
  if (elapsed < DAY) return `opened ${relative.format(-Math.round(elapsed / HOUR), "hour")}`
  return `opened ${relative.format(-Math.round(elapsed / DAY), "day")}`
}

// What could not be opened, and what to do about it. Two parts because the artboard reads that way
// and it is right: the first sentence is the news and carries the weight, the second is the advice.
//
// Exported for the one refusal this picker does not raise: a URL naming a project that would not
// open, which is refused before there is a picker to put it on.
export interface RefusalNotice {
  readonly lead: string
  readonly detail: string
}

// Orange, because the work still runs: the author is on the list, looking at what they have, and
// nothing was lost. Red is for a write that failed or a document that did not parse. Orange takes
// black text - it is light enough that white on it fails to read, which editor.css says outright.
const banner = (notice: RefusalNotice): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-refusal")
  elem.setAttribute("role", "status")

  const lead = document.createElement("span")
  lead.classList.add("vn-picker-refusal-lead")
  lead.textContent = notice.lead
  elem.append(lead, ` ${notice.detail}`)
  return elem
}

// An empty picker offering the demo by name is not an empty project: the story is one obvious click
// away, and the author can tell it happened. Both actions are in the bar above this, so the empty
// state says what is true and no more.
const emptyLibrary = (): HTMLElement => {
  const elem = document.createElement("li")
  elem.classList.add("vn-picker-empty")
  elem.textContent = "No projects yet."
  return elem
}

// What the browser has actually promised, re-read on every render rather than assumed. First run
// honestly says so until the author has entered a project and typed - that is when the store asks,
// because a permission prompt should land on someone who is invested rather than on someone who just
// arrived. Under the panel and muted: it is a standing fact about the browser, not about the list.
const storageLine = (persisted: boolean): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-storage")
  elem.dataset.vnPersisted = String(persisted)
  elem.textContent = persisted
    ? "This browser has promised to keep your projects."
    : "This browser has not promised to keep your projects - it may clear them if it runs short of space."
  return elem
}
