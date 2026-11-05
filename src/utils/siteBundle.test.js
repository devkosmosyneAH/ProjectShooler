import JSZip from "jszip";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createEmptyProject, createProjectFiles } from "./projectData";
import { createJsonZip, createSiteZip } from "./siteBundle";

function sampleProject() {
  const project = createEmptyProject();
  project.projectId = "proyecto-prueba";
  project.title = "<img src=x onerror=alert(1)> Proyecto";
  project.description = "Descripción pública";
  project.institution = "Escuela";
  project.authors = [{ id: "a1", name: "Ana" }];
  project.sections[0].content = "Introducción visible";
  project.objectives.general = "Objetivo de prueba";
  project.conclusions = ["Conclusión de prueba"];
  project.recommendations = ["Recomendación de prueba"];
  project.references = ["Referencia de prueba"];
  return project;
}

describe("static site and JSON exports", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  test("creates a publishable site archive with JSON data and workflow", async () => {
    const zipBlob = await createSiteZip(sampleProject());
    const zip = await JSZip.loadAsync(zipBlob);
    const projectJson = JSON.parse(
      await zip.file("public/data/proyecto.json").async("string"),
    );

    expect(zip.file("public/index.html")).not.toBeNull();
    expect(zip.file("public/app.js")).not.toBeNull();
    expect(zip.file("public/styles.css")).not.toBeNull();
    expect(zip.files["public/images/proyecto/"]?.dir).toBe(true);
    expect(zip.file(".github/workflows/pages.yml")).not.toBeNull();
    expect(projectJson.content.desarrollo).toBe("desarrollo.json");
    expect(await zip.file("README.md").async("string")).toContain(
      "GitHub Pages",
    );
  });

  test("public page fetches its JSON resources and renders text as text, not markup", async () => {
    const project = sampleProject();
    const files = createProjectFiles(project);
    const zip = await JSZip.loadAsync(await createSiteZip(project));
    const runtime = await zip.file("public/app.js").async("string");
    const resources = {
      "./data/proyecto.json": files["proyecto.json"],
      ...Object.fromEntries(
        Object.entries(files)
          .filter(([name]) => name !== "proyecto.json")
          .map(([name, value]) => [`./data/${name}`, value]),
      ),
    };
    globalThis.fetch = vi.fn(async (url) => ({
      ok: Boolean(resources[url]),
      json: async () => JSON.parse(resources[url]),
    }));
    document.body.innerHTML = '<div id="project"></div>';
    const execute = new Function(
      runtime.replace(/\nloadProject\(\);\s*$/, "\nreturn loadProject();"),
    );

    await execute();

    const root = document.querySelector("#project");
    expect(root.querySelector("h1").textContent).toBe(project.title);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("Introducción visible");
    expect(root.textContent).toContain("Conclusión de prueba");
    expect(root.textContent).toContain("Recomendación de prueba");
    expect(root.querySelector(".developer-credit").textContent).toContain(
      "Anthony",
    );
    const developerLinks = [...root.querySelectorAll(".developer-links a")];
    expect(developerLinks.map((link) => link.href)).toEqual([
      "https://devkosmosyneah.github.io/devkosmosyne-website/",
      "https://github.com/18-anth",
      "https://18-anth.github.io/CV_Anth/",
      "https://www.linkedin.com/in/anthony-c-a12928111/",
    ]);
    expect(
      developerLinks.every(
        (link) =>
          link.target === "_blank" && link.rel === "noopener noreferrer",
      ),
    ).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith("./data/proyecto.json");
  });

  test("creates a data-only ZIP with the project JSON documents including multimedia metadata", async () => {
    const zip = await JSZip.loadAsync(await createJsonZip(sampleProject()));
    expect(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir)
        .sort(),
    ).toEqual([
      "public/data/conclusiones.json",
      "public/data/desarrollo.json",
      "public/data/integrantes.json",
      "public/data/multimedia.json",
      "public/data/objetivos.json",
      "public/data/proyecto.json",
      "public/data/referencias.json",
    ]);
  });

  test("records whether empty public sections should be hidden", async () => {
    const zip = await JSZip.loadAsync(
      await createSiteZip(sampleProject(), {}, null, {
        hideEmptySections: false,
      }),
    );
    const main = JSON.parse(
      await zip.file("public/data/proyecto.json").async("string"),
    );
    expect(main.hideEmptySections).toBe(false);
    expect(await zip.file("public/app.js").async("string")).toContain(
      "!project.hideEmptySections",
    );
  });

  test("references the original document only when it is included in the archive", async () => {
    const project = sampleProject();
    project.extraction.sourceFileName = "school.pdf";
    const original = new File(["PDF bytes"], "school.pdf", {
      type: "application/pdf",
    });
    const zip = await JSZip.loadAsync(
      await createSiteZip(project, {}, original),
    );
    const main = JSON.parse(
      await zip.file("public/data/proyecto.json").async("string"),
    );
    expect(main.originalDocument.path).toBe("documents/school.pdf");
    expect(zip.file("public/documents/school.pdf")).not.toBeNull();
  });

  test("includes original image bytes and OCR metadata in the ZIP and rejects missing local files", async () => {
    const project = sampleProject();
    const path = "images/proyecto/image-001.jpg";
    const image = new File(["original-image-bytes"], "image-001.jpg", {
      type: "image/jpeg",
    });
    project.media = [
      {
        id: "image-001",
        title: "Imagen del proyecto",
        description: "Descripción revisada",
        visualDescription: "Descripción manual",
        name: image.name,
        alt: "Imagen de un experimento",
        path,
        source: "local",
        section: "development",
        order: 1,
        featured: true,
        ocrText: "Texto reconocido por OCR",
        ocrConfidence: 88,
        ocrReviewRequired: false,
      },
    ];
    const archive = await JSZip.loadAsync(
      await createSiteZip(project, { [path]: image }),
    );
    const projectJson = JSON.parse(
      await archive.file("public/data/proyecto.json").async("string"),
    );
    const multimedia = JSON.parse(
      await archive.file("public/data/multimedia.json").async("string"),
    );

    expect(await archive.file(`public/${path}`).async("string")).toBe(
      "original-image-bytes",
    );
    expect(projectJson.media[0].ocrText).toBe("Texto reconocido por OCR");
    expect(multimedia.images[0].description).toBe("Descripción revisada");
    await expect(createSiteZip(project, {})).rejects.toThrow(
      /No se exportaron referencias rotas/,
    );
  });

  test("renders gallery images from multimedia JSON using relative paths", async () => {
    const project = sampleProject();
    const path = "images/proyecto/image-gallery.webp";
    const image = new File(["image"], "image-gallery.webp", {
      type: "image/webp",
    });
    project.media = [
      {
        id: "image-gallery",
        title: "Imagen desde JSON",
        description: "Descripción",
        name: image.name,
        alt: "Texto alternativo",
        path,
        source: "local",
        section: "introduction",
        order: 1,
        featured: false,
        ocrText: "Texto leído",
      },
    ];
    const archive = await JSZip.loadAsync(
      await createSiteZip(project, { [path]: image }),
    );
    const resources = createProjectFiles(project);
    globalThis.fetch = vi.fn(async (url) => ({
      ok: Boolean(resources[url.replace("./data/", "")]),
      json: async () => JSON.parse(resources[url.replace("./data/", "")]),
    }));
    document.body.innerHTML = '<div id="project"></div>';
    const runtime = await archive.file("public/app.js").async("string");
    const execute = new Function(
      runtime.replace(/\nloadProject\(\);\s*$/, "\nreturn loadProject();"),
    );

    await execute();

    const galleryImage = document.querySelector(".gallery img");
    expect(galleryImage).toHaveAttribute("src", `./${path}`);
    expect(galleryImage).toHaveAttribute("alt", "Texto alternativo");
    expect(galleryImage).toHaveAttribute("loading", "lazy");
    expect(document.querySelector(".gallery strong")).toHaveTextContent(
      "Imagen desde JSON",
    );
    expect(JSON.parse(resources["multimedia.json"]).images[0].ocrText).toBe(
      "Texto leído",
    );
  });

  test("loads JSON from an explicitly configured GitHub Raw base without rewriting Pages URLs", async () => {
    const project = sampleProject();
    project.resourceConfig = {
      mode: "github-raw",
      rawBaseUrl:
        "https://raw.githubusercontent.com/team/school-project/main/public/",
    };
    project.videos = [
      {
        id: "video-a1B2c3",
        title: "Video del proyecto",
        description: "Descripción del video",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=a1B2c3D4e5F&feature=share",
        videoId: "a1B2c3D4e5F",
        embedUrl: "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
        section: "introduction",
        order: 1,
      },
    ];
    project.media = [
      {
        id: "image-raw",
        title: "Imagen remota",
        description: "Recurso desde Raw",
        name: "image-raw.webp",
        alt: "Imagen de GitHub Raw",
        path: "images/image-raw.webp",
        source: "github-raw",
        section: "introduction",
        order: 1,
        featured: false,
        ocrText: "",
      },
    ];
    const archive = await JSZip.loadAsync(await createSiteZip(project));
    const runtime = await archive.file("public/app.js").async("string");
    const files = createProjectFiles(project);
    const base = project.resourceConfig.rawBaseUrl;
    const resources = Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        `${base}data/${name}`,
        value,
      ]),
    );
    globalThis.fetch = vi.fn(async (url) => ({
      ok: Boolean(resources[url]),
      json: async () => JSON.parse(resources[url]),
    }));
    document.body.innerHTML = '<div id="project"></div>';
    const execute = new Function(
      runtime.replace(/\nloadProject\(\);\s*$/, "\nreturn loadProject();"),
    );

    await execute();

    expect(globalThis.fetch).toHaveBeenCalledWith(`${base}data/proyecto.json`);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${base}data/multimedia.json`,
    );
    expect(document.querySelector(".video-frame iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
    );
    expect(document.querySelector(".video-frame iframe")).toHaveAttribute(
      "loading",
      "lazy",
    );
    expect(document.querySelector(".gallery img")).toHaveAttribute(
      "src",
      `${base}images/image-raw.webp`,
    );
    expect(archive.file("public/images/image-raw.webp")).toBeNull();
    expect(runtime).not.toContain("https://team.github.io/");
  });
});
