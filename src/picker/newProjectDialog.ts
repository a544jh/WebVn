import { dialogField, openDialog } from "../chrome/dialog"
import { validateProjectId } from "../yamlParser/parseManifest"

// The one dialog with fields in it, and the reason the surface it sits on is not `window.prompt`: an
// id needs the schema's own message beside the field it belongs to.

export interface NewProject {
  readonly id: string
  readonly title: string
}

// Resolves with what the author settled on, or null if they backed out. `isTaken` is asked at
// confirm time rather than as the dialog opens, because another tab may have created the id in the
// meantime and this is the last moment before the write.
export const askForNewProject = async (isTaken: (id: string) => boolean): Promise<NewProject | null> => {
  // No note under the title: it is free text and there is nothing to warn anyone about.
  const title = dialogField("Title")
  // **Shown rather than hidden, deliberately.** The id names the OPFS directory, the localStorage
  // save key and the export filename; it is not cosmetic, and changing it later is a rename that
  // orphans saves made under the old one. An author who never looks at this field loses nothing, and
  // one who cares can set it now instead of paying for it later.
  const id = dialogField(
    "Id",
    "Names its folder, its save file and its export. Changing it later orphans saves made under the old one."
  )
  id.input.classList.add("vn-dialog-input-mono")

  const form = document.createElement("div")
  form.classList.add("vn-dialog-form")
  form.append(title.row, id.row)

  // Slugified from the title as it is typed, until the author edits the id themselves - the usual
  // behaviour, and the only one that does not fight someone deliberately choosing an id.
  let tracking = true
  id.input.addEventListener("input", () => {
    tracking = false
    // Typing into a field that was just marked is the author answering; the complaint goes with the
    // thing it was about.
    id.setProblem(null)
  })
  title.input.addEventListener("input", () => {
    if (!tracking) return
    id.input.value = slugify(title.input.value)
    id.setProblem(null)
  })

  const confirmed = await openDialog({
    title: "New project",
    content: form,
    confirmLabel: "Create",
    destructive: false,
    // One rule, asked once. The slugifier is not a second copy of it - it is a *producer* whose
    // output this then judges, so a title that slugifies to something invalid is caught here rather
    // than by a second opinion.
    validate: () => {
      const problem = idProblem(id.input.value.trim(), isTaken)
      id.setProblem(problem)
      return problem === null
    },
  })

  if (!confirmed) return null
  return { id: id.input.value.trim(), title: title.input.value.trim() }
}

// One rule, asked once. The slugifier is not a second copy of it - it is a *producer* whose output
// this then judges, so a title that slugifies to something invalid is caught here rather than by a
// second opinion.
const idProblem = (id: string, isTaken: (id: string) => boolean): string | null => {
  if (id === "") return "Give the project an id - the title has no letters or digits to make one from."
  const problem = validateProjectId(id)
  if (problem !== null) return `An id ${problem}`
  // `createProject` writes into projects/<id>/ unconditionally, so this check belongs on the way in.
  // "Make a new project on top of an existing one" is not a thing anyone asked for, unlike the
  // deliberate overwrite a rename confirms.
  if (isTaken(id)) return "A project with this id already exists."
  return null
}

// Title to id. **A title that slugifies to nothing leaves the field empty and the author fills it
// in** - a project called `project-1` because the slugifier gave up is worse than being asked.
//
// Accents are folded rather than dropped, because dropping them is visibly wrong: without this
// "Ursula's Tale" spelled with a diaeresis becomes `rsula-s-tale`, having lost the first letter
// entirely. That is a producer being better at its job, not a second rule about what an id may be.
export const slugify = (title: string): string =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "")
