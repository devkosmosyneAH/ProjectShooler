import { isValidGitHubRawBaseUrl, parseYouTubeUrl } from "./multimedia";

export const MAX_PDF_SIZE = 50 * 1024 * 1024;
export const SECTION_DEFINITIONS = [
  {
    id: "introduction",
    title: "Introducción",
    headings: ["introduccion", "introducción"],
  },
  {
    id: "problem",
    title: "Planteamiento del problema",
    headings: [
      "planteamiento del problema",
      "problema de investigacion",
      "problema de investigación",
    ],
  },
  {
    id: "justification",
    title: "Justificación",
    headings: ["justificacion", "justificación"],
  },
  {
    id: "theory",
    title: "Marco teórico",
    headings: [
      "marco teorico",
      "marco teórico",
      "fundamento teorico",
      "fundamento teórico",
    ],
  },
  {
    id: "methodology",
    title: "Metodología",
    headings: ["metodologia", "metodología"],
  },
  {
    id: "development",
    title: "Desarrollo",
    headings: ["desarrollo del proyecto", "desarrollo"],
  },
  {
    id: "results",
    title: "Resultados",
    headings: [
      "resultados",
      "analisis de resultados",
      "análisis de resultados",
    ],
  },
];

const SECTION_LOOKUP = [
  ...SECTION_DEFINITIONS,
  { id: "summary", title: "Resumen", headings: ["resumen", "abstract"] },
  {
    id: "conclusions",
    title: "Conclusiones",
    headings: ["conclusiones", "conclusion", "conclusión"],
  },
  {
    id: "recommendations",
    title: "Recomendaciones",
    headings: ["recomendaciones"],
  },
  {
    id: "references",
    title: "Referencias",
    headings: [
      "bibliografia",
      "bibliografía",
      "referencias",
      "referencias bibliograficas",
      "referencias bibliográficas",
    ],
  },
  {
    id: "objectives",
    title: "Objetivos",
    headings: [
      "objetivos",
      "objetivo general",
      "objetivos especificos",
      "objetivos específicos",
    ],
  },
];

const normalized = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*[-:]?\s*)/, "")
    .replace(/[:.\s]+$/, "")
    .trim();

function safeFileName(name) {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/^\.+/, "") || "documento.pdf"
  );
}

export function createEmptyProject() {
  const projectId = `proyecto-${Math.random().toString(36).slice(2, 8)}`;
  return {
    projectId,
    title: "",
    description: "",
    institution: "",
    authors: [],
    summary: "",
    objectives: { general: "", specific: [] },
    sections: SECTION_DEFINITIONS.map(({ id, title }) => ({
      id,
      title,
      content: "",
      pendingReview: true,
    })),
    tables: [],
    conclusions: [],
    recommendations: [],
    references: [],
    media: [],
    videos: [],
    resourceConfig: { mode: "local", rawBaseUrl: "" },
    originalDocument: null,
    updatedAt: new Date().toISOString(),
    extraction: {
      sourceFileName: "",
      pageCount: 0,
      ocrPages: [],
      pendingReview: true,
      reviewed: false,
    },
  };
}

function findHeading(line) {
  const candidate = normalized(line);
  return SECTION_LOOKUP.find((section) =>
    section.headings.some((heading) => normalized(heading) === candidate),
  );
}

function collectParagraphs(rawText) {
  return rawText
    .split(/\n+/)
    .map((line) =>
      line.includes("\t")
        ? line
            .split("\t")
            .map((cell) => cell.replace(/\s+/g, " ").trim())
            .join("\t")
        : line.replace(/\s+/g, " ").trim(),
    )
    .filter(Boolean);
}

export function extractProjectFromText(
  rawText,
  fileName = "",
  pageCount = 0,
  ocrPages = [],
) {
  const project = createEmptyProject();
  const lines = collectParagraphs(rawText);
  const buckets = new Map(SECTION_LOOKUP.map(({ id }) => [id, []]));
  buckets.set("objective-general", []);
  buckets.set("objective-specific", []);
  let activeSection = null;
  const unclassified = [];

  for (const line of lines) {
    const headingText = line.split(":", 1)[0].trim();
    const heading = findHeading(headingText);
    if (heading) {
      const cleanHeading = normalized(headingText);
      activeSection =
        heading.id === "objectives" && cleanHeading === "objetivo general"
          ? "objective-general"
          : heading.id === "objectives" &&
              cleanHeading.startsWith("objetivos especificos")
            ? "objective-specific"
            : heading.id;
      const remainder = line.includes(":")
        ? line.slice(line.indexOf(":") + 1).trim()
        : "";
      if (remainder !== line && remainder.trim())
        buckets.get(activeSection).push(remainder.trim());
      continue;
    }
    if (activeSection) buckets.get(activeSection).push(line);
    else unclassified.push(line);
  }

  const firstTitle = unclassified.find(
    (line) => line.length > 4 && line.length < 180,
  );
  const titleHeading = lines.find((line) => /^t[ií]tulo\s*:/i.test(line));
  project.title = titleHeading
    ? titleHeading.replace(/^t[ií]tulo\s*:/i, "").trim()
    : firstTitle || "";

  const institution = lines.find((line) =>
    /^(instituci[oó]n|colegio|escuela|universidad)\s*:/i.test(line),
  );
  project.institution = institution
    ? institution.replace(/^[^:]+:\s*/, "").trim()
    : "";
  const description = lines.find((line) => /^descripci[oó]n\s*:/i.test(line));
  project.description = description
    ? description.replace(/^[^:]+:\s*/, "").trim()
    : "";
  const authors = lines.find((line) =>
    /^(autores?|integrantes?|estudiantes?)\s*:/i.test(line),
  );
  project.authors = authors
    ? authors
        .replace(/^[^:]+:\s*/, "")
        .split(/[,;]|\s+y\s+/i)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name, index) => ({
          id: `integrante-${index + 1}`,
          name,
          role: "",
        }))
    : [];
  project.summary = buckets.get("summary").join("\n\n");
  project.objectives.general = buckets
    .get("objective-general")
    .join("\n\n")
    .trim();
  project.objectives.specific = buckets
    .get("objective-specific")
    .flatMap((item) => item.split(/\n+/))
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  project.sections = project.sections.map((section) => {
    const content = buckets.get(section.id).join("\n\n").trim();
    return { ...section, content, pendingReview: !content };
  });
  project.conclusions = buckets
    .get("conclusions")
    .join("\n\n")
    .split(/\n+/)
    .filter(Boolean);
  project.recommendations = buckets
    .get("recommendations")
    .join("\n\n")
    .split(/\n+/)
    .filter(Boolean);
  project.references = buckets
    .get("references")
    .join("\n\n")
    .split(/\n+/)
    .filter(Boolean);
  const tabularRows = rawText
    .split(/\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.length > 1 && cells.some(Boolean));
  project.tables =
    tabularRows.length > 0
      ? [
          {
            id: "tabla-1",
            title: "Tabla recuperada del documento",
            rows: tabularRows,
          },
        ]
      : [];
  project.extraction = {
    sourceFileName: fileName,
    pageCount,
    ocrPages,
    pendingReview: true,
    reviewed: false,
  };
  return project;
}

export function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return ["El contenido del proyecto debe ser un objeto JSON."];
  }
  if (
    typeof project.projectId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(project.projectId)
  )
    errors.push("Falta un identificador de proyecto válido.");
  if (
    typeof project.title !== "string" ||
    typeof project.description !== "string" ||
    typeof project.institution !== "string" ||
    typeof project.summary !== "string"
  ) {
    errors.push("Título, descripción, institución y resumen deben ser texto.");
  }
  if (!Array.isArray(project.authors) || !Array.isArray(project.sections))
    errors.push("Autores y secciones deben ser listas.");
  if (
    !Array.isArray(project.media) ||
    !Array.isArray(project.tables) ||
    !Array.isArray(project.conclusions) ||
    !Array.isArray(project.recommendations) ||
    !Array.isArray(project.references)
  ) {
    errors.push("Recursos, conclusiones y referencias deben ser listas.");
  }
  if (
    !project.extraction ||
    typeof project.extraction !== "object" ||
    !Array.isArray(project.extraction.ocrPages)
  ) {
    errors.push("Faltan los metadatos de extracción del documento.");
  }
  if (
    !project.objectives ||
    typeof project.objectives.general !== "string" ||
    !Array.isArray(project.objectives.specific)
  ) {
    errors.push(
      "Los objetivos deben incluir un objetivo general y una lista de objetivos específicos.",
    );
  }
  if (Array.isArray(project.sections)) {
    project.sections.forEach((section, index) => {
      if (
        !section ||
        typeof section.id !== "string" ||
        typeof section.title !== "string" ||
        typeof section.content !== "string"
      ) {
        errors.push(`La sección ${index + 1} tiene una estructura inválida.`);
      }
    });
  }
  if (
    Array.isArray(project.authors) &&
    project.authors.some(
      (author) =>
        !author ||
        typeof author.id !== "string" ||
        typeof author.name !== "string",
    )
  ) {
    errors.push(
      "Cada integrante debe incluir un identificador y nombre de texto.",
    );
  }
  const validTables = Array.isArray(project.tables)
    ? project.tables.filter(
        (table) =>
          table && Array.isArray(table.rows) && table.rows.every(Array.isArray),
      )
    : [];
  if (
    Array.isArray(project.tables) &&
    validTables.length !== project.tables.length
  ) {
    errors.push(
      "Las tablas deben contener filas organizadas como listas de celdas.",
    );
  }
  if (
    validTables.some((table) =>
      table.rows.some((row) => row.some((cell) => typeof cell !== "string")),
    )
  ) {
    errors.push("Las celdas de las tablas deben contener texto.");
  }
  if (
    Array.isArray(project.media) &&
    project.media.some((media) => {
      if (
        !media ||
        typeof media.name !== "string" ||
        typeof media.alt !== "string" ||
        typeof media.path !== "string" ||
        media.path.includes("..")
      )
        return true;
      if (
        media.source !== undefined &&
        !["local", "github-raw"].includes(media.source)
      )
        return true;
      if (
        ["title", "description", "visualDescription", "ocrText"].some(
          (key) => media[key] !== undefined && typeof media[key] !== "string",
        )
      )
        return true;
      if (
        media.order !== undefined &&
        (!Number.isInteger(media.order) || media.order < 1)
      )
        return true;
      if (media.featured !== undefined && typeof media.featured !== "boolean")
        return true;
      if (
        [
          "ocrReviewRequired",
          "ocrReviewed",
          "visualReviewRequired",
          "visualReviewed",
        ].some(
          (key) => media[key] !== undefined && typeof media[key] !== "boolean",
        )
      )
        return true;
      if (
        media.ocrConfidence !== undefined &&
        media.ocrConfidence !== null &&
        (typeof media.ocrConfidence !== "number" ||
          media.ocrConfidence < 0 ||
          media.ocrConfidence > 100)
      )
        return true;
      if (
        media.section &&
        (!Array.isArray(project.sections) ||
          !project.sections.some((section) => section.id === media.section))
      )
        return true;
      if (media.source === "github-raw") {
        return (
          !isValidGitHubRawBaseUrl(project.resourceConfig?.rawBaseUrl) ||
          !/^[A-Za-z0-9._/-]+$/.test(media.path) ||
          media.path.startsWith("/") ||
          media.path.includes("\\") ||
          media.path.split("/").some((part) => part === "." || part === "..") ||
          !/\.(?:jpe?g|png|webp)$/i.test(media.path)
        );
      }
      return (
        !/^[A-Za-z0-9._/-]+$/.test(media.path) ||
        !["images/proyecto/", "documents/images/proyecto/"].some((prefix) =>
          media.path.startsWith(prefix),
        ) ||
        !/\.(?:jpe?g|png|webp)$/i.test(media.path)
      );
    })
  ) {
    errors.push(
      "Cada imagen debe tener metadatos y una ruta local segura o una ruta relativa a GitHub Raw configurado.",
    );
  }
  if (
    project.videos !== undefined &&
    (!Array.isArray(project.videos) ||
      project.videos.some((video) => {
        const parsed = parseYouTubeUrl(video?.url);
        return (
          !video ||
          typeof video.id !== "string" ||
          typeof video.title !== "string" ||
          typeof video.description !== "string" ||
          !video.title.trim() ||
          video.platform !== "youtube" ||
          !parsed ||
          video.videoId !== parsed.videoId ||
          video.embedUrl !== parsed.embedUrl ||
          (video.section !== "" &&
            (!Array.isArray(project.sections) ||
              !project.sections.some(
                (section) => section.id === video.section,
              ))) ||
          !Number.isInteger(video.order) ||
          video.order < 1
        );
      }))
  ) {
    errors.push(
      "Cada video debe tener una URL de YouTube válida y metadatos coherentes.",
    );
  }
  if (project.resourceConfig !== undefined) {
    const config = project.resourceConfig;
    if (
      !config ||
      !["local", "github-raw"].includes(config.mode) ||
      typeof config.rawBaseUrl !== "string"
    ) {
      errors.push(
        "La configuración de recursos debe indicar un origen local o una URL de GitHub Raw.",
      );
    } else if (
      config.mode === "github-raw" &&
      !isValidGitHubRawBaseUrl(config.rawBaseUrl)
    ) {
      errors.push(
        "Configura una URL HTTPS válida de raw.githubusercontent.com para cargar los JSON externos.",
      );
    } else if (
      config.rawBaseUrl &&
      !isValidGitHubRawBaseUrl(config.rawBaseUrl)
    ) {
      errors.push(
        "La URL de recursos externos debe pertenecer a raw.githubusercontent.com.",
      );
    }
  }
  if (
    Array.isArray(project.conclusions) &&
    project.conclusions.some((item) => typeof item !== "string")
  )
    errors.push("Las conclusiones deben ser texto.");
  if (
    Array.isArray(project.recommendations) &&
    project.recommendations.some((item) => typeof item !== "string")
  )
    errors.push("Las recomendaciones deben ser texto.");
  if (
    Array.isArray(project.references) &&
    project.references.some((item) => typeof item !== "string")
  )
    errors.push("Las referencias deben ser texto.");
  try {
    JSON.stringify(project);
  } catch {
    errors.push("El proyecto no se puede serializar como JSON.");
  }
  return errors;
}

export function hydrateProjectFromFiles(project, documents = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new Error("El contenido del proyecto debe ser un objeto JSON.");
  }
  if (!project.content || typeof project.content !== "object") return project;

  const authorsDocument = documents.integrantes || {};
  const developmentDocument = documents.desarrollo || {};
  const multimediaDocument = documents.multimedia || {};
  const authors = Array.isArray(authorsDocument.integrantes)
    ? authorsDocument.integrantes
    : [];
  const developmentSections = Array.isArray(developmentDocument.sections)
    ? developmentDocument.sections
    : [];
  const sectionContent = new Map(
    developmentSections.map((section) => [section.id, section]),
  );
  const authorRecords = new Map(authors.map((author) => [author.id, author]));
  const sections = Array.isArray(project.sections)
    ? project.sections.map((section) => ({
        ...section,
        ...(sectionContent.get(section.id) || {}),
        content: sectionContent.get(section.id)?.content || "",
      }))
    : developmentSections;
  const media = Array.isArray(multimediaDocument.images)
    ? multimediaDocument.images
    : project.media || [];

  return {
    ...project,
    authors: Array.isArray(project.authors)
      ? project.authors.map((author) =>
          typeof author === "string" ? authorRecords.get(author) : author,
        )
      : authors,
    objectives: documents.objetivos || project.objectives || {
      general: "",
      specific: [],
    },
    sections,
    tables: developmentDocument.tables || [],
    recommendations: developmentDocument.recommendations || [],
    conclusions:
      documents.conclusiones?.items || project.conclusions || [],
    references: documents.referencias?.items || project.references || [],
    media,
    videos:
      Array.isArray(multimediaDocument.videos)
        ? multimediaDocument.videos
        : project.videos || [],
    resourceConfig:
      multimediaDocument.resourceConfig ||
      project.resourceConfig || { mode: "local", rawBaseUrl: "" },
  };
}

export function createProjectFiles(
  project,
  { includeOriginal = false, hideEmptySections = true } = {},
) {
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors.join("\n"));

  const files = {
    "proyecto.json": {
      projectId: project.projectId,
      title: project.title,
      description: project.description,
      institution: project.institution,
      summary: project.summary,
      authors: project.authors.map(({ id }) => id),
      sections: project.sections.map(({ id, title }) => ({ id, title })),
      hideEmptySections,
      content: {
        integrantes: "integrantes.json",
        objetivos: "objetivos.json",
        desarrollo: "desarrollo.json",
        conclusiones: "conclusiones.json",
        referencias: "referencias.json",
        multimedia: "multimedia.json",
      },
      media: project.media.map(({ preview, ...image }) => image),
      videos: project.videos || [],
      resourceConfig: project.resourceConfig || {
        mode: "local",
        rawBaseUrl: "",
      },
      originalDocument:
        includeOriginal && project.extraction.sourceFileName
          ? {
              path: `documents/${safeFileName(project.extraction.sourceFileName)}`,
            }
          : null,
      updatedAt: project.updatedAt,
      extraction: project.extraction,
    },
    "integrantes.json": { integrantes: project.authors },
    "objetivos.json": project.objectives,
    "desarrollo.json": {
      sections: project.sections,
      tables: project.tables,
      recommendations: project.recommendations,
    },
    "conclusiones.json": { items: project.conclusions },
    "referencias.json": { items: project.references },
    "multimedia.json": {
      images: project.media.map(({ preview, ...image }) => image),
      videos: project.videos || [],
      resourceConfig: project.resourceConfig || {
        mode: "local",
        rawBaseUrl: "",
      },
    },
  };
  return Object.fromEntries(
    Object.entries(files).map(([name, value]) => [
      name,
      `${JSON.stringify(value, null, 2)}\n`,
    ]),
  );
}

export function buildPagesUrl(owner, repository) {
  const safeOwner = owner.trim();
  const safeRepository = repository.trim();
  if (
    !/^[A-Za-z0-9-]+$/.test(safeOwner) ||
    !/^[A-Za-z0-9._-]+$/.test(safeRepository) ||
    safeRepository === "." ||
    safeRepository === ".."
  )
    return "";
  const path =
    safeRepository.toLowerCase() === `${safeOwner.toLowerCase()}.github.io`
      ? ""
      : `/${safeRepository}`;
  return `https://${safeOwner}.github.io${path}/`;
}
