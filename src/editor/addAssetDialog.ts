import { dialogField, dialogSelect, DialogText, identifier, openDialog } from "../chrome/dialog"
import { AssetDeclaration, AssetKind } from "../core/manifest"
import { declaredFilePath } from "../domRenderer/assetPaths"
import { validateActorId, validateAssetId } from "../yamlParser/parseManifest"

// What `Add asset` asks about the file the author picked: what kind it is, whose sprite it is, what
// the script will name it, and what to store it under.
//
// **The file is picked first**, through a plain `<input type="file">` the panel owns - so this
// dialog knows what it is talking about and can prefill the kind from the file's type and the id
// from its basename. Drawn on the design canvas as `AddAsset`, `AddAssetSprite` and
// `AddAssetRefused`; read those before changing the layout.
//
// Every rule it enforces comes from `parseManifest.ts` rather than being restated here, and its
// message lands beside the field it belongs to - which is the whole reason this surface is not
// `window.prompt`.

// The last option of the Actor select, for a sprite whose actor nobody has cast yet. Identified by
// position rather than by its text, because an actor id has to be capitalized and "New actor..."
// is - so an author could in principle name one that.
const NEW_ACTOR = "New actor..."

// What each kind is called in the Kind select, and which `AssetKind` each stands for.
const KINDS: ReadonlyArray<[label: string, kind: AssetKind]> = [
  ["Background", "background"],
  ["Audio", "audio"],
  ["Sprite", "sprite"],
]

// What the author is told they already have one of. The schema's noun for each declaration, so a
// refusal names the group the collision is in rather than "an asset".
const NOUNS: Record<AssetKind, string> = {
  background: "A background",
  audio: "An audio asset",
  sprite: "A sprite",
}

// The line a script would write to reach this asset, which is what the Id field is for. A sprite is
// named inside a `show:` rather than by a one-word command, so that one says it in words.
const scriptUse = (kind: AssetKind, id: string): DialogText =>
  kind === "sprite"
    ? "What the script names this sprite."
    : ["What the script names. ", identifier(`${kind === "background" ? "bg" : "bgm"}: ${id}`)]

export interface AssetChoices {
  // The actors the manifest declares, in its own order, for the Actor select.
  readonly actors: string[]
  // Whether that group already declares that id. Asked of the caller rather than worked out here,
  // because the panel is the thing holding the declarations.
  readonly isDeclared: (declaration: AssetDeclaration) => boolean
  // Every file already inside the project, by its path within it. **A set rather than a lookup**,
  // because `validate` is synchronous and asking OPFS is not - and the project is locked for the
  // length of the session, so nothing else can put a file there while the dialog is up.
  readonly taken: ReadonlySet<string>
}

// Resolves with what the author settled on, or null if they backed out.
export const askForAsset = async (file: File, choices: AssetChoices): Promise<AssetDeclaration | null> => {
  const kind = dialogSelect(
    "Kind",
    KINDS.map(([label]) => label)
  )
  // A guess from the file's own type, and the author can change it. Anything that is not audio reads
  // as a background, which is the common case for an image and the least surprising default for a
  // file the browser could not type at all.
  kind.control.selectedIndex = file.type.startsWith("audio/") ? 1 : 0

  const actor = dialogSelect("Actor", [...choices.actors, NEW_ACTOR])
  const actorName = dialogField("Actor name")

  // Mono on both, because an id and a filename are identifiers rather than names - the same rule the
  // new-project dialog's Id field follows.
  const id = dialogField("Id")
  id.input.classList.add("vn-dialog-input-mono")
  id.input.value = basename(file.name)

  // **A field, not derived from the id.** `assetIdSchema` is explicit that nothing derives a filename
  // from an asset id, so deriving one would silently impose a charset the schema does not enforce -
  // and the first id with a `/` in it would write somewhere nobody asked for.
  const fileName = dialogField("File name")
  fileName.input.classList.add("vn-dialog-input-mono")
  fileName.input.value = file.name

  const form = document.createElement("div")
  form.classList.add("vn-dialog-form")
  form.append(kind.row, actor.row, actorName.row, id.row, fileName.row)

  const chosenKind = (): AssetKind => KINDS[kind.control.selectedIndex][1]
  const newActor = (): boolean => actor.control.selectedIndex === choices.actors.length
  const chosenActor = (): string => (newActor() ? actorName.input.value.trim() : actor.control.value)

  // What the author has described, whether or not it is legal yet - so `validate` and the return
  // value are one expression rather than two that could disagree.
  const described = (): AssetDeclaration => {
    const chosen = chosenKind()
    const fields = { id: id.input.value.trim(), file: fileName.input.value.trim() }
    return chosen === "sprite" ? { kind: chosen, actor: chosenActor(), ...fields } : { kind: chosen, ...fields }
  }

  // Which fields apply, and what the two hints currently say. Run on every change rather than wired
  // per field, so the dialog cannot get into a state where one of them is stale: picking Sprite
  // reveals Actor, picking New actor reveals Actor name, and both feed the path below them.
  const refresh = (): void => {
    const sprite = chosenKind() === "sprite"
    actor.row.hidden = !sprite
    actorName.row.hidden = !sprite || !newActor()
    id.setHint(scriptUse(chosenKind(), id.input.value.trim() === "" ? "…" : id.input.value.trim()))
    fileName.setHint(["Stored as ", identifier(declaredFilePath(described()))])
  }

  // The casing rule is not decoration: `YamlParser` decides a `Name: "text"` line is a Say by testing
  // the key's casing, so a lowercase actor is one no script can ever speak as.
  actorName.setHint([
    "Must be capitalized - the script speaks as ",
    identifier("Name:"),
    ". Only ",
    identifier("default"),
    " and ",
    identifier("narrator"),
    " are lowercase.",
  ])

  for (const field of [kind, actor, actorName, id, fileName]) {
    // Typing into a field that was just marked is the author answering; the complaint goes with the
    // thing it was about.
    field.control.addEventListener("input", () => {
      field.setProblem(null)
      refresh()
    })
    field.control.addEventListener("change", refresh)
  }
  refresh()

  const confirmed = await openDialog({
    title: "Add asset",
    body: [["Adding ", identifier(file.name), `, ${fileSize(file.size)}.`]],
    content: form,
    confirmLabel: "Add",
    destructive: false,
    // **Every field, and every one marked**, so an author fixing one is not sent back for the other.
    validate: () => {
      const declaration = described()
      const actorProblem =
        declaration.kind === "sprite" && newActor()
          ? declaration.actor === ""
            ? "Give the actor a name."
            : validateActorId(declaration.actor)
          : null
      actorName.setProblem(actorProblem)

      const idProblem =
        validateAssetId(declaration.kind, declaration.id) ??
        (choices.isDeclared(declaration) ? `${NOUNS[declaration.kind]} with this id is already declared.` : null)
      id.setProblem(idProblem)

      const path = declaredFilePath(declaration)
      const fileProblem =
        declaration.file === ""
          ? "Give the file a name."
          : choices.taken.has(path)
          ? `${path} is already in this project. Give this file another name.`
          : null
      fileName.setProblem(fileProblem)

      return actorProblem === null && idProblem === null && fileProblem === null
    },
  })

  return confirmed ? described() : null
}

// The filename without its extension, which is what an author would have called the thing anyway.
// A leading dot is kept: `.gitkeep` has no extension, it is all name.
const basename = (name: string): string => name.replace(/(?!^)\.[^.]*$/, "")

// The picked file's size, said to an author. Local rather than beside `megabytes` in
// `src/storage/persistence.ts`: that one answers "will a copy of this project fit", which is a
// storage estimate quoted in the SI megabytes the browser's own figure uses, and this is a sprite
// somebody just exported - where "412 KB" is a more useful thing to read than "0.4 MB".
const fileSize = (bytes: number): string =>
  bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
