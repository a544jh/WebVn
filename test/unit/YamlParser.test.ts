import { describe, expect, it } from "vitest"
import { initialState } from "../../src/core/player"
import { ErrorLevel } from "../../src/core/commands/Parser"
import { ADVTextBox } from "../../src/core/state"
import { YamlParser } from "../../src/yamlParser/YamlParser"

// storyToCommands dereferences aliases by hand, so these cover the seam between the yaml
// lib's Alias.resolve and the isX guards the node evaluators rely on. A clone that loses
// the lib's internal node-type symbol still looks like a plain object to those guards,
// which would silently downgrade every aliased command to "Unrecognized item".

const parse = (yaml: string) => YamlParser.updateState(yaml, initialState)

describe("YamlParser anchors and aliases", () => {
  it("expands an alias into the command its anchor holds", () => {
    const [state, errors] = parse(`
anchor: &greeting
  A1: "Hello from the anchor"

story:
  - *greeting
`)
    expect(errors).toEqual([])
    expect(state.commands).toHaveLength(1)

    const textBox = state.commands[0].apply(initialState).animatableState.text as ADVTextBox
    expect(textBox.textNodes[0].text).toBe("Hello from the anchor")
    expect(textBox.nameTag?.name).toBe("A1")
  })

  it("reports errors where the alias is used, not where the anchor is defined", () => {
    const [, errors] = parse(`
anchor: &bad
  ugh: not a command

story:
  - *bad
`)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("ugh is not a recognized command")
    expect(errors[0].location.startLine).toBe(6)
  })

  it("reports an alias with no matching anchor", () => {
    const [state, errors] = parse(`
story:
  - *missing
`)
    expect(state.commands).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].level).toBe(ErrorLevel.ERROR)
    expect(errors[0].message).toContain("missing")
  })
})
