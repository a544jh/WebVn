# manifest.yaml as a real document

Status: needs-triage

Step 2 of `../spec.md`. Blocked on `01-manifest-type-and-seed.md`, which gives this a type to parse
into. Not yet refined - the open questions below are why.

## What it is

`manifest.yaml`, separate from `script.yaml`, YAML rather than JSON so it uses the parser and
dependency already in the tree and stays readable in an export. Per `design-docs/PROJECT_STORAGE.md`:

```yaml
id: 4f8c...          # uuid, stable forever, never derived from the title
title: My Story
formatVersion: 1
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites: [idle.png, "2.png"]
backgrounds: [a.png, b.png]
audioAssets: [bgm/map01.ogg, sfx/bigthump.ogg]
```

Validated with Zod, matching how commands are already parsed via `makeZodCmdHandler`.

## The URL payload consequence

`?vn=<gzipped script>` stops describing a complete story once the asset and actor declarations live
in the manifest. The design doc's intended fix is a two-document YAML stream - manifest, `---`,
script - which the `yaml` dependency already parses. A shared link with custom assets also needs a
base URL for them (`&assets=<url>`), which is worth having anyway since it makes reusable asset packs
possible.

## Open questions

- Does `formatVersion` do anything yet, or is it written and ignored until there is a v2?
- Where does `id` come from before a project store exists (TODO: OPFS store)? It unblocks player
  save keying, which currently hardcodes `"test"` - but that is its own line in `TODO`.
- Does the editor gain a way to edit the manifest, or is it hand-edited YAML for now?
- Does the demo ship a real `manifest.yaml`, or keep `demoManifest` as a TypeScript constant with
  the YAML path exercised only by tests?

## See also

- `design-docs/PROJECT_STORAGE.md` - the manifest section and "Leaving the browser"
- `TODO` - "D -> URL payload becomes a two-document YAML stream", "project id embedded in the
  exported story"
