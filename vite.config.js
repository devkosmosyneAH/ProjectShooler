import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const documentsDirectory = fileURLToPath(
  new URL("./documents/", import.meta.url),
);
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

function getPublicProjects() {
  if (!existsSync(documentsDirectory)) return [];
  return readdirSync(documentsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".json") &&
        entry.name !== "index.json",
    )
    .flatMap((entry) => {
      const filePath = join(documentsDirectory, entry.name);
      const project = JSON.parse(readFileSync(filePath, "utf8"));
      return typeof project.projectId === "string"
        ? [{ file: entry.name, title: project.title || "Proyecto escolar" }]
        : [];
    });
}

function publicDocumentsPlugin() {
  const manifestPath = "/documents/index.json";
  return {
    name: "public-documents",
    configureServer(server) {
      server.middlewares.use(manifestPath, (_request, response, next) => {
        try {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ projects: getPublicProjects() }));
        } catch (error) {
          next(error);
        }
      });
    },
    closeBundle() {
      if (!existsSync(documentsDirectory)) return;
      const outputDirectory = resolve("dist/documents");
      mkdirSync(outputDirectory, { recursive: true });
      cpSync(documentsDirectory, outputDirectory, {
        recursive: true,
        filter(source) {
          const relativePath = relative(documentsDirectory, source);
          if (!relativePath) return true;
          if (relativePath.split(/[\\/]/).some((part) => part.startsWith(".")))
            return false;
          if (statSync(source).isDirectory()) return true;
          return /\.(?:json|png|jpe?g|gif|webp|svg)$/i.test(source);
        },
      });
      writeFileSync(
        join(outputDirectory, "index.json"),
        `${JSON.stringify({ projects: getPublicProjects() }, null, 2)}\n`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), publicDocumentsPlugin()],
  base:
    process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_ACTIONS
      ? githubPagesBase
      : command === "build"
        ? homepageBase
        : "/"),
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    restoreMocks: true,
  },
}));
