import { confirmDestroyingProject, confirmOverwritingProject } from "../chrome/dialog"
import { downloadBlob } from "../chrome/download"
import { icon, IconName } from "../chrome/icons"
import { deleteSaveData } from "../core/save"
import { demoManifest } from "../demoStory"
import { ArchiveRefusal, exportProject, importArchive } from "../storage/archive"
import { isPersisted } from "../storage/persistence"
import { takeProjectLock } from "../storage/projectLock"
import {
  deleteProject,
  EditorState,
  forgetProject,
  listProjects,
  mintProject,
  projectFolder,
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
// holding a title strip with the actions in it, and the rows inside that panel. The page is also the
// drop target for an archive, which is the one thing on it that is not drawn.

// What the host does when a row is chosen. Resolves with the notice to show when the project could
// not be opened, or null when it was, in which case this picker is already down. Refusing is a place
// the author can stay: they are on the list, looking at what they have.
//
// **The whole notice, not a reason to dress up here.** Each refusal knows its own next step - close
// the other tab, or pick something that exists - and a picker that appended one line of advice to
// every reason said "Close it there" under "there is no project called that".
export type OpenProject = (directory: string) => Promise<RefusalNotice | null>

// What the panel is saying about itself right now, and in which of the two tones this page has. A
// **refusal** is orange, because something did not happen; a **result** is neither orange nor green,
// because it is news rather than a status - and `design.md` is explicit that the status colours are
// not decoration and spending one here would cost what they mean.
//
// One field rather than two, because the panel says one thing at a time: the last thing that
// happened is the thing worth reading.
type Tone = "refusal" | "result"

interface Announcement extends RefusalNotice {
  readonly tone: Tone
}

// A row's own line, and what the list is ordered by. `openedAt` is undefined for a project nobody
// has opened yet, which is a thing to say rather than a zero; `createdAt` is undefined for one that
// predates this file recording it.
interface ListedProject extends ProjectSummary {
  readonly openedAt: Date | undefined
  readonly createdAt: Date | undefined
  // Undefined for a project that has never been exported, which the row states rather than warns
  // about - there is no nag, and no colour spent on it.
  readonly exportedAt: Date | undefined
}

export class ProjectPicker {
  // Everything this view listens to, so `stop()` takes it all off at once.
  //
  // **It stopped being insurance when the drop target arrived.** Every other listener registered
  // through it is on an element this picker made inside its own root, and both `render` and `stop`
  // call `replaceChildren` - so those are detached and unreferenced whatever happens. The four drag
  // listeners are not: they are on the root itself, which is the host's element and outlives every
  // picker mounted into it, so a superseded picker that kept them would go on answering drops after
  // a project had opened over it. That is exactly the bug ProjectStoring's `stop()` closes.
  private listeners = new AbortController()

  // Whether a file is being dragged over the page. Held here rather than read off the DOM because a
  // render in the middle of a drag has to draw the state the drag is in.
  private dropping = false

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
  constructor(private root: HTMLElement, private openProject: OpenProject, refusal: RefusalNotice | null = null) {
    this.announcement = refusal === null ? null : { ...refusal, tone: "refusal" }
    this.watchForDrops()
  }

  private announcement: Announcement | null

  // The two ways this page has of saying something, so no call site has to remember which tone goes
  // with which kind of news.
  private refuse(lead: string, detail: string): void {
    this.announcement = { lead, detail, tone: "refusal" }
  }

  private report(lead: string, detail: string): void {
    this.announcement = { lead, detail, tone: "result" }
  }

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
    // A render can land mid-drag - a drop refused while another is still hovering - so the dashed
    // border is drawn from the state rather than only toggled onto it.
    panel.classList.toggle("vn-picker-dropping", this.dropping)
    panel.appendChild(this.drawPanelBar(projects))
    // Inside the panel and under its title strip, because it is news about this list rather than
    // about the page - the artboard puts it there and it is right: the row it names is under it.
    if (this.announcement !== null) panel.appendChild(banner(this.announcement))
    panel.appendChild(this.drawList(projects))
    page.appendChild(panel)

    page.appendChild(storageLine(persisted))
    return page
  }

  // The panel's title strip: what this is, then the things you can do to it.
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
    this.drawImport(bar)
    bar.appendChild(this.action("vn-picker-new", "plus", "New project", () => void this.create()))
    return bar
  }

  // **Import project, beside New project**, with a hidden file input behind it - the platform's own
  // control, styled by nobody, is not a button this page can draw. `accept` is a hint to the file
  // dialog and nothing more: what an archive actually is, `importArchive` decides by sniffing the
  // magic bytes.
  //
  // The input is the button's *sibling* rather than its child, which is not a layout preference: a
  // click on a child input bubbles back to the button, whose handler clicks the input, which is a
  // loop with no bottom.
  private drawImport(bar: HTMLElement): void {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".zip"
    input.classList.add("vn-picker-file")
    input.hidden = true
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0]
        if (file !== undefined) void this.importFile(file)
      },
      { signal: this.listeners.signal }
    )

    bar.appendChild(input)
    bar.appendChild(this.action("vn-picker-import", "download", "Import project", () => input.click()))
  }

  private drawList(projects: ListedProject[]): HTMLElement {
    const list = document.createElement("ul")
    list.classList.add("vn-picker-projects")
    // Drawn on every render and shown by CSS only while a file is over the page, which takes the
    // rows' place rather than sitting above them: what the author is being told is what will happen
    // if they let go, and the list is not the answer to that.
    list.appendChild(dropInvitation())
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
      // **Both consequences on the one red line**, which is what lets the greyed-out export control
      // need no label of its own: the project opens, and it cannot leave the browser until the
      // manifest declares an id to name an archive after (ADR 0005).
      problem.textContent = "manifest.yaml does not parse - opens anyway, and cannot be exported until it does"
      open.appendChild(problem)
    }

    const meta = document.createElement("span")
    meta.classList.add("vn-picker-opened")
    meta.textContent = metaLine(project)
    open.appendChild(meta)

    open.addEventListener("click", () => void this.choose(project.directory), { signal: this.listeners.signal })
    row.appendChild(open)

    // Both icon controls in one group, so the row has one right-hand edge rather than two things
    // floated at it.
    const controls = document.createElement("div")
    controls.classList.add("vn-picker-controls")
    controls.appendChild(this.drawExport(project))
    controls.appendChild(this.drawDelete(project))
    row.appendChild(controls)

    return row
  }

  // **Any project can be exported without being opened**, which is half of why this control is on the
  // row at all: the other half is that a project too broken to work in can still be got out - except
  // that a project whose manifest does not parse is exactly the one that cannot, so the control is
  // disabled and the row says why.
  private drawExport(project: ListedProject): HTMLButtonElement {
    const button = this.control(project, "upload", `Export ${project.title ?? project.directory}`)
    button.classList.add("vn-picker-export")
    button.disabled = project.id === null
    button.title = button.disabled
      ? "manifest.yaml does not parse, so there is no id to name an archive after"
      : "Export this project as a .webvn.zip"
    button.addEventListener("click", () => void this.exportRow(project), { signal: this.listeners.signal })
    return button
  }

  private drawDelete(project: ListedProject): HTMLButtonElement {
    const button = this.control(project, "trash-2", `Delete ${project.title ?? project.directory}`)
    button.classList.add("vn-picker-delete")
    button.title = "Delete this project"
    button.addEventListener("click", () => void this.remove(project), { signal: this.listeners.signal })
    return button
  }

  // The row's own button carries the name, so an icon says the rest - and an icon with no text needs
  // the label a screen reader looks for.
  private control(project: ListedProject, name: IconName, label: string): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.classList.add("vn-picker-control")
    button.dataset.vnProject = project.directory
    button.setAttribute("aria-label", label)
    button.appendChild(icon(name, 15))
    return button
  }

  private action(className: string, name: IconName | null, label: string, onClick: () => void): HTMLButtonElement {
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
    const refusal = await this.openProject(directory)
    // Null means the project opened, which means this picker is already down: rendering over the
    // editor that replaced it is exactly what the generation guard above is for, and `stop()` has
    // bumped it.
    if (refusal === null) return
    this.announcement = { ...refusal, tone: "refusal" }
    await this.render()
  }

  // It writes under the demo directory's lock, like any other write, and **leaves the author on the
  // picker**: the row appears and the button goes, which is the confirmation. Unlike New project,
  // which opens what it made, this populates the library rather than starting work.
  private async addDemo(): Promise<void> {
    const lock = await takeProjectLock(demoManifest.id)
    if (lock === null) {
      this.refuse(
        `${demoManifest.title} is open in another tab.`,
        "The demo was not written. Close it there and try again."
      )
      await this.render()
      return
    }
    try {
      this.announcement = null
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
      this.refuse(`"${chosen.id}" already names a project.`, "Nothing was created.")
      await this.render()
      return
    }

    await mintProject(chosen.id, chosen.title)
    const refusal = await this.openProject(chosen.id)
    if (refusal === null) return
    // The one place the refusal's own advice is overridden, because there is something more specific
    // to say: what the author asked for did happen, and only the opening did not.
    this.announcement = { ...refusal, detail: `"${chosen.id}" was created, but not opened.`, tone: "refusal" }
    await this.render()
  }

  // Ask first, and say the project cannot be recovered from here - which since tranche 3 is the whole
  // of what is true: an archive the author exported is a copy, and the row above says when they last
  // made one.
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
    const confirmed = await confirmDestroyingProject(
      `Delete "${name}"?`,
      `This removes ${projectFolder(
        project.directory
      )} and everything in it - the script, the manifest and every asset.`,
      "Delete"
    )
    if (!confirmed) return

    const lock = await takeProjectLock(project.directory)
    if (lock === null) {
      this.refuse(`${name} is open in another tab.`, "It was not deleted.")
      await this.render()
      return
    }
    try {
      this.announcement = null
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

  // An archive arriving, from either gesture: the Import project button's file input, or a drop.
  //
  // **The author stays on the picker afterwards, with the new row visible**, exactly as Add demo
  // project does - populating a library and starting work are different intents, and after an import
  // what an author most wants is to see the thing arrived intact. So there is no success banner
  // either: the row is the confirmation.
  private async importFile(file: File): Promise<void> {
    this.busy(".vn-picker-import", "Importing\u2026")

    const result = await importArchive(file, {
      confirmOverwrite: (plan) =>
        confirmOverwritingProject(
          plan.id,
          projectFolder(plan.id),
          "importing",
          "The archive you are importing is untouched, and can be imported again.",
          "To keep both, cancel, rename the project you have, and import again."
        ),
    }).catch(broke("imported", "Whatever was written is not a project, and the library tidies it away."))

    // A cancelled overwrite is not news: the author decided, nothing happened, and the render below
    // is only there to put the button back. An import that landed **is** news, and saying so is not
    // decoration: on an overwrite no row arrives, so the only thing that changes on the page is a
    // date in a muted line, and the one import an author is most anxious about would otherwise report
    // nothing at all.
    if (result.kind === "refused") this.refuse(`${file.name} was not imported: ${result.problem}.`, result.advice)
    else if (result.kind === "imported") {
      this.report(
        `${file.name} was imported.`,
        result.overwrote
          ? `"${result.title}" replaced what was filed under ${projectFolder(result.directory)}.`
          : `"${result.title}" is in your library.`
      )
    } else this.announcement = null
    await this.render()
  }

  // A project leaving, from the row rather than from inside the editor - so **the lock is this
  // method's to take**, and a walk that overlapped another tab's writes would be a walk over a tree
  // being written into. The editor's own button has the other half of that asymmetry: it holds this
  // lock already and flushes its storer instead.
  private async exportRow(project: ListedProject): Promise<void> {
    const name = project.title ?? project.directory
    this.busy(`.vn-picker-export[data-vn-project="${cssValue(project.directory)}"]`, "Exporting\u2026")

    const lock = await takeProjectLock(project.directory)
    if (lock === null) {
      this.refuse(`${name} is open in another tab.`, "It was not exported. Close it there.")
      await this.render()
      return
    }
    try {
      const result = await exportProject(project.directory).catch(broke("exported", "Nothing was written."))
      if (result.kind === "refused") {
        this.refuse(`${name} was not exported: ${result.problem}.`, result.advice)
      } else {
        // Said rather than left to the row's own line: "exported just now" appears down among the
        // dates, and what an author wants confirmed is that a file left the browser.
        this.report(`${name} was exported.`, `Your browser is saving ${result.filename}.`)
        downloadBlob(result.blob, result.filename)
      }
    } finally {
      await lock.release()
    }
    // Last, so the row's "exported just now" is drawn from what the store now says rather than from
    // what this method knows.
    await this.render()
  }

  // A control that is working: disabled, and saying so wherever it has room to. No progress bar - the
  // honest unit of progress here (entries) is not the one the author perceives (bytes) - but a click
  // that appears to do nothing for three seconds gets clicked again.
  //
  // A labelled action says it in place of its label; a row's icon control has nowhere to put it but
  // its tooltip, which is the difference between the two kinds of button on this page rather than a
  // difference between importing and exporting.
  //
  // Nothing puts it back: every path through both callers ends in a render, which draws the control
  // fresh.
  private busy(selector: string, saying: string): void {
    const control = this.root.querySelector<HTMLButtonElement>(selector)
    if (control === null) return
    control.disabled = true
    control.title = saying
    if (control.classList.contains("vn-picker-action")) control.replaceChildren(document.createTextNode(saying))
  }

  // **The whole page is the drop target**, not a zone inside it: an author dragging an archive at the
  // library means the library, and a target they have to find is a target they will miss.
  //
  // On the root rather than on anything drawn, so a drag survives the renders this picker does
  // underneath it - and taken off by `stop()`, because the root is the host's element and outlives
  // every picker mounted into it.
  private watchForDrops(): void {
    const { signal } = this.listeners
    // A counter rather than a flag: `dragleave` fires every time the pointer crosses into a child, so
    // a flag cleared on it flickers off as the cursor moves over a row.
    let depth = 0
    const carriesFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes("Files") ?? false

    this.root.addEventListener(
      "dragenter",
      (event) => {
        if (!carriesFiles(event)) return
        depth += 1
        this.setDropping(true)
      },
      { signal }
    )
    this.root.addEventListener(
      "dragover",
      (event) => {
        if (!carriesFiles(event)) return
        // Without this the browser takes the drop itself and navigates to the file, which is the
        // default nobody wants and the one thing a drop target must say no to.
        event.preventDefault()
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy"
      },
      { signal }
    )
    this.root.addEventListener(
      "dragleave",
      () => {
        depth = Math.max(0, depth - 1)
        if (depth === 0) this.setDropping(false)
      },
      { signal }
    )
    this.root.addEventListener(
      "drop",
      (event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        depth = 0
        this.setDropping(false)
        void this.dropped([...(event.dataTransfer?.files ?? [])])
      },
      { signal }
    )
  }

  private setDropping(dropping: boolean): void {
    this.dropping = dropping
    this.root.querySelector(".vn-picker-panel")?.classList.toggle("vn-picker-dropping", dropping)
  }

  // **A multi-file drop is refused** rather than silently picking one. Importing three projects from
  // one gesture is a bulk operation nobody asked for, and quietly ignoring two of three files is the
  // worse failure.
  private async dropped(files: File[]): Promise<void> {
    if (files.length === 0) return
    if (files.length > 1) {
      this.refuse(`${files.length} files were dropped.`, "Import takes one archive at a time. Nothing was written.")
      await this.render()
      return
    }
    await this.importFile(files[0])
  }
}

// **An archive can fail rather than be refused**, and the two are different: a refusal is a decision
// this code made about a file, while this is the file - or the store under it - not doing what it
// said. A truncated archive whose central directory still reads is the case to picture. It is caught
// here rather than left to reject, because the caller is a `void`ed handler: an unhandled rejection
// there would leave the control reading "Importing..." for the rest of the page's life.
//
// The store needs no help either way. An import that dies partway has written no manifest, so what it
// leaves is not a project and the next render's sweep removes it.
const broke =
  (verb: string, advice: string) =>
  (e: unknown): ArchiveRefusal => {
    console.error(`The project could not be ${verb}`, e)
    return { kind: "refused", problem: "could not be read to the end", advice }
  }

// A directory name inside an attribute selector. Every id that reaches here has been through
// `validateProjectId`, so this can only ever be a no-op - but a selector built by interpolation is
// the shape that stops being safe the moment the charset does, and `CSS.escape` is one call.
const cssValue = (value: string): string => (typeof CSS?.escape === "function" ? CSS.escape(value) : value)

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
      exportedAt: parseDate(state.exported?.[project.directory]),
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

// **One line, with the export fact after a middle dot** rather than a second line under the first.
// The row is already three lines deep on a project with a problem, and "when" is one question with
// two answers rather than two questions.
//
// A project whose manifest does not parse says nothing about exporting, because it cannot be
// exported at all - its red line above says so, and repeating "never exported" under it would read
// as a second complaint rather than the same one.
const metaLine = (project: ListedProject): string =>
  project.id === null
    ? openedLabel(project.openedAt)
    : `${openedLabel(project.openedAt)} \u00b7 ${exportedLabel(project.exportedAt)}`

// "opened just now", "exported yesterday", "opened 5 days ago". Through Intl rather than a table of
// plurals, which is a table that only works in English - and one formatter for both facts, because
// the row draws them side by side and two copies would drift in the small hours.
const agoLabel = (verb: string, at: Date): string => {
  const elapsed = Date.now() - at.getTime()
  if (elapsed < MINUTE) return `${verb} just now`

  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  if (elapsed < HOUR) return `${verb} ${relative.format(-Math.round(elapsed / MINUTE), "minute")}`
  if (elapsed < DAY) return `${verb} ${relative.format(-Math.round(elapsed / HOUR), "hour")}`
  return `${verb} ${relative.format(-Math.round(elapsed / DAY), "day")}`
}

const openedLabel = (at: Date | undefined): string => (at === undefined ? "not opened yet" : agoLabel("opened", at))

// **A statement, not a warning**: no colour, no icon, no badge. The status colours mean things -
// green stored, orange "needs attention and the work still runs", red "did not parse, or a write
// failed" - and spending orange on a project nobody has backed up would cost that meaning. There is
// no nag either; this line in the place the author is already looking is most of a nag's value at
// none of its interaction cost.
const exportedLabel = (at: Date | undefined): string => (at === undefined ? "never exported" : agoLabel("exported", at))

// What could not be opened, and what to do about it. Two parts because the artboard reads that way
// and it is right: the first sentence is the news and carries the weight, the second is the advice.
//
// Exported for the one refusal this picker does not raise: a URL naming a project that would not
// open, which is refused before there is a picker to put it on.
export interface RefusalNotice {
  readonly lead: string
  readonly detail: string
}

// A refusal is **orange**, because the work still runs: the author is on the list, looking at what
// they have, and nothing was lost. Red is for a write that failed or a document that did not parse.
// Orange takes black text - it is light enough that white on it fails to read, which editor.css says
// outright.
//
// A result is **neither**, and that is the point: green means stored, and spending it on "this
// happened" would cost what it means. It is the panel's own white, marked out by a rule and by the
// weight the lead already carries.
const banner = (announcement: Announcement): HTMLElement => {
  const elem = document.createElement("p")
  elem.classList.add("vn-picker-banner")
  elem.classList.add(announcement.tone === "refusal" ? "vn-picker-refusal" : "vn-picker-result")
  elem.setAttribute("role", "status")

  const lead = document.createElement("span")
  lead.classList.add("vn-picker-banner-lead")
  lead.textContent = announcement.lead
  elem.append(lead, ` ${announcement.detail}`)
  return elem
}

// What is about to happen if the author lets go, in the rows' own place. Named as the file it wants
// rather than as an instruction about the button, because by this point the author is already
// holding the thing.
const dropInvitation = (): HTMLElement => {
  const elem = document.createElement("li")
  elem.classList.add("vn-picker-drop")

  const arrow = document.createElement("span")
  arrow.classList.add("vn-picker-drop-icon")
  arrow.appendChild(icon("download", 22))
  elem.appendChild(arrow)

  const lead = document.createElement("span")
  lead.classList.add("vn-picker-drop-lead")
  const extension = document.createElement("span")
  extension.classList.add("vn-picker-identifier")
  extension.textContent = ".webvn.zip"
  lead.append("Drop a ", extension, " to import it")
  elem.appendChild(lead)

  const one = document.createElement("span")
  one.classList.add("vn-picker-drop-note")
  one.textContent = "One at a time"
  elem.appendChild(one)
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
