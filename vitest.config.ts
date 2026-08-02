import { defineConfig } from "vitest/config"

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
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
