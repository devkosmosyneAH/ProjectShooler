import {
  buildPagesUrl,
  createEmptyProject,
  createProjectFiles,
  extractProjectFromText,
  validateProject,
} from "./projectData";

describe("project extraction and JSON model", () => {
  test("extracts labelled fields and sections without inventing missing content", () => {
    const project = extractProjectFromText(
      [
        "Título: Huerto escolar",
        "Institución: Escuela Central",
        "Autores: Ana Pérez, Luis Díaz",
        "Descripción: Cultivo sostenible.",
        "Resumen",
        "El proyecto estudia el cultivo en la escuela.",
        "Introducción",
        "El huerto permite aprender ciencias.",
        "Objetivo general: Diseñar un huerto educativo.",
        "Objetivos específicos:",
        "1. Identificar plantas apropiadas.",
        "Conclusiones",
        "La comunidad participó.",
        "Recomendaciones",
        "Regar cada semana.",
        "Bibliografía",
        "García, A. (2024). Agricultura.",
        "Resultados",
        "Producción registrada por temporada.",
      ].join("\n"),
      "huerto.pdf",
      4,
      [2],
    );

    expect(project.title).toBe("Huerto escolar");
    expect(project.institution).toBe("Escuela Central");
    expect(project.authors.map(({ name }) => name)).toEqual([
      "Ana Pérez",
      "Luis Díaz",
    ]);
    expect(project.objectives.general).toBe("Diseñar un huerto educativo.");
    expect(project.objectives.specific).toEqual([
      "Identificar plantas apropiadas.",
    ]);
    expect(
      project.sections.find(({ id }) => id === "introduction").content,
    ).toContain("El huerto");
    expect(
      project.sections.find(({ id }) => id === "results").content,
    ).toContain("Producción");
    expect(project.conclusions).toEqual(["La comunidad participó."]);
    expect(project.recommendations).toEqual(["Regar cada semana."]);
    expect(project.references).toEqual(["García, A. (2024). Agricultura."]);
    expect(project.extraction.ocrPages).toEqual([2]);
    expect(
      project.sections.find(({ id }) => id === "methodology").pendingReview,
    ).toBe(true);
  });

  test("preserves tabular rows as structured cells", () => {
    const project = extractProjectFromText(
      "Resultados\nPlanta\tCantidad\nMaíz\t12\nFrijol\t8",
    );
    expect(project.tables[0].rows).toEqual([
      ["Planta", "Cantidad"],
      ["Maíz", "12"],
      ["Frijol", "8"],
    ]);
  });

  test("creates valid separated JSON files without duplicating author records", () => {
    const project = createEmptyProject();
    project.projectId = "huerto-escolar";
    project.title = "Huerto escolar";
    project.authors = [
      { id: "autor-1", name: "Ana Pérez", role: "Estudiante" },
    ];
    project.sections[0].content = "Introducción del proyecto.";
    project.tables = [
      {
        id: "tabla-1",
        title: "Resultados",
        rows: [
          ["Cultivo", "Cantidad"],
          ["Maíz", "12"],
        ],
      },
    ];
    project.media = [
      {
        id: "image-1",
        title: "Muestra del huerto",
        description: "Descripción revisada",
        visualDescription: "Descripción agregada por el usuario",
        name: "huerto.jpg",
        alt: "Fotografía del huerto",
        path: "images/proyecto/huerto.jpg",
        section: "development",
        order: 1,
        featured: true,
        ocrText: "Texto reconocido",
        ocrConfidence: 92,
        ocrReviewRequired: false,
      },
    ];
    project.videos = [
      {
        id: "video-1",
        title: "Presentación del proyecto",
        description: "Video explicativo",
        platform: "youtube",
        url: "https://youtu.be/a1B2c3D4e5F",
        videoId: "a1B2c3D4e5F",
        embedUrl: "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
        section: "introduction",
        order: 1,
      },
    ];

    const files = createProjectFiles(project);
    const main = JSON.parse(files["proyecto.json"]);
    const members = JSON.parse(files["integrantes.json"]);
    const development = JSON.parse(files["desarrollo.json"]);
    const multimedia = JSON.parse(files["multimedia.json"]);
    Object.values(files).forEach((contents) =>
      expect(() => JSON.parse(contents)).not.toThrow(),
    );
    expect(main.authors).toEqual(["autor-1"]);
    expect(members.integrantes[0].name).toBe("Ana Pérez");
    expect(development.tables[0].rows[1]).toEqual(["Maíz", "12"]);
    expect(multimedia.images[0].ocrText).toBe("Texto reconocido");
    expect(multimedia.videos[0].embedUrl).toContain("youtube-nocookie.com");
    expect(main.content.multimedia).toBe("multimedia.json");
    expect(validateProject(project)).toEqual([]);
  });

  test("rejects invalid project shapes before export", () => {
    expect(validateProject(null)).toContain(
      "El contenido del proyecto debe ser un objeto JSON.",
    );
    const project = createEmptyProject();
    project.tables = "not a list";
    expect(validateProject(project).length).toBeGreaterThan(0);
    expect(() => createProjectFiles(project)).toThrow();
  });

  test("rejects arbitrary video domains and invalid GitHub Raw resource origins", () => {
    const project = createEmptyProject();
    project.videos = [
      {
        id: "video-1",
        title: "Video no válido",
        description: "",
        platform: "youtube",
        url: "https://youtube.com.evil.example/watch?v=a1B2c3D4e5F",
        videoId: "a1B2c3D4e5F",
        embedUrl: "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
        section: "",
        order: 1,
      },
    ];
    expect(validateProject(project)).toContain(
      "Cada video debe tener una URL de YouTube válida y metadatos coherentes.",
    );
    project.videos = [];
    project.resourceConfig = {
      mode: "github-raw",
      rawBaseUrl: "https://github.com/team/repo",
    };
    expect(validateProject(project)).toContain(
      "Configura una URL HTTPS válida de raw.githubusercontent.com para cargar los JSON externos.",
    );
  });

  test("accepts direct HTTPS image URLs in multimedia metadata", () => {
    const project = createEmptyProject();
    project.media = [
      {
        id: "image-local",
        title: "Imagen local",
        name: "local.jpg",
        alt: "Imagen local",
        path: "images/proyecto/local.jpg",
        source: "local",
        order: 1,
      },
      {
        id: "image-external",
        title: "Imagen de internet",
        name: "external.jpg",
        alt: "Imagen externa",
        path: "https://images.example.org/document/1?v=1",
        source: "local",
        order: 2,
      },
    ];

    expect(validateProject(project)).toEqual([]);
    project.media[1].path = "http://images.example.org/photo.jpg";
    expect(validateProject(project)).toContain(
      "Cada imagen debe tener metadatos y una ruta HTTPS segura, local o relativa a GitHub Raw configurado.",
    );
  });
});

describe("GitHub Pages URL builder", () => {
  test("builds a repository page and the user-site root correctly", () => {
    expect(buildPagesUrl("school-team", "science-project")).toBe(
      "https://school-team.github.io/science-project/",
    );
    expect(buildPagesUrl("school-team", "school-team.github.io")).toBe(
      "https://school-team.github.io/",
    );
  });

  test("rejects invalid owners and repository names", () => {
    expect(buildPagesUrl("invalid owner", "science-project")).toBe("");
    expect(buildPagesUrl("school-team", "../private")).toBe("");
  });
});
