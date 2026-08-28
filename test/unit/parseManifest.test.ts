import { describe, expect, it } from "vitest"
import demoManifestYaml from "../../test-assets/manifest.yaml?raw"
import { ErrorLevel } from "../../src/core/commands/Parser"
import { YamlParser } from "../../src/yamlParser/YamlParser"

// parseManifest is the one parser in the codebase that refuses to return a half-result: a manifest
// that fails validation has no identity, and identity is what saves are keyed on. See
// docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md.

const parse = (yaml: string) => YamlParser.parseManifest(yaml)

const withId = (id: string) => `id: ${id}\ntitle: Some Title\n`

const messages = (yaml: string) => parse(yaml)[1].map((e) => e.message)

describe("parseManifest", () => {
  it("parses a manifest declaring everything", () => {
    const [manifest, errors] = parse(`
id: my-story
title: My Story
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites: [idle.png, "2.png"]
backgrounds: [a.png, b.png]
audioAssets: [bgm/map01.ogg, sfx/bigthump.ogg]
`)
    expect(errors).toEqual([])
    expect(manifest).toEqual({
      id: "my-story",
      title: "My Story",
      actors: { A1: { name: "Actor", nameTagColor: "purple", sprites: ["idle.png", "2.png"] } },
      backgrounds: ["a.png", "b.png"],
      audioAssets: ["bgm/map01.ogg", "sfx/bigthump.ogg"],
    })
  })

  it("defaults the three declaration lists, so a project with no assets declares none", () => {
    const [manifest, errors] = parse(withId("bare"))

    expect(errors).toEqual([])
    expect(manifest).toEqual({ id: "bare", title: "Some Title", actors: {}, backgrounds: [], audioAssets: [] })
  })

  it("reads a declaration key with nothing after it as declaring nothing", () => {
    const [manifest, errors] = parse(withId("empty") + "actors:\nbackgrounds:\naudioAssets:\n")

    expect(errors).toEqual([])
    expect(manifest).toEqual({ id: "empty", title: "Some Title", actors: {}, backgrounds: [], audioAssets: [] })
  })

  it("ignores keys it does not know, so a manifest from a later format still loads", () => {
    const [manifest, errors] = parse(withId("forward") + "formatVersion: 1\n")

    expect(errors).toEqual([])
    expect(manifest).not.toBeNull()
    expect(manifest).not.toHaveProperty("formatVersion")
  })

  describe("id", () => {
    it("is required", () => {
      const [manifest, errors] = parse("title: No Id\n")

      expect(manifest).toBeNull()
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("id")
      expect(errors[0].level).toBe(ErrorLevel.ERROR)
    })

    it.each(["my-story", "a", "story_2", "a".repeat(64)])("accepts %s", (id) => {
      expect(parse(withId(id))[0]?.id).toBe(id)
    })

    // The charset allows an all-digit id, but YAML resolves an unquoted one to a number before the
    // schema ever sees it. The error says so; the fix is quoting.
    it("accepts an all-digit id when it is quoted", () => {
      expect(parse(withId('"2024"'))[0]?.id).toBe("2024")
    })

    it("rejects an unquoted all-digit id, which YAML has already made a number", () => {
      const [manifest, errors] = parse(withId("2024"))

      expect(manifest).toBeNull()
      expect(errors[0].message).toContain("string")
    })

    // Lowercase-only is what stops two ids colliding once an export is extracted on a
    // case-insensitive filesystem; the charset also leaves no way to spell a name made of dots
    // and spaces, which is the other half of what a directory name has to survive.
    it.each([
      ["My-Story", "an uppercase letter"],
      ["-leading-dash", "a leading dash"],
      ["_leading_underscore", "a leading underscore"],
      ["has spaces", "a space"],
      ["has.dots", "a dot"],
      ["..", "dot-dot"],
      ["has/slash", "a slash"],
      ["", "the empty string"],
      ["a".repeat(65), "65 characters"],
    ])("rejects %s (%s)", (id) => {
      const [manifest, errors] = parse(withId(`"${id}"`))

      expect(manifest).toBeNull()
      expect(errors).toHaveLength(1)
    })

    it.each(["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"])(
      "rejects the Windows reserved name %s",
      (id) => {
        const [manifest, errors] = parse(withId(id))

        expect(manifest).toBeNull()
        expect(errors[0].message).toContain("reserved")
      }
    )

    it("does not reject a name that merely starts with a reserved one", () => {
      expect(parse(withId("console"))[0]?.id).toBe("console")
    })
  })

  describe("title", () => {
    it("is required", () => {
      const [manifest, errors] = parse("id: untitled\n")

      expect(manifest).toBeNull()
      expect(errors[0].message).toContain("title")
    })

    it("is rejected when empty, which is the same as absent to a reader", () => {
      expect(parse('id: untitled\ntitle: ""\n')[0]).toBeNull()
    })
  })

  describe("actor ids", () => {
    // YamlParser decides a `Name: "text"` line is a Say by testing the key's casing, so an actor
    // declared lowercase is one no script can ever speak as. The schema is the first place that
    // rule can be stated as data rather than inferred from the casing test.
    it("accepts a capitalized id", () => {
      expect(parse(withId("cast") + "actors:\n  A1: {}\n")[1]).toEqual([])
    })

    it.each(["default", "narrator"])("accepts the engine's own lowercase id %s", (key) => {
      expect(parse(withId("cast") + `actors:\n  ${key}:\n    textColor: red\n`)[1]).toEqual([])
    })

    it("rejects any other lowercase id", () => {
      const [manifest, errors] = parse(withId("cast") + "actors:\n  a1:\n    name: Actor\n")

      expect(manifest).toBeNull()
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("capitalized")
    })
  })

  describe("failure reporting", () => {
    it("returns errors rather than throwing when an actor id is empty", () => {
      const [manifest, errors] = parse(withId("cast") + 'actors:\n  "":\n    name: Nobody\n')

      expect(manifest).toBeNull()
      expect(errors).toHaveLength(1)
    })

    // A manifest is one document. The `---` stream is the shape the URL payload will take once a
    // project travels as manifest-plus-script, so taking the first document quietly would later
    // mean a story loading under half a project.
    it("refuses a stream of more than one document rather than taking the first", () => {
      const [manifest, errors] = parse(withId("first") + "---\n" + withId("second"))

      expect(manifest).toBeNull()
      expect(errors.map((e) => e.message)).toEqual(["A manifest is a single YAML document."])
    })

    it("returns no manifest and an error when the YAML itself does not parse", () => {
      const [manifest, errors] = parse("id: broken\ntitle: [unclosed\n")

      expect(manifest).toBeNull()
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].level).toBe(ErrorLevel.ERROR)
    })

    it("returns no manifest when the document is not a mapping", () => {
      const [manifest, errors] = parse("- not\n- a\n- manifest\n")

      expect(manifest).toBeNull()
      expect(errors.length).toBeGreaterThan(0)
    })

    it("points an error at the line the offending value is on", () => {
      const [, errors] = parse("\n\nid: fine\ntitle: 1\n")

      expect(errors).toHaveLength(1)
      expect(errors[0].location.startLine).toBe(4)
    })

    // The actor-id rule is the one rule here about a key rather than a value, and a key sits on the
    // line above its mapping.
    it("points an actor-id error at the actor's own line, not at the field below it", () => {
      const [, errors] = parse(withId("cast") + "actors:\n  b2:\n    name: Bee\n")

      expect(errors).toHaveLength(1)
      expect(errors[0].location.startLine).toBe(4)
    })

    it("reports every problem in one pass rather than stopping at the first", () => {
      expect(messages("id: Bad Id\ntitle: 3\n")).toHaveLength(2)
    })
  })

  describe("the demo manifest", () => {
    // The guarantee that the file we ship is valid. demoStory.ts throws on null, but that throw is
    // type narrowing - this test is what actually holds the demo's manifest to the schema.
    it("parses with no errors", () => {
      const [manifest, errors] = parse(demoManifestYaml)

      expect(errors).toEqual([])
      expect(manifest).not.toBeNull()
    })

    it("declares the demo's identity, cast and assets", () => {
      const [manifest] = parse(demoManifestYaml)

      expect(manifest?.id).toBe("webvn-demo")
      expect(manifest?.title).toBe("WebVn Demo")
      expect(Object.keys(manifest?.actors ?? {}).sort()).toEqual(["A1", "A2", "narrator"])
      expect(manifest?.backgrounds).toEqual(["a.png", "b.png"])
      expect(manifest?.audioAssets).toEqual(["bgm/map01.ogg", "bgm/dayl_preview.ogg", "sfx/bigthump.ogg"])
    })
  })
})
