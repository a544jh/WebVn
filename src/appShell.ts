import { BootedEditor, bootEditor } from "./editorBoot"
import { OpenProject, ProjectPicker } from "./picker/picker"

// The two views, and the swap between them. One page: the picker is shown where a project's session
// would be, and opening one never reloads.
//
// **Its own module rather than src/index.ts's**, for the reason editorBoot.ts was lifted out of
// there in the first place - the entry point self-boots on import and grabs elements by id, so
// nothing can exercise it, and this is where the ordering that matters lives. The entry point keeps
// what a test could not run anyway: the element lookups, the page chrome, and the refusal surface.

export interface AppElements {
  readonly pickerDiv: HTMLElement
  readonly sessionDiv: HTMLElement
  readonly vnDiv: HTMLDivElement
  readonly vnEditorDiv: HTMLDivElement
  readonly vnDivContainer?: HTMLElement
}

export interface AppShellOptions {
  // Fired once a project's session is built and on screen, and **before** its buffers are filled, so
  // a host can wire page chrome to it - the export gate has to be listening before the load reports
  // how the manifest fared.
  readonly onOpen: (booted: BootedEditor) => void
  // Fired as that project is put down, before the teardown runs, so the host can take its own
  // listeners off the markup that outlives the session.
  readonly onClose: () => void
}

export class AppShell {
  // One project open at a time, or none. Null is the picker being up, which is also where a cold
  // boot lands: `lastOpened` still exists and still orders the list, but it no longer decides where
  // a boot goes. The front door is the front door.
  private session: BootedEditor | null = null
  private picker: ProjectPicker | null = null

  constructor(private elements: AppElements, private options: AppShellOptions) {}

  // The picker is re-created every time it is shown, and comes down when a project goes up. Nothing
  // re-uses one: it holds a walk of a store that anything may have changed since.
  public async showPicker(): Promise<void> {
    this.elements.sessionDiv.hidden = true
    this.elements.pickerDiv.hidden = false
    this.picker = new ProjectPicker(this.elements.pickerDiv, this.openProject)
    await this.picker.render()
  }

  // Opening is a full boot through the same path a cold start would take, so the player, the
  // renderer and the resolver never learn that other projects exist - they are rebuilt, on a state
  // seeded from this project's own manifest, which is what carries the save key with them.
  //
  // Resolves with a reason when the project could not be opened, which the picker shows while
  // leaving the author on the list. From the front door there is nothing to be stranded from:
  // whatever was open was released on the way out.
  public openProject: OpenProject = async (directory) => {
    this.reveal()

    const booted = await bootEditor(this.elements, directory)
    if (booted.kind === "refused") {
      // Back to the list, which is a place the author can stay. The picker was never stopped, so it
      // is still standing behind this and only has to be shown again.
      this.elements.sessionDiv.hidden = true
      this.elements.pickerDiv.hidden = false
      return booted.reason
    }

    this.picker?.stop()
    this.picker = null
    this.session = booted
    this.options.onOpen(booted)

    // Last, so anything the host wired above is listening before the boot reports how the manifest
    // fared.
    await booted.openProject()
    return null
  }

  // The way back, and the only caller of `close()` in this tranche: flush what is pending, stop the
  // storer, tear the renderer down and release the lock, then draw the list again.
  public async backToProjects(): Promise<void> {
    const closing = this.session
    if (closing === null) return
    this.session = null
    this.options.onClose()
    await closing.close()
    await this.showPicker()
  }

  public getSession(): BootedEditor | null {
    return this.session
  }

  // **The session is revealed before the renderer is built, and that ordering is the whole of this
  // method.** BackgroundRenderer, SpriteRenderer and FreeformTextRenderer each read the root's
  // `clientWidth`/`clientHeight` in their *constructors*, and BackgroundRenderer sizes its canvas
  // from what it reads. A root inside a `hidden` subtree measures zero, so a renderer built there
  // gets a 0x0 canvas that never paints a background and a scene size of zero that puts every sprite
  // and freeform box in the wrong place - silently, with nothing thrown and nothing logged.
  //
  // Measured 2026-09-05, by shipping it: the picker's first version booted and *then* revealed, and
  // the whole stage came up blank. Do not fold these two lines back into the success path below.
  private reveal(): void {
    this.elements.pickerDiv.hidden = true
    this.elements.sessionDiv.hidden = false
  }
}
