import { dialogField, dialogSelect, DialogText, identifier, openDialog } from "../chrome/dialog"
import { Loadable } from "../assetLoaders/probe"
import { AssetDeclaration, AssetKind } from "../core/manifest"
import { AssetLocation, declaredFilePath } from "../domRenderer/assetPaths"
import { validateActorId, validateAssetId } from "../yamlParser/parseManifest"
import { declarationOf } from "./undeclaredFiles"

// What `Add asset` asks about the file the author picked: what kind it is, whose sprite it is, what
// the script will name it, and what to store it under.
//
// **The file is picked first**, through a plain `<input type="file">` the panel owns, and the panel
// has already decoded it - so this dialog knows what it is talking about, offers only the kinds the
// file can be, and prefills the id from its basename. Drawn on the design canvas as `AddAsset`, `AddAssetSprite` and
// `AddAssetRefused`; read those before changing the layout.
//
// Every rule it enforces comes from `parseManifest.ts` rather than being restated here, and its
// message lands beside the field it belongs to - which is the whole reason this surface is not
// `window.prompt`.

// The last option of the Actor select, for a sprite whose actor nobody has cast yet. Identified by
// position rather than by its text, because an actor id has to be capitalized and "New actor..."
// is - so an author could in principle name one that.
const NEW_ACTOR = "New actor..."

// What each kind is called in the Kind select, and which `AssetKind` each stands for, by what the
// file decoded as. **Filtered rather than refused**: an image is never offered as audio, so there is
// no wrong answer to pick and no refusal to explain afterwards. Background leads for an image because
// it is the common case, and Sprite is a deliberate choice that reveals the Actor field.
const KINDS: Record<Loadable, ReadonlyArray<[label: string, kind: AssetKind]>> = {
  image: [
    ["Background", "background"],
    ["Sprite", "sprite"],
  ],
  audio: [["Audio", "audio"]],
}

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
  // The ones of those no declaration points at, by the name of what their row sits under in the
  // panel. A name taken by one of these is refused all the same, but the refusal says where the file
  // is - before the panel listed them, it named a file the author had no way to see.
  readonly undeclared: ReadonlyMap<string, string>
}

// Resolves with what the author settled on, or null if they backed out. `loads` is what the panel's
// probe found the file to be; a file that is neither never reaches this dialog.
export const askForAsset = async (
  file: File,
  loads: Loadable,
  choices: AssetChoices
): Promise<AssetDeclaration | null> => {
  const kinds = KINDS[loads]
  const kind = dialogSelect(
    "Kind",
    kinds.map(([label]) => label)
  )
  // **Shown even when there is only one**, and disabled: the layout does not change with the file,
  // and the author still reads what it is being added as.
  kind.control.disabled = kinds.length === 1

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

  const chosenKind = (): AssetKind => kinds[kind.control.selectedIndex][1]
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
      const holder = choices.undeclared.get(path)
      // **Still a refusal when what holds the name is undeclared**, and no new button: "declare the
      // existing one instead" would drop the bytes just picked without saying so, and "overwrite and
      // declare" is a replace hidden inside an add. The row's Declare is the way out.
      const fileProblem: DialogText | null =
        declaration.file === ""
          ? "Give the file a name."
          : holder !== undefined
          ? [
              identifier(path),
              ` is in this project but not declared. Declare it from its row under ${holder}, or give this file another name.`,
            ]
          : choices.taken.has(path)
          ? `${path} is already in this project. Give this file another name.`
          : null
      fileName.setProblem(fileProblem)

      return actorProblem === null && idProblem === null && fileProblem === null
    },
  })

  return confirmed ? described() : null
}

// What `Declare` asks about a file already in the project: only its id. Where the file is fixes the
// kind, the actor and the filename - changing any of them would mean moving the file - so they are
// said in a sentence rather than offered as controls that could only be wrong. Nothing is copied.
// Drawn on the design canvas as `DeclareAsset`, `DeclareSprite` and `DeclareMissing`.
export interface DeclareChoices {
  // Whether the manifest declares the actor a sprite's folder names. When it does not, declaring the
  // sprite declares the actor too - a second line in the manifest the author did not ask for by name
  // - so the dialog says so in a sentence of its own.
  readonly actorDeclared: boolean
  // What already declares that id in that group, or null when nothing does.
  readonly held: (declaration: AssetDeclaration) => HeldDeclaration | null
}

// The declaration already holding an id: the file it names, and whether the last asset load found that
// file. Which of the two refusals Declare gives turns on the second.
export interface HeldDeclaration {
  readonly file: string
  readonly missing: boolean
}

// Resolves with the declaration to write, or null if the author backed out.
export const askToDeclare = async (
  declares: AssetLocation,
  choices: DeclareChoices
): Promise<AssetDeclaration | null> => {
  const id = dialogField("Id")
  id.input.classList.add("vn-dialog-input-mono")
  // The basename, as Add asset prefills from the picked file's - of the last segment, so a nested
  // `old/cliffs.png` offers `cliffs` rather than `old/cliffs`.
  id.input.value = basename(declares.file.slice(declares.file.lastIndexOf("/") + 1))

  const form = document.createElement("div")
  form.classList.add("vn-dialog-form")
  form.append(id.row)

  const asked = (): AssetDeclaration => declarationOf(declares, id.input.value.trim())
  const refresh = (): void =>
    id.setHint(scriptUse(declares.kind, id.input.value.trim() === "" ? "…" : id.input.value.trim()))
  id.input.addEventListener("input", () => {
    id.setProblem(null)
    refresh()
  })
  refresh()

  const already = "It is already in this project, so nothing is copied."
  const body: DialogText[] = [
    declares.kind === "sprite"
      ? ["Declaring ", identifier(declares.file), " as a sprite for ", identifier(declares.actor), `. ${already}`]
      : ["Declaring ", identifier(declares.file), ` as ${ARTICLED[declares.kind]}. ${already}`],
  ]
  if (declares.kind === "sprite" && !choices.actorDeclared) {
    body.push([identifier(declares.actor), " is not declared yet, so this declares the actor too."])
  }

  const confirmed = await openDialog({
    title: "Declare asset",
    body,
    content: form,
    confirmLabel: "Declare",
    destructive: false,
    validate: () => {
      const declaration = asked()
      const problem =
        validateAssetId(declaration.kind, declaration.id) ?? heldProblem(declaration, choices.held(declaration))
      id.setProblem(problem)
      return problem === null
    },
  })

  return confirmed ? asked() : null
}

// Why an id that is already declared cannot be this file's too.
//
// **When that declaration is missing its file, the refusal names the edit that fixes it.** That is
// the commonest way an undeclared file appears - `file: storm.png` edited by hand to
// `storm-night.png` - and the basename prefill lands on exactly that id, so a bare "already declared"
// would stop the author at the one refusal with no way forward from the panel. Doing the edit from
// here is a `file:` splice `manifestEdit.ts` does not have; until it does, the dialog says what to
// type. **Filenames rather than a line number**, because the filename is in the manifest whatever
// form the declaration takes - an audio entry's `file:` sits on a line of its own.
const heldProblem = (declaration: AssetDeclaration, held: HeldDeclaration | null): DialogText | null =>
  held === null
    ? null
    : held.missing
    ? [
        identifier(declaration.id),
        " is already declared, and its file ",
        identifier(held.file),
        " is missing. To use this file for it, change ",
        identifier(held.file),
        " to ",
        identifier(declaration.file),
        " in ",
        identifier("manifest.yaml"),
        ".",
      ]
    : `${NOUNS[declaration.kind]} with this id is already declared.`

// What each kind is called in the middle of a sentence. Sprites are never asked: a sprite's sentence
// names its actor instead.
const ARTICLED: Record<Exclude<AssetKind, "sprite">, string> = {
  background: "a background",
  audio: "an audio asset",
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
