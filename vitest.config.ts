/// <reference types="@vitest/browser/providers/playwright" />
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { chromium } from "playwright"
import { defineConfig } from "vitest/config"

// When the only display is a Wayland compositor (e.g. a waypipe-forwarded session on a
// headless VM), Chromium needs the ozone backend named explicitly -- Chrome for Testing
// defaults to X11, which is not there, and a headful launch just fails.
const chromiumArgs = process.env.WAYLAND_DISPLAY ? ["--ozone-platform=wayland"] : []

// Playwright launches the one Chromium revision its version pins, and downloads it on
// demand. Prebuilt CI images and agent sandboxes tend to ship some other revision under
// PLAYWRIGHT_BROWSERS_PATH and block the download CDN, so the pinned revision can never
// arrive: `browserType.launch: Executable doesn't exist`, before a single test is
// collected. Fall back to whatever Chromium is already on disk there -- Playwright drives
// a browser a few majors older than the one it pins without trouble, which is all these
// tests need. Point CHROMIUM_EXECUTABLE_PATH at a binary to choose one by hand.
const findPreinstalledChromium = (): string | undefined => {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!browsersPath || !existsSync(browsersPath)) return undefined
  const revisions = readdirSync(browsersPath)
    .filter((entry) => /^chromium-\d+$/.test(entry))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
  // Some images leave a bare `chromium` symlink next to the revision directories.
  const candidates = [join(browsersPath, "chromium")]
  for (const revision of revisions) {
    // The unpacked archive is named chrome-linux in older revisions, chrome-linux64 in newer.
    candidates.push(join(browsersPath, revision, "chrome-linux", "chrome"))
    candidates.push(join(browsersPath, revision, "chrome-linux64", "chrome"))
  }
  return candidates.find(existsSync)
}

const chromiumExecutablePath = (): string | undefined => {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH
  // undefined leaves Playwright to resolve its own build, which is what we want when it is there.
  try {
    if (existsSync(chromium.executablePath())) return undefined
  } catch {
    // Playwright could not resolve a path at all; the fallback below is the only option.
  }
  const fallback = findPreinstalledChromium()
  if (fallback) console.warn(`Chromium build pinned by Playwright is missing, falling back to ${fallback}`)
  return fallback
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            // Desktop-sized viewport so the whole 1280x720 vn canvas is visible
            // (default is a 414x896 phone viewport). Watch the tests with:
            //   npx vitest --project browser --browser.headless=false
            viewport: { width: 1920, height: 1080 },
            instances: [
              { browser: "chromium", launch: { args: chromiumArgs, executablePath: chromiumExecutablePath() } },
            ],
          },
        },
      },
    ],
  },
})
