import { confirmDialog, noticeDialog } from "./chrome/dialog"
import { moveSaveData } from "./core/save"
import { BootedEditor, bootEditor } from "./editorBoot"
import { OpenProject, ProjectPicker } from "./picker/picker"
import { availableBytes } from "./storage/persistence"
import { ProjectLock, takeProjectLock } from "./storage/projectLock"
import { listProjects, projectSize, renameProject } from "./storage/projectStore"

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
    await this.take(booted)
    return null
  }

  // A booted project becomes *the* session: watched for a rename, handed to the host to wire, and
  // only then filled. Last, so anything the host wired is listening before the boot reports how the
  // manifest fared.
  private async take(booted: BootedEditor): Promise<void> {
    this.session = booted
    // The directory a project is filed under has to follow the identity its manifest declares, and
    // the editor does not know which directory that is - so it reports every adoption and this
    // decides whether one was a rename.
    booted.editor.onManifestAdoptedCallbacks.push((manifest) => {
      if (manifest.id !== booted.directory) void this.rename(booted, manifest.id)
    })
    this.options.onOpen(booted)
    await booted.openProject()
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

  // Renaming: the manifest's id changed, so the directory follows it.
  //
  // **The ordering is the whole of this method**, and it is arranged so that nothing is torn down
  // until every way of refusing has been taken:
  //
  //   ask -> is there room -> is the destination free, or may it be overwritten -> take its lock
  //     -> close the old session -> move the tree -> open the new one
  //
  // The lock comes before the close because a refusal after the close would leave the author with
  // nothing mounted and their work already put down. The two locks are keyed on different
  // directories, so holding both across the swap is not a conflict. And the close comes before the
  // copy so that the storer has flushed and stopped: copying a tree a live storer is still writing
  // into would miss whatever it wrote next.
  //
  // Declining at any point reverts `id:` alone and leaves every other edit in the buffer, which is
  // why this asks the editor to put the field back rather than reloading the project.
  //
  // **This is the one live swap in the tranche, and it does not pass through the picker.** The author
  // is mid-edit in a project that has been renamed underneath them; bouncing them out to re-pick the
  // thing they are already working on would be theatre.
  private async rename(session: BootedEditor, to: string): Promise<void> {
    const from = session.directory
    const revert = () => session.editor.revertManifestId(from)

    const taken = (await listProjects()).some((project) => project.directory === to)
    if (!(await confirmRename(from, to, taken))) return await revert()

    // Before the overwrite delete, which is what keeps the residual "destination deleted, then the
    // copy fails" window as small as it can be. The old tree survives until the new one is complete,
    // so the origin has to hold both at once.
    const room = await roomToCopy(from)
    if (room !== null) {
      await refuseRename(room)
      return await revert()
    }

    const lock = await takeProjectLock(to)
    if (lock === null) {
      await refuseRename(`"${to}" is open in another tab, so nothing was renamed.`)
      return await revert()
    }

    // Everything below here is past the last refusal, so a failure is an error rather than a choice.
    const manifestText = session.editor.getManifestText()
    this.session = null
    this.options.onClose()
    await session.close()

    await renameProject(from, to, manifestText)
    // Before the boot, which reads the destination's saves as it seeds the player. The script is
    // unchanged by a rename, so every saved path still replays and every seen command is still seen
    // - there is no correctness reason to drop them, and this is the one copy that can be kept.
    moveSaveData(from, to)
    await this.openRenamed(to, lock)
  }

  // The other half of the swap, and the reason `bootEditor` takes a lock it did not open: this one
  // is already held, from before the old session was closed.
  private async openRenamed(directory: string, lock: ProjectLock): Promise<void> {
    this.reveal()
    const booted = await bootEditor(this.elements, directory, lock)
    if (booted.kind === "refused") {
      // Unreachable in practice - the lock is in hand and the tree is there - but a boot has a
      // refusal in its type and swallowing one would leave a blank page with no explanation.
      await lock.release()
      await this.showPicker()
      return
    }
    await this.take(booted)
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

// Names both ids, and says what a rename costs. The overwrite is a second question rather than a
// louder version of the first: destroying a project the author did not mention is not the same
// decision as renaming the one they are looking at, and an import that collides with an existing id
// will ask it in the same words.
const confirmRename = async (from: string, to: string, taken: boolean): Promise<boolean> => {
  const renamed = await confirmDialog(
    "Rename this project?",
    [
      `Its folder moves from projects/${from}/ to projects/${to}/, and everything in it goes along - the script, the manifest, every asset, and your saves.`,
      // The half that cannot be fixed from here, and the reason this is worth a sentence: an id is
      // what a *published* build keys its players' saves on, in their browsers, where nothing local
      // can reach them.
      `Anyone already playing a build published under "${from}" will not find their saves after you republish.`,
    ],
    "Rename",
    false
  )
  if (!renamed) return false
  if (!taken) return true

  return confirmDialog(
    `Overwrite "${to}"?`,
    [
      `A project is already filed under projects/${to}/, and renaming onto it destroys that project - its script, its manifest, every asset and its saves.`,
      "It cannot be recovered. There is no export yet, so nothing outside this browser has a copy.",
    ],
    "Overwrite"
  )
}

// Null when there is room. The message otherwise, which says the number rather than only that it did
// not fit - an author who is out of space can do something about it if they know how much by.
const roomToCopy = async (directory: string): Promise<string | null> => {
  const available = await availableBytes()
  // An unknown budget is not a small one: browsers that will not estimate get to try.
  if (available === null) return null

  const size = await projectSize(directory)
  // Twice, not once. The copy itself needs one project's worth, and leaving the origin at exactly
  // zero free only moves the failure to the next write the author makes.
  if (available >= size * 2) return null
  return `This project is ${megabytes(size)} and there is ${megabytes(
    available
  )} free. A rename copies it before removing the original, so it needs about ${megabytes(
    size * 2
  )}. Nothing has been changed.`
}

const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`

// A rename that cannot go ahead, said in the place the author is already looking - inside the
// editor, over the project they are still editing, which is exactly why the dialogs are src/chrome/'s
// rather than the picker's.
const refuseRename = (reason: string): Promise<boolean> => noticeDialog("The project was not renamed", [reason])
