import { confirmDialog, noticeDialog } from "./chrome/dialog"
import { VnPath } from "./core/vnPath"
import { moveSaveData, saveToLocalStorage } from "./core/save"
import { BootedEditor, bootEditor } from "./editorBoot"
import { OpenProject, ProjectPicker, RefusalNotice } from "./picker/ProjectPicker"
import { Navigation } from "./projectUrl"
import { availableBytes } from "./storage/persistence"
import { ProjectLock, takeProjectLock } from "./storage/projectLock"
import { listProjects, projectFolder, projectSize, renameProject } from "./storage/projectStore"
import { recoverProjects } from "./storage/recoverProjects"

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
  // Where the open project is written down so a reload can find it again: `?project=<directory>`.
  //
  // **Required rather than defaulted to `browserNavigation()`**, and that is deliberate. The browser
  // suites run in a page whose URL belongs to vitest, so a default would be quietly taken by any
  // suite that forgot to pass one - writing into the runner's own address bar. Two construction
  // sites exist; both say which address bar they are driving.
  readonly navigation: Navigation
}

export class AppShell {
  // One project open at a time, or none. Null is the picker being up, which is also where a cold
  // boot lands: `lastOpened` still exists and still orders the list, but it no longer decides where
  // a boot goes. The front door is the front door.
  private session: BootedEditor | null = null
  private picker: ProjectPicker | null = null

  private navigation: Navigation

  // The tail of the queue below. A resolved promise is "nothing is swapping".
  private swaps: Promise<void> = Promise.resolve()

  constructor(private elements: AppElements, private options: AppShellOptions) {
    this.navigation = options.navigation
  }

  // **Every view swap runs in its turn, and none of them overlap.** Back and forward arrive faster
  // than a session takes to close, so two of these can be in flight at once - and they interleave in
  // exactly the way this module's one load-bearing ordering forbids: the older swap's `showPicker`
  // lands *after* the newer one revealed the session, hiding it again underneath a renderer that has
  // not measured itself yet. That is the 0x0 background canvas of 2026-09-05, arrived at from a new
  // direction, and `test/browser/AppShell.test.ts` now reaches it by going back and then forward.
  //
  // A queue rather than a generation guard, which is what `DomRenderer.render` and `ProjectPicker`
  // use for their own version of this: those two can drop a superseded pass because painting is all
  // it would have done. A swap holds a lock and a storer, so a half-done one cannot be abandoned -
  // it has to finish, and the next has to wait.
  //
  // The chain is repaired after a failure (`work` runs on both settlements, and what is stored back
  // is a promise that cannot reject), because a rejection left in it would mean every later swap
  // rejects without running. The caller still gets the real promise.
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.swaps.then(work, work)
    this.swaps = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  // The boot, and the only thing src/index.ts calls: put the app wherever the URL says, and follow
  // it from then on.
  //
  // **A cold boot still enters the picker**, which is what ticket 02 decided when `lastOpened` came
  // out of the boot path, and this does not undo it: `lastOpened` deciding where a boot lands is the
  // app guessing, while a URL deciding is the author having said so in the one place a browser lets
  // them say it. A bare URL is still the front door.
  public async start(): Promise<void> {
    this.navigation.onNavigate(() => {
      // The picker is the honest place to land when a swap fails partway, which is what the rename's
      // own catch already decided - and it is queued, because a swap may still be running behind
      // the one that threw. A refused boot is not this: that is a returned notice, and `navigateTo`
      // shows it on the picker itself.
      void this.goTo().catch((e) => {
        console.error("The navigation failed partway", e)
        void this.queue(() => this.fallBackToPicker())
      })
    })
    const directory = this.navigation.current()
    // The picker runs this before its walk on every render, and a URL that opens a project skips the
    // picker entirely - so it runs here too, and only when it has to, since `showPicker` runs it
    // anyway. Without it, a rename crashed mid-flight plus a bookmark to the old directory is an
    // author editing a tree that the next picker render will finish removing.
    if (directory !== null) await recoverProjects()
    await this.goTo()
  }

  // Where the URL says the author is, made true: the first load, and every back and forward after
  // it. **It records nothing** - the URL already says where the author went, and this is the half
  // that catches up with it. That is the whole reason the author's own two gestures below are
  // separate methods: a push from in here would mint an entry for the navigation it is reacting to.
  //
  // Not the same as writing nothing: a link that will not open is *replaced* with the bare URL by
  // `fallBackToPicker` below, because the author did not arrive anywhere and the URL has to stop
  // saying they did.
  private goTo(): Promise<void> {
    return this.queue(() => this.navigateTo(this.navigation.current()))
  }

  // The body of the above, run when its turn comes - and handed the address bar **as it reads then**,
  // not as it read when the navigation fired. Two things fall out of that, and the second is the
  // reason for it:
  //
  // - A burst of back-forward-back collapses. Each queued swap reads the same final URL, so the
  //   first does the work and the rest find themselves already there.
  // - **A rename that lands while a Back is queued behind it wins.** The rename rewrites the URL to
  //   the new directory as it reopens; the Back, when its turn comes, reads that and finds the
  //   session already matches. So the Back is swallowed rather than tearing down a project whose
  //   URL now names it. Reading the stale directory instead left the picker drawn under a URL
  //   naming the renamed project, which is the invariant below broken by the one path that could
  //   still break it. Chosen deliberately: a swallowed Back is a smaller wrong than a lying URL.
  private async navigateTo(directory: string | null): Promise<void> {
    if (this.session !== null && this.session.directory === directory) return
    // Before anything is opened, and before the picker is drawn: whatever was open is not where the
    // URL says the author is. `popstate` cannot be refused or awaited, so this close runs after the
    // URL has already moved - which is safe for the same reason a tab close is, the storer's
    // debounce being the guarantee and every flush a bonus.
    await this.closeSession()
    if (directory === null) return await this.showPicker()

    const refusal = await this.openSession(directory)
    if (refusal === null) return
    // A link to a project that is not there, or is open elsewhere. The refusal says both halves of
    // what to tell the author; this only has to put them where they can act on it.
    await this.fallBackToPicker(refusal)
  }

  // **The way back to the list when something did not work, and the only one.** The URL is replaced
  // with the bare one rather than left naming a project the author is not in: the invariant worth
  // keeping is that the URL matches the view, and a URL that lied would make back and forward
  // describe a history that never happened. The cost is real and is the honest half of the trade -
  // closing the other tab and reloading gives the picker rather than the project.
  //
  // One function because there were four of these and one of them had forgotten the `replace`,
  // which is precisely the failure a spelled-out pair invites.
  private fallBackToPicker(refusal: RefusalNotice | null = null): Promise<void> {
    this.navigation.replace(null)
    return this.showPicker(refusal)
  }

  // The picker is re-created every time it is shown, and comes down when a project goes up. Nothing
  // re-uses one: it holds a walk of a store that anything may have changed since.
  //
  // Private, because drawing the list is no longer the whole of arriving at it: `start` registers
  // the shell on the address bar and `fallBackToPicker` clears the URL, and a caller reaching past
  // both got a picker that no browser Back could reach. A test that wants the front door calls
  // `start()`, which is what src/index.ts calls.
  private async showPicker(refusal: RefusalNotice | null = null): Promise<void> {
    this.show("picker")
    this.picker = new ProjectPicker(this.elements.pickerDiv, this.openProject, refusal)
    await this.picker.render()
  }

  // The author picked a row, which is a place they navigated to - so it is recorded, and their Back
  // comes back here. **After the open and only on success**: a refusal leaves the URL saying what it
  // already said, which is the picker they are still looking at.
  public openProject: OpenProject = async (directory) => {
    const refusal = await this.queue(() => this.openSession(directory))
    if (refusal === null) this.navigation.push(directory)
    return refusal
  }

  // Opening is a full boot through the same path a cold start would take, so the player, the
  // renderer and the resolver never learn that other projects exist - they are rebuilt, on a state
  // seeded from this project's own manifest, which is what carries the save key with them.
  //
  // Resolves with a reason when the project could not be opened, which the picker shows while
  // leaving the author on the list. From the front door there is nothing to be stranded from:
  // whatever was open was released on the way out.
  private async openSession(directory: string): Promise<RefusalNotice | null> {
    this.reveal()

    const booted = await bootEditor(this.elements, directory)
    if (booted.kind === "refused") {
      // Back to the list, which is a place the author can stay. The picker was never stopped, so it
      // is still standing behind this and only has to be shown again.
      this.show("picker")
      // The boot's two halves become the banner's two: the news, then what to do about it.
      return { lead: booted.reason, detail: booted.advice }
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
      if (manifest.id === booted.directory) return
      // Everything past the rename's last refusal is an error rather than a choice, and by then the
      // old session is already down - so a failure there would otherwise leave an empty page. The
      // picker is the honest place to land: the store has been left in a state its recovery knows
      // how to finish, and the list is what shows the author what they still have.
      //
      // Queued like every other swap, dialogs included. A `popstate` arriving while the rename is
      // asking would otherwise close the session this is about to move, and then move a tree with a
      // torn session still pointing into it. Waiting is not a cost the author can feel: what is on
      // screen at that moment is a modal.
      void this.queue(() => this.rename(booted, manifest.id)).catch((e) => {
        console.error("The rename failed partway", e)
        // Queued in its own right: the failed rename's turn is over, and something may already be
        // waiting behind it.
        void this.queue(() => {
          this.session = null
          return this.fallBackToPicker()
        })
      })
    })
    this.options.onOpen(booted)
    await booted.openProject()
  }

  // The way back: put the project down, draw the list, and record that the author is on it. The
  // guard is what makes a press with nothing open do nothing at all rather than redraw the picker
  // over itself and push an entry for standing still.
  public async backToProjects(): Promise<void> {
    // Asked when this swap's turn comes rather than when the button was pressed: what is open by
    // then is what there is to close.
    const left = await this.queue(async () => {
      if (this.session === null) return false
      await this.closeSession()
      await this.showPicker()
      return true
    })
    if (left) this.navigation.push(null)
  }

  // Closing the open project, in CONTEXT.md's sense of the word: flush what is pending, stop the
  // storer, tear the renderer down and release the lock. Two callers - the button above, and
  // `navigateTo` when the URL moved off this project - so it is separate from the drawing and the
  // recording that each of them does next. Named for the glossary rather than as the other half of
  // an `enter`/`leave` pair: this project has a word for it already.
  private async closeSession(): Promise<void> {
    const closing = this.session
    if (closing === null) return
    this.session = null
    this.options.onClose()
    await closing.close()
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

    if (!(await confirmRename(from, to))) return await revert()

    // Before the overwrite is even *offered*, not merely before the delete it leads to: there is no
    // sense asking an author to destroy a project to make room for a copy that will not fit. The old
    // tree survives until the new one is complete, so the origin has to hold both at once.
    const room = await roomProblem(from)
    if (room !== null) {
      await refuseRename(room)
      return await revert()
    }

    const taken = (await listProjects()).some((project) => project.directory === to)
    if (taken && !(await confirmOverwrite(to))) return await revert()

    const lock = await takeProjectLock(to)
    if (lock === null) {
      await refuseRename(`"${to}" is open in another tab, so nothing was renamed.`)
      return await revert()
    }

    // Everything below here is past the last refusal, so a failure is an error rather than a choice.
    const manifestText = session.editor.getManifestText()
    // Where the author is in the story. A rename does not change the story, so landing them back at
    // its first line would be the same theatre as bouncing them out to the picker - and the whole
    // point of doing this without the picker is that nothing about their session should change.
    const playhead = session.player.path
    // A close flushes the *buffers* and not the player's save data, and seen commands move on every
    // undo and decision without one - so this is written by hand, under the id the project is still
    // filed as, for the move below to carry.
    saveToLocalStorage(from, session.player.getGlobalSaveData())

    this.session = null
    this.options.onClose()
    await session.close()

    await renameProject(from, to, manifestText)
    // Before the boot, which reads the destination's saves as it seeds the player. The script is
    // unchanged by a rename, so every saved path still replays and every seen command is still seen
    // - there is no correctness reason to drop them, and this is the one copy that can be kept.
    moveSaveData(from, to)
    await this.openRenamed(to, lock, playhead)
  }

  // The other half of the swap, and the reason `bootEditor` takes a lock it did not open: this one
  // is already held, from before the old session was closed.
  private async openRenamed(directory: string, lock: ProjectLock, playhead: VnPath): Promise<void> {
    this.reveal()
    const booted = await bootEditor(this.elements, directory, lock)
    if (booted.kind === "refused") {
      // Unreachable in practice - the lock is in hand and the tree is there - but a boot has a
      // refusal in its type and swallowing one would leave a blank page with no explanation.
      await lock.release()
      await this.fallBackToPicker()
      return
    }
    await this.take(booted)
    // **Replaced, not pushed**: the project moved under the author, they did not navigate. The entry
    // being overwritten is the one that opening this project pushed, which named the old directory,
    // so Back still goes wherever the author came from rather than to the project's old name.
    //
    // It clears *that* entry and no other. Open a project, go back to the list, open it again, and
    // the history holds two entries naming it; a rename rewrites the current one and the older one
    // goes on naming a directory that is gone. Walking back to it gets the boot's fourth refusal
    // and the list, which is the reason that refusal is worth having - `replaceState` reaches one
    // entry and there is no API that reaches the rest.
    this.navigation.replace(directory)

    // After the load, not instead of it: the story has to be built before a path through it can be
    // walked. The render is what moves the gutter marker and the cursor with it, since the editor
    // follows the renderer rather than the player.
    booted.player.restorePath(playhead)
    booted.renderer.render(false)
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
    this.show("session")
  }

  // The swap itself, in the one place, so the two views cannot come to disagree about which of them
  // is up - which they can when each caller spells both halves for itself.
  private show(view: "picker" | "session"): void {
    this.elements.pickerDiv.hidden = view !== "picker"
    this.elements.sessionDiv.hidden = view !== "session"
  }
}

// Names both ids, and says what a rename costs.
const confirmRename = (from: string, to: string): Promise<boolean> =>
  confirmDialog(
    "Rename this project?",
    [
      `Its folder moves from ${projectFolder(from)} to ${projectFolder(
        to
      )}, and everything in it goes along - the script, the manifest, every asset, and your saves.`,
      // The half that cannot be fixed from here, and the reason this is worth a sentence: an id is
      // what a *published* build keys its players' saves on, in their browsers, where nothing local
      // can reach them.
      `Anyone already playing a build published under "${from}" will not find their saves after you republish.`,
    ],
    "Rename",
    false
  )

// A second question rather than a louder version of the first: destroying a project the author did
// not mention is not the same decision as renaming the one they are looking at, and an import that
// collides with an existing id will ask it in the same words.
const confirmOverwrite = (to: string): Promise<boolean> =>
  confirmDialog(
    `Overwrite "${to}"?`,
    [
      `A project is already filed under ${projectFolder(
        to
      )}, and renaming onto it destroys that project - its script, its manifest, every asset and its saves.`,
      "It cannot be recovered. There is no export yet, so nothing outside this browser has a copy.",
    ],
    "Overwrite"
  )

// The reason a copy will not fit, or null when it will - `problem or null`, the shape
// `validateProjectId` and `idProblem` already use here, and named for it: `roomToCopy` returned null
// when there *was* room, which is the wrong way round for anyone reading the call.
//
// The message says the numbers rather than only that it did not fit: an author who is out of space
// can do something about it if they know how much by.
const roomProblem = async (directory: string): Promise<string | null> => {
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
