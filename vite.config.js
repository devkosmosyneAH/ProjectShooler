import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
const githubPagesBase =
  repository && repository !== `${owner}.github.io` ? `/${repository}/` : "/";

export default defineConfig({
  plugins: [react()],
  base:
    process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_ACTIONS ? githubPagesBase : "/"),
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    restoreMocks: true,
  },
});
