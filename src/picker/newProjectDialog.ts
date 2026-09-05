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
  const title = dialogField("Title", "What the picker shows. Anything you like.")
  // **Shown rather than hidden, deliberately.** The id names the OPFS directory, the localStorage
  // save key and the export filename; it is not cosmetic, and changing it later is a rename that
  // orphans saves made under the old one. An author who never looks at this field loses nothing, and
  // one who cares can set it now instead of paying for it later.
  const id = dialogField("Id", "Names the folder, the save key and the export file. Changing it later is a rename.")

  const form = document.createElement("div")
  form.append(title.row, id.row)

  // Slugified from the title as it is typed, until the author edits the id themselves - the usual
  // behaviour, and the only one that does not fight someone deliberately choosing an id.
  let tracking = true
  id.input.addEventListener("input", () => (tracking = false))
  title.input.addEventListener("input", () => {
    if (tracking) id.input.value = slugify(title.input.value)
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
      const chosen = id.input.value.trim()
      if (chosen === "") return "Give the project an id - the title has no letters or digits to make one from."
      const problem = validateProjectId(chosen)
      if (problem !== null) return `The id ${problem}`
      // `createProject` writes into projects/<id>/ unconditionally, so this check belongs on the way
      // in. "Make a new project on top of an existing one" is not a thing anyone asked for, unlike
      // the deliberate overwrite a rename confirms.
      if (isTaken(chosen)) return `"${chosen}" already names a project. Choose another id.`
      return null
    },
  })

  if (!confirmed) return null
  return { id: id.input.value.trim(), title: title.input.value.trim() }
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
