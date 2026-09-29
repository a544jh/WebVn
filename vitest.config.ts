/// <reference types="@vitest/browser/providers/playwright" />
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { AddressInfo } from "node:net"
import { extname, join, normalize, sep } from "node:path"
import { defineConfig } from "vitest/config"
import type { BrowserCommand } from "vitest/node"

// When the only display is a Wayland compositor (e.g. a waypipe-forwarded session on a
// headless VM), Chromium needs the ozone backend named explicitly -- Chrome for Testing
// defaults to X11, which is not there, and a headful launch just fails.
const chromiumArgs = process.env.WAYLAND_DISPLAY ? ["--ozone-platform=wayland"] : []

// Shared by both browser-backed projects. The desktop-sized viewport keeps the whole 1280x720
// vn canvas visible; the default is a 414x896 phone viewport. Watch a run with, e.g.:
//   yarn test:demo:headful
//
// A factory, not a constant: vitest names each nested browser project after the instance it
// finds and writes that name back onto the instance object, so two projects sharing one object
// collide with "the project name ... was already defined" as soon as both are run at once.
const browserConfig = () => ({
  enabled: true,
  provider: "playwright" as const,
  headless: true,
  viewport: { width: 1920, height: 1080 },
  instances: [{ browser: "chromium", launch: { args: chromiumArgs } }],
})

// **A server that answers without CORS headers**, for the one browser suite that has to meet one: Import
// from URL tells "that site does not send CORS headers" apart from "that site could not be reached", and
// vite's own server sends the headers to any localhost origin. A browser command, so it runs here in
// Node and the suite asks for its address: `commands.serveWithoutCors()` in
// test/browser/UrlImport.test.ts.
//
// **Bound to 127.0.0.1 and addressed by it**, on a port of its own. Reaching vite's server under its
// other host name instead - `127.0.0.1` for a page on `localhost` - passed here and failed on CI, where
// `localhost` resolved to `::1` and nothing listened on 127.0.0.1 at all, so the host was unreachable
// rather than without headers. An explicit bind and an explicit address is a different origin from the
// page whatever `localhost` resolves to.
//
// It serves `test/fixtures/published/` and nothing else, is started once per run and unref'd so it
// never holds the process open.
const CONTENT_TYPES: Record<string, string> = {
  ".yaml": "text/yaml",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".html": "text/html",
}

let withoutCors: Promise<string> | null = null

const serveWithoutCors: BrowserCommand<[]> = ({ project }) => {
  withoutCors ??= new Promise((resolveAddress, reject) => {
    const root = join(project.config.root, "test/fixtures/published")
    const server = createServer((request, response) => {
      const file = join(root, normalize(decodeURIComponent(new URL(request.url ?? "/", "http://any").pathname)))
      if (!file.startsWith(root + sep)) {
        response.writeHead(404).end()
        return
      }
      readFile(file).then(
        (body) =>
          response
            .writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" })
            .end(body),
        () => response.writeHead(404).end()
      )
    })
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.unref()
      resolveAddress(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
    })
  })
  return withoutCors
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: { ...browserConfig(), commands: { serveWithoutCors } },
        },
      },
      {
        // Full playthroughs of the demo story. These wait on real transitions and take ~30s, so
        // they are not part of `yarn test` -- run `yarn test:demo` (or `yarn test:all`).
        test: {
          name: "demo",
          include: ["test/demo/**/*.test.ts"],
          browser: browserConfig(),
        },
      },
    ],
  },
})
