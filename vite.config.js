import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
const githubPagesBase =
  repository && repository !== `${owner}.github.io` ? `/${repository}/` : "/";
const homepageBase = (() => {
  try {
    const path = new URL(packageJson.homepage).pathname.replace(/\/+$/, "");
    return `${path || ""}/`;
  } catch {
    return "/";
  }
})();

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base:
    process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_ACTIONS ? githubPagesBase : command === "build" ? homepageBase : "/"),
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    restoreMocks: true,
  },
}));
