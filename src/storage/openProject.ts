import { demoManifest } from "../demoStory"
import { seedDemoProject } from "./seedDemoProject"
import { listProjects, readEditorState, writeEditorState } from "./projectStore"

// Which project this tab will open. Decided **without writing anything**, because the lock has to
// be taken before the first write and this is what it is keyed on - a refused tab must not have
// created a directory or bumped `lastOpened` on its way to being refused.
//
// `lastOpened`, else the first of `listProjects()`. That does no work while there is exactly one
// project, which there is until the picker lands - it goes in anyway because it is the boot logic
// the picker needs regardless, and having it exercised from the first commit beats bolting it on
// underneath a picker later. A `lastOpened` naming a directory that is no longer there falls back
// the same way, since enumeration is the truth about what exists and editor.yaml is only a hint.
export interface ProjectChoice {
  readonly directory: string
  // An empty library has nothing to open, so the demo is written in. See seedDemoProject.
  readonly seed: boolean
}

export const chooseProject = async (): Promise<ProjectChoice> => {
  const { lastOpened } = await readEditorState()
  const projects = await listProjects()

  const directory = projects.find((project) => project.directory === lastOpened)?.directory ?? projects[0]?.directory
  return directory === undefined ? { directory: demoManifest.id, seed: true } : { directory, seed: false }
}

// The writing half, and everything here happens **after** the lock is held.
export const claimProject = async (choice: ProjectChoice): Promise<void> => {
  if (choice.seed) await seedDemoProject()
  await writeEditorState({ lastOpened: choice.directory })
}
