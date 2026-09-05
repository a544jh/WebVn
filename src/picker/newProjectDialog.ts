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
  title.input.addEventListener("input", () => title.setProblem(null))
  // **Shown rather than hidden, deliberately.** The id names the OPFS directory, the localStorage
  // save key and the export filename; it is not cosmetic. An author who never looks at this field
  // loses nothing, and one who cares can set it now instead of paying for it later.
  //
  // The note says what renaming actually costs, which is not what it cost when the design canvas
  // drew this field: a rename now carries the author's own saves to the new id (`moveSaveData`), so
  // "orphans saves made under the old one" had become untrue of the only saves the author can see.
  // What a rename does still break is saves in *other people's* browsers, under a build already
  // published as the old id, which nothing local can reach. Naming the half that survives is what
  // makes the half that does not land as information rather than as a scare.
  const id = dialogField(
    "Id",
    "Names its folder, its saves and its export file. Renaming later brings your work along, but breaks saves for anyone already playing a build you published."
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
    // Both fields, and both marked, so an author fixing one is not sent back for the other.
    validate: () => {
      // The manifest schema has `title: z.string().min(1)`, so a blank one mints a manifest that
      // does not parse - the red gutter this dialog's whole minting path exists to avoid, reached
      // from the other side. Caught here rather than left to the schema, because here is where the
      // author can still do something about it.
      const blankTitle = title.input.value.trim() === "" ? "Give the project a title." : null
      title.setProblem(blankTitle)

      const problem = idProblem(id.input.value.trim(), isTaken)
      id.setProblem(problem)
      return blankTitle === null && problem === null
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
