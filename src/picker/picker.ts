import { icon } from "../chrome/icons"
import { demoManifest } from "../demoStory"
import { isPersisted } from "../storage/persistence"
import { takeProjectLock } from "../storage/projectLock"
import { listProjects, ProjectSummary, readEditorState } from "../storage/projectStore"
import { seedDemoProject } from "../storage/seedDemoProject"
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

// What the host does when a row is chosen. Resolves with a reason the project could not be opened -
// another tab holds it - or null when it was, in which case this picker is already down. Refusing is
// a place the author can stay: they are on the list, looking at what they have.
export type OpenProject = (directory: string) => Promise<string | null>

export class ProjectPicker {
  // Everything this view listens to, so `stop()` takes it all off at once. Re-created on every Back
  // to projects, so it comes down the way ProjectStoring does and for the same reason: a superseded
  // component that kept its listeners is a measured data-loss bug, not a tidiness question.
  private listeners = new AbortController()

  // Every render walks the store, and the author can leave while that walk is in flight. Bumped by
  // each render and by `stop()`, so a walk that resolves late paints nothing - the same guard, and
  // the same hazard, as DomRenderer.renderGeneration.
  private generation = 0

  private refusal: string | null = null

  // One-way, like every other teardown here: a stopped picker paints nothing, whether the render was
  // already in flight when it was stopped or is asked for afterwards. Both happen - the host stops
  // this one the moment a project opens, and the walk it is stopped in the middle of resolves later.
  private stopped = false

  constructor(private root: HTMLElement, private openProject: OpenProject) {}

  // Walk the store and draw what it holds. Called to show the picker and again after anything that
  // changes the library.
  public async render(): Promise<void> {
    if (this.stopped) return
    const generation = ++this.generation
    const [projects, editorState, persisted] = await Promise.all([listProjects(), readEditorState(), isPersisted()])
    if (generation !== this.generation) return

    this.root.replaceChildren(this.draw(order(projects, editorState.lastOpened), persisted))
  }

  // One-way, like every other teardown in this app: the session this belonged to is gone and the
  // next visit constructs a picker of its own.
  public stop(): void {
    this.stopped = true
    this.generation++
    this.listeners.abort()
    this.root.replaceChildren()
  }

  private draw(projects: ProjectSummary[], persisted: boolean): HTMLElement {
    const page = document.createElement("div")
    page.classList.add("vn-picker")

    const heading = document.createElement("h1")
    heading.classList.add("vn-picker-heading")
    heading.textContent = "Your projects"
    page.appendChild(heading)

    if (this.refusal !== null) page.appendChild(banner(this.refusal))

    page.appendChild(projects.length === 0 ? emptyLibrary() : this.drawList(projects))
    page.appendChild(this.drawActions(projects))
    page.appendChild(storageLine(persisted))
    return page
  }

  private drawList(projects: ProjectSummary[]): HTMLElement {
    const list = document.createElement("ul")
    list.classList.add("vn-picker-projects")
    for (const project of projects) list.appendChild(this.drawRow(project))
    return list
  }

  // Title where the manifest parses, the directory name where it does not. **A project whose
  // manifest does not parse is listed**: it is an author's project with a typo in it, and this is
  // the one place they would go to open it and fix it - which is why ProjectSummary carries a
  // nullable id rather than the store returning a list of ids.
  private drawRow(project: ProjectSummary): HTMLElement {
    const row = document.createElement("li")
    row.classList.add("vn-picker-project")

    const open = document.createElement("button")
    open.type = "button"
    open.classList.add("vn-picker-open")
    open.dataset.vnProject = project.directory

    const title = document.createElement("span")
    title.classList.add("vn-picker-title")
    title.textContent = project.title ?? project.directory
    open.appendChild(title)

    const subtitle = document.createElement("span")
    subtitle.classList.add("vn-picker-directory")
    // The directory is what a project is addressed by, so it is worth showing beside a title that is
    // free text - two projects may be called the same thing and only one can be `my-story`. When the
    // manifest does not parse there is no title to sit above, and saying so is the honest subtitle.
    subtitle.textContent = project.title === null ? "manifest.yaml does not parse" : project.directory
    if (project.title === null) subtitle.classList.add("vn-picker-unparsed")
    open.appendChild(subtitle)

    open.addEventListener("click", () => void this.choose(project.directory), { signal: this.listeners.signal })
    row.appendChild(open)
    return row
  }

  private drawActions(projects: ProjectSummary[]): HTMLElement {
    const actions = document.createElement("div")
    actions.classList.add("vn-picker-actions")

    // Shown only while the demo is absent. Its id is fixed, so a second press would collide with an
    // existing directory - hiding the button once the demo is listed is both the collision fix and
    // the honest signal. An author who deletes the demo gets the button back, which is correct: they
    // can have it again.
    if (!projects.some((project) => project.directory === demoManifest.id)) {
      actions.appendChild(this.action("vn-picker-demo", "plus", "Add demo project", () => void this.addDemo()))
    }
    return actions
  }

  private action(className: string, name: "plus" | "trash-2", label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.classList.add("vn-picker-action", className)
    button.appendChild(icon(name))
    button.appendChild(document.createTextNode(label))
    button.addEventListener("click", onClick, { signal: this.listeners.signal })
    return button
  }

  // Order, then: choose, take the lock, boot, write `lastOpened`. A refusal at the lock changes
  // nothing and says so on the page - from the front door there is nothing to be stranded from,
  // because the previous project was released on the way out.
  private async choose(directory: string): Promise<void> {
    this.refusal = await this.openProject(directory)
    // Null means the project opened, which means this picker is already down: rendering over the
    // editor that replaced it is exactly what the generation guard above is for, and `stop()` has
    // bumped it.
    if (this.refusal !== null) await this.render()
  }

  // It writes under the demo directory's lock, like any other write, and **leaves the author on the
  // picker**: the row appears and the button goes, which is the confirmation. Unlike New project,
  // which opens what it made, this populates the library rather than starting work.
  private async addDemo(): Promise<void> {
    const lock = await takeProjectLock(demoManifest.id)
    if (lock === null) {
      this.refusal = `"${demoManifest.id}" is open in another tab, so the demo cannot be written now.`
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
}

// `lastOpened` first, and the rest by the name they are addressed under. One field can only put one
// row on top, which is what it is for: the project an author wants next is overwhelmingly the one
// they had last, and every other row is found by reading. A genuine recency ordering wants a
// timestamp per project rather than a single name - editor.yaml is defined as losable, so that is
// cheap when something asks for it, and nothing does yet.
const order = (projects: ProjectSummary[], lastOpened: string | undefined): ProjectSummary[] =>
  [...projects].sort((a, b) => {
    if (a.directory === lastOpened) return -1
    if (b.directory === lastOpened) return 1
    return a.directory.localeCompare(b.directory)
  })

// Orange, because the work still runs: the author is on the list, looking at what they have, and
// nothing was lost. Red is for a write that failed or a document that did not parse.
const banner = (message: string): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-refusal")
  elem.setAttribute("role", "status")
  elem.textContent = message
  return elem
}

// An empty picker offering the demo by name is not an empty project: the story is one obvious click
// away, and the author can tell it happened.
const emptyLibrary = (): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-empty")
  elem.textContent = "No projects yet."
  return elem
}

// What the browser has actually promised, re-read on every render rather than assumed. First run
// honestly says "not kept" until the author has entered a project and typed - that is when the store
// asks, because a permission prompt should land on someone who is invested rather than on someone
// who just arrived.
const storageLine = (persisted: boolean): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-storage")
  elem.dataset.vnPersisted = String(persisted)
  elem.textContent = persisted
    ? "This browser has promised to keep your projects."
    : "This browser has not promised to keep your projects - it may clear them if it runs short of space."
  return elem
}
