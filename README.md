# WebVN

## A Visual Novel Engine for the modern web.

This pet project is envisioned to become a Visual Novel engine
(like [Ren'Py](https://www.renpy.org/))
and authoring tool to easily create and share web based Visual Novels.

Maybe I'll make a proper game with this some day...

Features:

- Editor with
  - **Live preview**
  - Jump to line
  - Live code validation
  - YAML-based scripting language
- Animated ADV text box with name tags
- Animated decision prompts
- Control flow with variables, arithmetic and boolean logic
- Sprites (translation, scaling)
- Backgrounds (panning, scaling)
- Background transitions
- Background music and sound effects
- Fast forwarding though seen text (skip mode)
- Unlimited "undo/rollback" history
- Saving/Loading (menus are WIP)
- Mobile friendly fullscreen mode

Technical feats:

- Redux-inspired immutable state management
- Rendering and UI code directly against browser DOM APIs, no frameworks or
  libraries involved. (Experiments with React & others still left in the repo)

### How to run

```
yarn
yarn dev
```

and off you go!
