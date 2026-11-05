import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  MAX_PDF_SIZE,
  createEmptyProject,
  extractProjectFromText,
  hydrateProjectFromFiles,
  validateProject,
  buildPagesUrl,
} from "./utils/projectData";
import { DEVELOPER_PROFILE } from "./utils/developerProfile";
import { ActionButton, Icon, Surface } from "./components/Primitives";
import YouTubePlayer from "./components/YouTubePlayer";
import {
  analyzeImageFiles,
  isValidGitHubRawBaseUrl,
  isValidExternalImageUrl,
  normalizeGitHubRawBaseUrl,
  parseYouTubeUrl,
  resolveRawResourceUrl,
  validateImageFiles,
} from "./utils/multimedia";

const navigation = [
  { id: "home", label: "Inicio" },
  { id: "import", label: "Importar PDF" },
  { id: "editor", label: "Editor de información" },
  { id: "images", label: "Imágenes y OCR" },
  { id: "videos", label: "Videos YouTube" },
  { id: "preview", label: "Vista previa" },
  { id: "export", label: "Exportar archivos" },
  { id: "qr", label: "Generador QR" },
  { id: "publish", label: "Publicación" },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractedJsonFilename(sourceFileName, fallback) {
  const baseName = sourceFileName
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^\.+/, "");
  return `${baseName || fallback}.json`;
}

function uniqueMediaId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function Notice({ tone = "info", children }) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

function isPublicViewHash(hash) {
  return (
    hash.slice(1).split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase() ===
    "/view"
  );
}

function publicDocumentUrl(fileName = "") {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const path = fileName
    ? `documents/${fileName.split("/").map(encodeURIComponent).join("/")}`
    : "documents/index.json";
  return new URL(path, baseUrl);
}

function getContentImageSource(source) {
  const cleanedSource = source.replace(/[.,;]+$/, "");
  try {
    const url = new URL(cleanedSource, window.location.origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)
    ) {
      return null;
    }
    if (!/^https?:\/\//i.test(cleanedSource)) {
      if (cleanedSource.split(/[?#]/, 1)[0].split("/").includes(".."))
        return null;
      const localPath = decodeURIComponent(url.pathname);
      if (
        localPath.split("/").some((part) => part === "." || part === "..") ||
        !/(?:^|\/)(?:documents\/)?images\//i.test(localPath)
      ) {
        return null;
      }
    }
    return cleanedSource;
  } catch {
    return null;
  }
}

function ProjectSectionContent({
  content,
  media = [],
  mediaSrc,
  documentFile,
}) {
  const blocks = [];
  let textLines = [];
  const flushText = () => {
    if (textLines.some((line) => line.trim())) {
      blocks.push({ type: "text", content: textLines.join("\n") });
    }
    textLines = [];
  };
  const appendImage = (source, label, key) => {
    const image = media.find((item) => item.path === source);
    let src = image ? mediaSrc(image) : source;
    if (!image && !/^https?:\/\//i.test(source)) {
      const localPath = source
        .replace(/^\.?\//, "")
        .replace(/^documents\//, "");
      src = new URL(
        localPath.split("/").map(encodeURIComponent).join("/"),
        publicDocumentUrl(documentFile),
      ).href;
    }
    blocks.push({
      type: "image",
      key,
      src,
      alt: label,
      caption: label,
    });
  };

  content.split("\n").forEach((line, lineIndex) => {
    if (!line.trim()) {
      flushText();
      return;
    }
    const pattern =
      /!\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+|(?:\.{0,2}\/)?(?:documents\/)?images\/[^\s)]+)/gi;
    let lastIndex = 0;
    let foundImage = false;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const source = getContentImageSource(match[2] || match[3]);
      if (!source) continue;
      const prefix = line.slice(lastIndex, match.index);
      const label = (match[1] || prefix)
        .replace(/^\s*[-*•]\s*/, "")
        .replace(/[\s:–—-]+$/, "")
        .trim();
      if (prefix.trim()) textLines.push(prefix.trim());
      flushText();
      appendImage(source, label, `${lineIndex}-${match.index}`);
      lastIndex = pattern.lastIndex;
      foundImage = true;
    }
    if (foundImage) {
      const suffix = line.slice(lastIndex).trim();
      if (suffix) textLines.push(suffix);
    } else {
      textLines.push(line);
    }
  });
  flushText();

  return (
    <div className="project-rich-content">
      {blocks.map((block, index) =>
        block.type === "image" ? (
          <figure className="project-inline-image" key={block.key}>
            <img
              src={block.src}
              alt={block.alt}
              loading="lazy"
              decoding="async"
            />
            {block.caption && <figcaption>{block.caption}</figcaption>}
          </figure>
        ) : (
          <p key={`text-${index}`}>{block.content}</p>
        ),
      )}
    </div>
  );
}

function PublicClientView({ hash }) {
  const [view, setView] = useState({
    loading: true,
    project: null,
    file: "",
    projects: [],
    error: "",
  });

  useEffect(() => {
    let active = true;
    const loadProject = async () => {
      setView({
        loading: true,
        project: null,
        file: "",
        projects: [],
        error: "",
      });
      try {
        const manifestResponse = await fetch(publicDocumentUrl());
        let projects;
        if (manifestResponse.status === 404) {
          projects = [{ file: "proyecto.json", title: "Proyecto escolar" }];
        } else if (!manifestResponse.ok) {
          throw new Error(
            "No se pudo cargar el índice de proyectos publicados.",
          );
        } else {
          const manifest = await manifestResponse.json();
          if (!Array.isArray(manifest.projects))
            throw new Error(
              "El índice de proyectos no tiene un formato válido.",
            );
          projects = manifest.projects;
        }
        const requestedFile = new URLSearchParams(hash.split("?")[1] || "").get(
          "project",
        );
        if (!projects.length) {
          if (active)
            setView({
              loading: false,
              project: null,
              file: "",
              projects,
              error: "Todavía no hay proyectos JSON en la carpeta documents.",
            });
          return;
        }
        if (
          requestedFile &&
          !projects.some((item) => item.file === requestedFile)
        ) {
          throw new Error(
            "El proyecto solicitado no aparece en el índice publicado.",
          );
        }
        if (!requestedFile && projects.length > 1) {
          if (active)
            setView({
              loading: false,
              project: null,
              file: "",
              projects,
              error: "",
            });
          return;
        }

        const selected =
          projects.find((item) => item.file === requestedFile) || projects[0];
        const projectResponse = await fetch(publicDocumentUrl(selected.file));
        if (!projectResponse.ok)
          throw new Error(`No se pudo cargar ${selected.file}.`);
        let project = await projectResponse.json();
        if (project.content && typeof project.content === "object") {
          const documents = await Promise.all(
            Object.entries(project.content).map(async ([key, fileName]) => {
              if (
                typeof fileName !== "string" ||
                !/^[a-zA-Z0-9._-]+\.json$/i.test(fileName)
              ) {
                throw new Error(
                  `La referencia JSON "${key}" no contiene un nombre de archivo seguro.`,
                );
              }
              const resourceUrl =
                project.resourceConfig?.mode === "github-raw"
                  ? resolveRawResourceUrl(
                      project.resourceConfig.rawBaseUrl,
                      `data/${fileName}`,
                    )
                  : publicDocumentUrl(fileName);
              const response = await fetch(resourceUrl);
              if (!response.ok)
                throw new Error(`No se pudo cargar ${fileName}.`);
              return [key, await response.json()];
            }),
          );
          project = hydrateProjectFromFiles(
            project,
            Object.fromEntries(documents),
          );
        }
        if (
          (!Array.isArray(project.media) || project.media.length === 0) &&
          selected.images?.length
        ) {
          project.media = selected.images.map((path) => {
            const name = path.split("/").pop();
            return { name, path, alt: name };
          });
        }
        const validationErrors = validateProject(project);
        if (validationErrors.length)
          throw new Error(
            `El archivo ${selected.file} no contiene un proyecto válido: ${validationErrors.join(" ")}`,
          );
        if (active)
          setView({
            loading: false,
            project,
            file: selected.file,
            projects,
            error: "",
          });
      } catch (loadError) {
        if (active)
          setView({
            loading: false,
            project: null,
            file: "",
            projects: [],
            error: loadError.message,
          });
      }
    };

    loadProject();
    return () => {
      active = false;
    };
  }, [hash]);

  if (view.loading) {
    return (
      <main className="client-view client-loading" aria-busy="true">
        <p className="visually-hidden" role="status">
          Cargando proyecto…
        </p>
        <div
          className="loading-skeleton loading-skeleton-hero"
          aria-hidden="true"
        />
        <div
          className="loading-skeleton loading-skeleton-card"
          aria-hidden="true"
        />
        <div
          className="loading-skeleton loading-skeleton-card"
          aria-hidden="true"
        />
      </main>
    );
  }
  if (view.error) {
    return (
      <main className="client-view">
        <section className="client-message" role="alert">
          <h1>No se pudo mostrar el proyecto</h1>
          <p>{view.error}</p>
          <p>
            Coloca el archivo JSON y sus imágenes en <code>documents/</code> y
            vuelve a publicar el sitio.
          </p>
        </section>
      </main>
    );
  }
  if (!view.project) {
    return (
      <main className="client-view">
        <section className="client-message">
          <p className="eyebrow">Proyectos</p>
          <h1>Selecciona un proyecto</h1>
          <div className="client-project-list">
            {view.projects.map((item) => (
              <a
                key={item.file}
                href={`#/View?project=${encodeURIComponent(item.file)}`}
              >
                {item.title || "Proyecto escolar"}
              </a>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const mediaSrc = (media) => {
    if (media.preview) return media.preview;
    if (isValidExternalImageUrl(media.path)) return media.path;
    if (media.source === "github-raw")
      return resolveRawResourceUrl(
        view.project.resourceConfig?.rawBaseUrl,
        media.path,
      );
    const path = media.path.replace(/^\/+/, "").replace(/^documents\//, "");
    return new URL(
      path.split("/").map(encodeURIComponent).join("/"),
      publicDocumentUrl(view.file),
    ).href;
  };
  return (
    <main className="client-view">
      <PublicPreview
        project={view.project}
        mediaSrc={mediaSrc}
        documentFile={view.file}
      />
    </main>
  );
}

function PageHeader({ eyebrow, title, description }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
    </div>
  );
}

function PublicPreview({
  project,
  hideEmpty = true,
  mediaSrc = (media) => media.preview || media.path,
  documentFile = "",
}) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lightboxRef = useRef(null);
  const touchStartRef = useRef(null);
  const visibleSections = project.sections.filter(
    (section) => !hideEmpty || section.content.trim(),
  );
  const specificObjectives = project.objectives.specific.filter(Boolean);
  const conclusions = project.conclusions.filter(Boolean);
  const recommendations = project.recommendations.filter(Boolean);
  const references = project.references.filter(Boolean);
  const hasGoals = project.objectives.general || specificObjectives.length;
  const hasContent =
    project.description ||
    project.summary ||
    hasGoals ||
    visibleSections.length ||
    project.tables.length ||
    conclusions.length ||
    recommendations.length ||
    references.length ||
    project.media.length ||
    (project.videos || []).length;
  const chapters = [
    ...(project.summary
      ? [
          {
            id: "project-summary",
            label: "Resumen",
            title: "El proyecto en breve",
            content: project.summary,
          },
        ]
      : []),
    ...(hasGoals
      ? [
          {
            id: "project-objectives",
            label: "Objetivos",
            title: "Objetivo general",
            content: project.objectives.general,
            listTitle: specificObjectives.length ? "Objetivos específicos" : "",
            items: specificObjectives,
          },
        ]
      : []),
    ...visibleSections.map((section) => ({
      id: `project-section-${section.id}`,
      label: section.title,
      title: section.title,
      content: section.content || "Contenido pendiente de revisión.",
    })),
  ];
  const images = [...project.media].sort(
    (a, b) =>
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      (a.order || 0) - (b.order || 0),
  );
  const firstMedia = images[0];
  const remainingMedia = images.slice(firstMedia ? 1 : 0);
  const videos = [...(project.videos || [])].sort((a, b) => a.order - b.order);
  useEffect(() => {
    if (lightboxIndex !== null) lightboxRef.current?.focus();
  }, [lightboxIndex]);
  const pageLinks = [
    ...chapters.map(({ id, label }) => ({ id, label })),
    ...(project.tables.length
      ? [{ id: "project-tables", label: "Tablas" }]
      : []),
    ...(conclusions.length
      ? [{ id: "project-conclusions", label: "Conclusiones" }]
      : []),
    ...(recommendations.length
      ? [{ id: "project-recommendations", label: "Recomendaciones" }]
      : []),
    ...(references.length
      ? [{ id: "project-references", label: "Referencias" }]
      : []),
    ...(remainingMedia.length
      ? [{ id: "project-gallery", label: "Galería" }]
      : []),
    ...(videos.length ? [{ id: "project-videos", label: "Videos" }] : []),
  ];
  const pageLinkIds = pageLinks.map(({ id }) => id).join("|");
  const [activeSection, setActiveSection] = useState(pageLinks[0]?.id || "");
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const handleTouchEnd = (event) => {
      const start = touchStartRef.current;
      const touch = event.changedTouches[0];
      touchStartRef.current = null;
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaY) > 60) return;
      if (!mobileNavOpen && start.x <= 28 && deltaX > 0) setMobileNavOpen(true);
      else if (mobileNavOpen && deltaX < 0) setMobileNavOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);
  useEffect(() => {
    const hero = document.getElementById("project-start");
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry.isIntersecting);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pageLinks.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              first.boundingClientRect.top - second.boundingClientRect.top,
          );
        if (visibleSections[0]) setActiveSection(visibleSections[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    pageLinks.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [pageLinkIds]);
  return (
    <>
      <div className="public-preview project-infographic">
        <div className="infographic-masthead">
          <span className="infographic-brand">
            Aula<span>.</span>
          </span>
          <span>Proyecto escolar</span>
        </div>
        <header className="infographic-hero" id="project-start">
          <div className="infographic-hero-copy">
            <p className="infographic-institution">
              {project.institution || "Proyecto escolar"}
            </p>
            <p className="eyebrow">
              {project.extraction.pageCount > 0
                ? `Documento fuente · ${project.extraction.pageCount} páginas`
                : "Proyecto escolar"}
            </p>
            <h1>{project.title || "Proyecto escolar"}</h1>
            {project.description && (
              <p className="infographic-description">{project.description}</p>
            )}
            {project.authors.length > 0 && (
              <p className="preview-byline">
                Por{" "}
                {project.authors
                  .map((author) => author.name)
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
          {firstMedia ? (
            <figure className="infographic-cover">
              <button
                type="button"
                className="gallery-image-button"
                aria-label={`Ampliar ${firstMedia.title || firstMedia.alt || firstMedia.name}`}
                onClick={() => setLightboxIndex(0)}
              >
                <img
                  src={mediaSrc(firstMedia)}
                  alt={firstMedia.alt || firstMedia.title || firstMedia.name}
                  loading="lazy"
                  decoding="async"
                />
              </button>
              {(firstMedia.title ||
                firstMedia.description ||
                firstMedia.alt ||
                firstMedia.name ||
                firstMedia.section) && (
                <figcaption>
                  {firstMedia.title && <strong>{firstMedia.title}</strong>}
                  {firstMedia.description && (
                    <span>{firstMedia.description}</span>
                  )}
                  {!firstMedia.title &&
                    !firstMedia.description &&
                    (firstMedia.alt || firstMedia.name)}
                  {firstMedia.section &&
                    ` · ${project.sections.find((section) => section.id === firstMedia.section)?.title || firstMedia.section}`}
                </figcaption>
              )}
            </figure>
          ) : (
            <div className="infographic-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
        </header>
        <div className="infographic-layout">
          {pageLinks.length > 0 && (
            <nav
              className={`infographic-toc ${heroVisible ? "infographic-toc-before-content" : ""} ${mobileNavOpen ? "infographic-toc-open" : ""}`}
              aria-label="Secciones del proyecto"
              id="project-section-navigation"
            >
              <div className="infographic-toc-heading">
                <strong>Secciones</strong>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Cerrar navegación"
                >
                  ×
                </button>
              </div>
              {pageLinks.map(({ id, label }) => (
                <a
                  href={`#${id}`}
                  key={id}
                  aria-current={activeSection === id ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveSection(id);
                    document.getElementById(id)?.scrollIntoView?.({
                      behavior: window.matchMedia?.(
                        "(prefers-reduced-motion: reduce)",
                      )?.matches
                        ? "auto"
                        : "smooth",
                      block: "start",
                    });
                    setMobileNavOpen(false);
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>
          )}

          <div className="infographic-content">
            {!hasContent && (
              <p className="empty-state">
                Todavía no hay contenido para mostrar. Importa un PDF o completa
                el editor.
              </p>
            )}
            {chapters.length > 0 && (
              <section
                className="infographic-flow"
                aria-label="Contenido del proyecto"
              >
                {chapters.map((chapter, index) => (
                  <article
                    className="infographic-chapter"
                    id={chapter.id}
                    key={chapter.id}
                  >
                    <div className="chapter-marker" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="chapter-card">
                      <p className="chapter-kicker">{chapter.label}</p>
                      <h2>{chapter.title}</h2>
                      {chapter.content && (
                        <ProjectSectionContent
                          content={chapter.content}
                          media={project.media}
                          mediaSrc={mediaSrc}
                          documentFile={documentFile}
                        />
                      )}
                      {chapter.listTitle && <h3>{chapter.listTitle}</h3>}
                      {chapter.items?.length > 0 && (
                        <ul>
                          {chapter.items.map((item, itemIndex) => (
                            <li key={itemIndex}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}
            {project.tables.length > 0 && (
              <section className="infographic-extra" id="project-tables">
                <h2>Tablas del proyecto</h2>
                <div className="infographic-data-grid">
                  {project.tables.map((table) => (
                    <article className="infographic-data-card" key={table.id}>
                      <h3>{table.title}</h3>
                      <div className="table-scroll">
                        <table>
                          <tbody>
                            {table.rows.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((cell, cellIndex) =>
                                  rowIndex === 0 ? (
                                    <th key={cellIndex} scope="col">
                                      {cell}
                                    </th>
                                  ) : (
                                    <td key={cellIndex}>{cell}</td>
                                  ),
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {(conclusions.length > 0 || recommendations.length > 0) && (
              <section className="infographic-data-grid">
                {conclusions.length > 0 && (
                  <article
                    className="infographic-data-card infographic-accent-peach"
                    id="project-conclusions"
                  >
                    <p className="chapter-kicker">Cierre</p>
                    <h2>Conclusiones</h2>
                    <ul>
                      {conclusions.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </article>
                )}
                {recommendations.length > 0 && (
                  <article
                    className="infographic-data-card infographic-accent-lilac"
                    id="project-recommendations"
                  >
                    <p className="chapter-kicker">Siguientes pasos</p>
                    <h2>Recomendaciones</h2>
                    <ul>
                      {recommendations.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </article>
                )}
              </section>
            )}
            {references.length > 0 && (
              <section
                className="infographic-data-card infographic-references"
                id="project-references"
              >
                <p className="chapter-kicker">Fuentes consultadas</p>
                <h2>Referencias</h2>
                <ol>
                  {references.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ol>
              </section>
            )}
            {remainingMedia.length > 0 && (
              <section
                className="infographic-gallery infographic-data-card"
                id="project-gallery"
              >
                <p className="chapter-kicker">Material visual</p>
                <h2>Galería del proyecto</h2>
                <div className="image-grid">
                  {remainingMedia.map((image, index) => (
                    <figure key={image.id || image.path}>
                      <button
                        type="button"
                        className="gallery-image-button"
                        aria-label={`Ampliar ${image.title || image.alt || image.name}`}
                        onClick={() =>
                          setLightboxIndex(index + (firstMedia ? 1 : 0))
                        }
                      >
                        <img
                          src={mediaSrc(image)}
                          alt={image.alt || image.title || image.name}
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                      {image.title && <strong>{image.title}</strong>}
                      {(image.description || image.alt) && (
                        <figcaption>
                          {image.description || image.alt}
                        </figcaption>
                      )}
                      {image.section && (
                        <small>
                          Sección:{" "}
                          {project.sections.find(
                            (section) => section.id === image.section,
                          )?.title || image.section}
                        </small>
                      )}
                    </figure>
                  ))}
                </div>
              </section>
            )}
            {videos.length > 0 && (
              <section
                className="infographic-data-card infographic-videos"
                id="project-videos"
              >
                <p className="chapter-kicker">Material audiovisual</p>
                <h2>Videos del proyecto</h2>
                <div className="video-grid">
                  {videos.map((video) => (
                    <div key={video.id}>
                      <YouTubePlayer video={video} />
                      {video.section && (
                        <small>
                          Sección:{" "}
                          {project.sections.find(
                            (section) => section.id === video.section,
                          )?.title || video.section}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        {lightboxIndex !== null && images[lightboxIndex] && (
          <div
            ref={lightboxRef}
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Vista ampliada de la galería"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") setLightboxIndex(null);
              if (event.key === "ArrowLeft")
                setLightboxIndex(
                  (index) => (index - 1 + images.length) % images.length,
                );
              if (event.key === "ArrowRight")
                setLightboxIndex((index) => (index + 1) % images.length);
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setLightboxIndex(null);
            }}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setLightboxIndex(null)}
              aria-label="Cerrar imagen ampliada"
            >
              ×
            </button>
            <button
              type="button"
              className="lightbox-previous"
              onClick={() =>
                setLightboxIndex(
                  (index) => (index - 1 + images.length) % images.length,
                )
              }
              aria-label="Imagen anterior"
            >
              ‹
            </button>
            <figure>
              <img
                src={mediaSrc(images[lightboxIndex])}
                alt={
                  images[lightboxIndex].alt ||
                  images[lightboxIndex].title ||
                  images[lightboxIndex].name
                }
              />
              <figcaption>
                {images[lightboxIndex].title ||
                  images[lightboxIndex].description ||
                  images[lightboxIndex].alt ||
                  images[lightboxIndex].name}
              </figcaption>
            </figure>
            <button
              type="button"
              className="lightbox-next"
              onClick={() =>
                setLightboxIndex((index) => (index + 1) % images.length)
              }
              aria-label="Imagen siguiente"
            >
              ›
            </button>
          </div>
        )}
        <footer className="developer-credit">
          <div className="developer-credit-inner">
            <div>
              <p className="developer-credit-kicker">Créditos Desarrollo</p>
              <p className="developer-credit-title">Full Stack Developer</p>
              <strong>{DEVELOPER_PROFILE.name}</strong>
            </div>
            <nav
              className="developer-links"
              aria-label="Enlaces del desarrollador"
            >
              {DEVELOPER_PROFILE.links.map(({ label, href }) => (
                <a
                  href={href}
                  key={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </div>
      {pageLinks.length > 0 && (
        <>
          <button
            type="button"
            className={`infographic-toc-backdrop ${mobileNavOpen ? "infographic-toc-backdrop-visible" : ""}`}
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar navegación"
            aria-hidden={!mobileNavOpen}
            tabIndex={mobileNavOpen ? 0 : -1}
          />
          <button
            type="button"
            className="infographic-menu-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-expanded={mobileNavOpen}
            aria-controls="project-section-navigation"
          >
            <span aria-hidden="true">☰</span> Secciones
          </button>
        </>
      )}
    </>
  );
}

function App() {
  const [activePage, setActivePage] = useState("home");
  const [routeHash, setRouteHash] = useState(() => window.location.hash);
  const [project, setProject] = useState(createEmptyProject);
  const [pdfFile, setPdfFile] = useState(null);
  const [imageFiles, setImageFiles] = useState({});
  const [progress, setProgress] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingCancelled, setProcessingCancelled] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageProgress, setImageProgress] = useState(null);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [qrCaption, setQrCaption] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [videoDraft, setVideoDraft] = useState({
    title: "",
    description: "",
    url: "",
    section: "",
    order: "",
  });
  const cancelRef = useRef(false);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const publicUrl = useMemo(
    () => buildPagesUrl(owner, repository),
    [owner, repository],
  );
  const pendingCount = useMemo(() => {
    let count = project.sections.filter(
      (section) => section.content.trim().length === 0,
    ).length;
    if (!project.title.trim()) count += 1;
    if (!project.institution.trim()) count += 1;
    return count;
  }, [project]);
  const validationErrors = useMemo(() => validateProject(project), [project]);
  const isClientView = isPublicViewHash(routeHash);

  useEffect(() => {
    const syncHash = () => setRouteHash(window.location.hash);
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!publicUrl) {
      setQrImage("");
      return;
    }
    let current = true;
    import("./utils/qr")
      .then(({ makeQrDataUrl }) => makeQrDataUrl(publicUrl))
      .then((image) => {
        if (current) setQrImage(image);
      })
      .catch((qrError) => {
        if (current) setError(qrError.message);
      });
    return () => {
      current = false;
    };
  }, [publicUrl]);

  const updateProject = (updater) => {
    setProject((current) => {
      const next =
        typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater };
      return {
        ...next,
        updatedAt: new Date().toISOString(),
        extraction: {
          ...next.extraction,
          reviewed: false,
          pendingReview: true,
        },
      };
    });
    setApproved(false);
  };

  const processFile = async (file) => {
    if (!file || processing) return;
    setError("");
    if (
      !(
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      )
    ) {
      setError("El archivo debe ser un PDF.");
      return;
    }
    if (file.size === 0 || file.size > MAX_PDF_SIZE) {
      setError(
        file.size === 0
          ? "El archivo está vacío."
          : "El PDF supera el límite de 50 MB.",
      );
      return;
    }
    setPdfFile(file);
    setProcessing(true);
    setProcessingCancelled(false);
    setProgress({ page: 0, total: 0, phase: "loading" });
    cancelRef.current = false;
    try {
      const { processPdf } = await import("./utils/pdfProcessor");
      const result = await processPdf(file, {
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
      });
      if (cancelRef.current) return;
      const extracted = extractProjectFromText(
        result.pages
          .map((page) => page.text)
          .filter(Boolean)
          .join("\n"),
        file.name,
        result.pageCount,
        result.ocrPages,
      );
      extracted.extraction.pendingReview = true;
      const json = `${JSON.stringify(extracted, null, 2)}\n`;
      downloadBlob(
        new Blob([json], { type: "application/json" }),
        extractedJsonFilename(file.name, extracted.projectId),
      );
      setProject(extracted);
      setApproved(false);
      setActivePage("editor");
    } catch (processingError) {
      if (processingError.name === "PdfProcessingCancelledError")
        setProcessingCancelled(true);
      else setError(processingError.message);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleImageFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    const validationMessages = validateImageFiles(files);
    const validFiles = files.filter(
      (file) => !validateImageFiles([file]).length,
    );
    if (validationMessages.length) setError(validationMessages.join(" "));
    if (!validFiles.length) {
      event.target.value = "";
      return;
    }
    try {
      const additions = await Promise.all(
        validFiles.map(async (file, index) => {
          const id = uniqueMediaId("image");
          const extension =
            file.name.match(/\.(?:jpe?g|png|webp)$/i)?.[0].toLowerCase() || "";
          const baseName =
            file.name
              .slice(0, -extension.length)
              .replace(/[^a-zA-Z0-9_-]/g, "-")
              .replace(/^-+|-+$/g, "") || "imagen";
          const path = `images/proyecto/${id}-${baseName}${extension}`;
          return {
            path,
            file,
            image: {
              id,
              title: file.name,
              description: "",
              visualDescription: "",
              name: file.name,
              alt: "",
              path,
              source: "local",
              section: "",
              order: project.media.length + index + 1,
              featured: false,
              ocrText: "",
              ocrConfidence: null,
              ocrReviewRequired: true,
              ocrReviewed: false,
              ocrClassification: {
                titles: [],
                paragraphs: [],
                dates: [],
                data: [],
              },
              visualReviewRequired: true,
              visualReviewed: false,
            },
            preview: await fileAsDataUrl(file),
          };
        }),
      );
      setImageFiles((current) =>
        Object.fromEntries([
          ...Object.entries(current),
          ...additions.map(({ path, file }) => [path, file]),
        ]),
      );
      updateProject((current) => ({
        ...current,
        media: [
          ...current.media,
          ...additions.map(({ image, preview }) => ({ ...image, preview })),
        ],
      }));
      setImageProcessing(true);
      setImageProgress({ current: 0, total: additions.length });
      try {
        const analysis = await analyzeImageFiles(validFiles, {
          onProgress: (progressEvent) =>
            setImageProgress((current) => ({ ...current, ...progressEvent })),
        });
        const results = new Map(
          additions.map(({ image }, index) => [image.id, analysis[index]]),
        );
        updateProject((current) => ({
          ...current,
          media: current.media.map((image) =>
            results.has(image.id)
              ? { ...image, ...results.get(image.id) }
              : image,
          ),
        }));
      } catch (ocrError) {
        setError(
          `Las imágenes se añadieron, pero el OCR no se completó: ${ocrError.message}`,
        );
      } finally {
        setImageProcessing(false);
        setImageProgress(null);
      }
    } catch (imageError) {
      setError(imageError.message);
    } finally {
      event.target.value = "";
    }
  };

  const removeImage = (imagePath) => {
    updateProject((current) => ({
      ...current,
      media: current.media.filter((item) => item.path !== imagePath),
    }));
    setImageFiles((current) => {
      const next = { ...current };
      delete next[imagePath];
      return next;
    });
  };

  const replaceImageFile = async (imageKey, event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    const validationErrors = validateImageFiles([file]);
    if (validationErrors.length) {
      setError(validationErrors.join(" "));
      return;
    }

    const image = project.media.find(
      (item) => (item.id || item.path) === imageKey,
    );
    if (!image) {
      setError("No se encontró la imagen que deseas reemplazar.");
      return;
    }
    try {
      const extension = file.name
        .match(/\.(?:jpe?g|png|webp)$/i)?.[0]
        .toLowerCase();
      const baseName =
        file.name
          .slice(0, -extension.length)
          .replace(/[^a-zA-Z0-9_-]/g, "-")
          .replace(/^-+|-+$/g, "") || "imagen";
      const path = `images/proyecto/${image.id || uniqueMediaId("image")}-${baseName}${extension}`;
      const preview = await fileAsDataUrl(file);
      setImageFiles((current) => {
        const next = { ...current };
        delete next[image.path];
        next[path] = file;
        return next;
      });
      updateProject((current) => ({
        ...current,
        media: current.media.map((item) =>
          (item.id || item.path) === imageKey
            ? {
                ...item,
                name: file.name,
                path,
                source: "local",
                preview,
                visualReviewRequired: true,
                visualReviewed: false,
              }
            : item,
        ),
      }));
    } catch (replacementError) {
      setError(`No se pudo reemplazar la imagen: ${replacementError.message}`);
    }
  };

  const exportJson = () => {
    if (!approved || validationErrors.length) return;
    import("./utils/siteBundle")
      .then(({ createJsonZip }) =>
        createJsonZip(project, imageFiles, { hideEmptySections: hideEmpty }),
      )
      .then((zip) => downloadBlob(zip, `${project.projectId}-datos-json.zip`))
      .catch((zipError) =>
        setError(`No se pudieron exportar los JSON: ${zipError.message}`),
      );
  };

  const exportZip = async () => {
    if (!approved || validationErrors.length) return;
    setError("");
    try {
      const { createSiteZip } = await import("./utils/siteBundle");
      const zip = await createSiteZip(
        project,
        imageFiles,
        includeOriginal ? pdfFile : null,
        { hideEmptySections: hideEmpty },
      );
      downloadBlob(
        zip,
        `${project.projectId || "proyecto-escolar"}-publicacion.zip`,
      );
    } catch (zipError) {
      setError(`No se pudo crear el ZIP: ${zipError.message}`);
    }
  };

  const downloadPng = () => {
    if (!qrImage) return;
    const link = document.createElement("a");
    link.href = qrImage;
    link.download = "codigo-qr-proyecto.png";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "No se pudo copiar automáticamente. Selecciona y copia el enlace manualmente.",
      );
    }
  };

  const exportQrPdf = async () => {
    try {
      const { downloadQrPdf } = await import("./utils/qr");
      await downloadQrPdf(publicUrl, qrCaption);
    } catch (qrError) {
      setError(qrError.message);
    }
  };

  const addVideo = () => {
    const parsed = parseYouTubeUrl(videoDraft.url);
    if (!videoDraft.title.trim()) {
      setError("Escribe un título para el video.");
      return;
    }
    if (!parsed) {
      setError("La URL no es un enlace HTTPS válido de YouTube.");
      return;
    }
    const order =
      Number.parseInt(videoDraft.order, 10) || project.videos.length + 1;
    updateProject((current) => ({
      ...current,
      videos: [
        ...current.videos,
        {
          id: uniqueMediaId("video"),
          title: videoDraft.title.trim(),
          description: videoDraft.description.trim(),
          platform: "youtube",
          url: parsed.url,
          videoId: parsed.videoId,
          embedUrl: parsed.embedUrl,
          section: videoDraft.section,
          order: Math.max(1, order),
        },
      ].sort((a, b) => a.order - b.order),
    }));
    setVideoDraft({
      title: "",
      description: "",
      url: "",
      section: "",
      order: "",
    });
    setError("");
  };

  const renderHome = () => (
    <>
      <PageHeader
        eyebrow="Espacio de trabajo"
        title="Publica un proyecto escolar"
        description="Convierte un PDF en una página accesible, revisada y lista para compartir."
      />
      <Surface as="section" variant="hero" className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-icon">
            <Icon name="spark" size={18} />
          </span>
          <p className="eyebrow">De documento a experiencia web</p>
          <h2>Un proyecto escolar, listo para compartir.</h2>
          <p>
            Extrae, organiza y revisa el contenido de tu documento antes de
            publicarlo como un sitio estático con su propio código QR.
          </p>
          <ActionButton
            variant="light"
            onClick={() => inputRef.current?.click()}
          >
            Importar un PDF <span aria-hidden="true">→</span>
          </ActionButton>
        </div>
        <div className="welcome-orbit" aria-hidden="true">
          <div className="orbit-shape">
            <span />
            <span />
            <span />
          </div>
          <div className="orbit-center">a.</div>
        </div>
      </Surface>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => processFile(event.target.files?.[0])}
      />
      <div className="stats-grid">
        <Surface as="article" variant="stat" className="stat-card">
          <span>01</span>
          <strong>{project.extraction.pageCount || "—"}</strong>
          <p>Páginas procesadas</p>
        </Surface>
        <Surface as="article" variant="stat" className="stat-card">
          <span>02</span>
          <strong>
            {project.sections.filter((item) => item.content).length}
          </strong>
          <p>Secciones con contenido</p>
        </Surface>
        <Surface as="article" variant="stat" className="stat-card">
          <span>03</span>
          <strong>{project.media.length}</strong>
          <p>Imágenes añadidas</p>
        </Surface>
        <Surface as="article" variant="stat" className="stat-card">
          <span>04</span>
          <strong>{pendingCount}</strong>
          <p>Datos por revisar</p>
        </Surface>
      </div>
      <section className="steps-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Flujo de trabajo</p>
            <h2>Del PDF a tu página pública</h2>
          </div>
        </div>
        <div className="steps-grid">
          {[
            ["01", "Importa", "Procesa el PDF en tu navegador."],
            ["02", "Revisa", "Corrige cada dato antes de publicarlo."],
            [
              "03",
              "Exporta",
              "Descarga la página y publícala en GitHub Pages.",
            ],
          ].map(([number, title, text]) => (
            <Surface
              as="article"
              variant="card"
              className="step-card"
              key={number}
            >
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Surface>
          ))}
        </div>
      </section>
      <Notice tone="warning">
        GitHub Pages es público y no ofrece autenticación de administrador. No
        publiques información confidencial ni datos personales sin autorización.
      </Notice>
    </>
  );

  const renderImport = () => (
    <>
      <PageHeader
        eyebrow="Procesamiento local"
        title="Importa tu documento"
        description="El texto se extrae en tu dispositivo. El OCR solo se ejecuta en páginas sin suficiente texto seleccionable."
      />
      <section
        className={`drop-zone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          processFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => processFile(event.target.files?.[0])}
        />
        <span className="upload-icon">↑</span>
        <h2>Arrastra aquí tu PDF</h2>
        <p>o selecciona un archivo desde tu dispositivo</p>
        <ActionButton
          loading={processing}
          onClick={() => inputRef.current?.click()}
        >
          {processing ? "Procesando…" : "Elegir documento"}
        </ActionButton>
        <small>PDF · máximo 50 MB · procesa texto y OCR localmente</small>
      </section>
      {pdfFile && (
        <div className="file-card">
          <div className="file-icon">PDF</div>
          <div>
            <strong>{pdfFile.name}</strong>
            <p>
              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {project.extraction.pageCount || "páginas por detectar"}
            </p>
          </div>
          <span
            className={`status-pill ${processing ? "status-running" : processingCancelled ? "status-running" : "status-ready"}`}
          >
            {processing
              ? "Procesando"
              : processingCancelled
                ? "Cancelado"
                : "Listo"}
          </span>
        </div>
      )}
      {processing && (
        <section className="progress-card">
          <div className="progress-top">
            <strong>
              {progress?.phase === "ocr"
                ? "Reconociendo texto con OCR…"
                : "Extrayendo texto…"}
            </strong>
            <span>
              {progress?.page
                ? `Página ${progress.page} de ${progress.total}`
                : "Preparando documento"}
            </span>
          </div>
          <div className="progress-track">
            <div
              style={{
                width: progress?.total
                  ? `${Math.max(3, (progress.page / progress.total) * 100)}%`
                  : "4%",
              }}
            />
          </div>
          <div className="progress-bottom">
            <span>
              {progress?.status || "El archivo permanece en este dispositivo."}
            </span>
            <button
              className="button button-quiet"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancelar proceso
            </button>
          </div>
        </section>
      )}
      {project.extraction.pageCount > 0 && !processing && (
        <Notice tone="success">
          Extracción completada en {project.extraction.pageCount} páginas. OCR
          aplicado en {project.extraction.ocrPages.length} páginas. Se descargó{" "}
          {project.projectId}.json; si lo necesitas en <code>documents</code>,
          muévelo allí desde la carpeta de descargas.
        </Notice>
      )}
      <Notice>
        PDF.js y Tesseract se ejecutan en el navegador. El motor y los datos de
        idioma de OCR pueden descargarse desde una CDN; el documento no se envía
        a ningún servidor.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderEditor = () => (
    <>
      <PageHeader
        eyebrow="Revisión editorial"
        title="Editor de información"
        description="Verifica y corrige el texto detectado. Los campos vacíos quedan pendientes: no se completa contenido automáticamente."
      />
      {project.extraction.pageCount > 0 && (
        <Notice tone="success">
          Extracción completada en {project.extraction.pageCount} páginas. Se
          descargó{" "}
          {extractedJsonFilename(
            project.extraction.sourceFileName,
            project.projectId,
          )}
          ; si lo necesitas en <code>documents</code>, muévelo allí desde la
          carpeta de descargas.
        </Notice>
      )}
      {project.extraction.sourceFileName && (
        <Notice tone="warning">
          Detectado desde {project.extraction.sourceFileName}. Confirma nombres,
          referencias y contenido antes de exportar.
        </Notice>
      )}
      {pendingCount > 0 && (
        <Notice tone="warning">
          Hay {pendingCount} campos o secciones vacíos. Puedes completarlos o
          publicarlos ocultos.
        </Notice>
      )}
      <div className="editor-layout">
        {project.tables.length > 0 && (
          <section className="editor-card">
            <div className="editor-card-heading">
              <div>
                <p className="eyebrow">Datos tabulares</p>
                <h2>Tablas recuperadas del PDF</h2>
              </div>
            </div>
            <p className="muted-copy">
              Revisa y corrige las celdas. La separación de columnas se infiere
              de las posiciones del texto en el PDF.
            </p>
            {project.tables.map((table, tableIndex) => (
              <div className="table-edit" key={table.id}>
                <label>
                  Título de la tabla
                  <input
                    value={table.title}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        tables: current.tables.map((item, index) =>
                          index === tableIndex
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                {table.rows.map((row, rowIndex) => (
                  <div className="table-edit-row" key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <label key={cellIndex}>
                        Fila {rowIndex + 1} · Columna {cellIndex + 1}
                        <input
                          value={cell}
                          onChange={(event) =>
                            updateProject((current) => ({
                              ...current,
                              tables: current.tables.map((item, itemIndex) =>
                                itemIndex === tableIndex
                                  ? {
                                      ...item,
                                      rows: item.rows.map(
                                        (cells, rowItemIndex) =>
                                          rowItemIndex === rowIndex
                                            ? cells.map(
                                                (value, cellItemIndex) =>
                                                  cellItemIndex === cellIndex
                                                    ? event.target.value
                                                    : value,
                                              )
                                            : cells,
                                      ),
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}
        <section className="editor-card">
          <div className="editor-card-heading">
            <div>
              <p className="eyebrow">Datos principales</p>
              <h2>Identificación del proyecto</h2>
            </div>
            <span className="review-dot">
              {project.extraction.reviewed ? "Revisado" : "Revisión pendiente"}
            </span>
          </div>
          <label>
            Título del proyecto
            <input
              value={project.title}
              onChange={(event) => updateProject({ title: event.target.value })}
              placeholder="Título tal como aparece en el documento"
            />
          </label>
          <label>
            Descripción
            <textarea
              rows="3"
              value={project.description}
              onChange={(event) =>
                updateProject({ description: event.target.value })
              }
              placeholder="Descripción extraída o revisada"
            />
          </label>
          <label>
            Institución educativa
            <input
              value={project.institution}
              onChange={(event) =>
                updateProject({ institution: event.target.value })
              }
              placeholder="Nombre de la institución"
            />
          </label>
          <label>
            Resumen
            <textarea
              rows="4"
              value={project.summary}
              onChange={(event) =>
                updateProject({ summary: event.target.value })
              }
              placeholder="Resumen del proyecto"
            />
          </label>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading">
            <div>
              <p className="eyebrow">Equipo</p>
              <h2>Autores e integrantes</h2>
            </div>
          </div>
          {project.authors.map((author, index) => (
            <div className="repeat-row" key={author.id}>
              <label className="grow">
                Nombre
                <input
                  value={author.name}
                  onChange={(event) =>
                    updateProject((current) => ({
                      ...current,
                      authors: current.authors.map((person, personIndex) =>
                        personIndex === index
                          ? { ...person, name: event.target.value }
                          : person,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Rol opcional
                <input
                  value={author.role}
                  onChange={(event) =>
                    updateProject((current) => ({
                      ...current,
                      authors: current.authors.map((person, personIndex) =>
                        personIndex === index
                          ? { ...person, role: event.target.value }
                          : person,
                      ),
                    }))
                  }
                />
              </label>
              <button
                className="icon-button remove-button"
                aria-label="Eliminar integrante"
                onClick={() =>
                  updateProject((current) => ({
                    ...current,
                    authors: current.authors.filter(
                      (_, personIndex) => personIndex !== index,
                    ),
                  }))
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="button button-outline"
            onClick={() =>
              updateProject((current) => ({
                ...current,
                authors: [
                  ...current.authors,
                  { id: `integrante-${Date.now()}`, name: "", role: "" },
                ],
              }))
            }
          >
            ＋ Añadir integrante
          </button>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading">
            <div>
              <p className="eyebrow">Objetivos</p>
              <h2>Objetivo general y específicos</h2>
            </div>
          </div>
          <label>
            Objetivo general
            <textarea
              rows="3"
              value={project.objectives.general}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  objectives: {
                    ...current.objectives,
                    general: event.target.value,
                  },
                }))
              }
              placeholder="Objetivo general"
            />
          </label>
          {project.objectives.specific.map((objective, index) => (
            <div className="repeat-row" key={index}>
              <label className="grow">
                Objetivo específico {index + 1}
                <textarea
                  rows="2"
                  value={objective}
                  onChange={(event) =>
                    updateProject((current) => ({
                      ...current,
                      objectives: {
                        ...current.objectives,
                        specific: current.objectives.specific.map(
                          (item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                        ),
                      },
                    }))
                  }
                />
              </label>
              <button
                className="icon-button remove-button"
                aria-label={`Eliminar objetivo ${index + 1}`}
                onClick={() =>
                  updateProject((current) => ({
                    ...current,
                    objectives: {
                      ...current.objectives,
                      specific: current.objectives.specific.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    },
                  }))
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="button button-outline"
            onClick={() =>
              updateProject((current) => ({
                ...current,
                objectives: {
                  ...current.objectives,
                  specific: [...current.objectives.specific, ""],
                },
              }))
            }
          >
            ＋ Añadir objetivo
          </button>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading">
            <div>
              <p className="eyebrow">Contenido</p>
              <h2>Secciones del proyecto</h2>
            </div>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(event) => setHideEmpty(event.target.checked)}
              />{" "}
              Ocultar vacías
            </label>
          </div>
          {project.sections.map((section, index) => (
            <label
              className={`section-field ${!section.content.trim() ? "section-pending" : ""}`}
              key={section.id}
            >
              <span className="field-title">
                {section.title}
                {!section.content.trim() && (
                  <small>Pendiente de revisión</small>
                )}
              </span>
              <textarea
                rows="5"
                value={section.content}
                onChange={(event) =>
                  updateProject((current) => ({
                    ...current,
                    sections: current.sections.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            content: event.target.value,
                            pendingReview: !event.target.value.trim(),
                          }
                        : item,
                    ),
                  }))
                }
                placeholder={`Contenido de ${section.title.toLowerCase()}`}
              />
            </label>
          ))}
          <label>
            Conclusiones <small>Una por línea</small>
            <textarea
              rows="4"
              value={project.conclusions.join("\n")}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  conclusions: event.target.value.split("\n"),
                }))
              }
              placeholder="Conclusiones"
            />
          </label>
          <label>
            Recomendaciones <small>Una por línea</small>
            <textarea
              rows="4"
              value={project.recommendations.join("\n")}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  recommendations: event.target.value.split("\n"),
                }))
              }
              placeholder="Recomendaciones"
            />
          </label>
          <label>
            Bibliografía y referencias <small>Una referencia por línea</small>
            <textarea
              rows="5"
              value={project.references.join("\n")}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  references: event.target.value.split("\n"),
                }))
              }
              placeholder="Referencias bibliográficas"
            />
          </label>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading">
            <div>
              <p className="eyebrow">Recursos</p>
              <h2>Imágenes y fotografías</h2>
            </div>
          </div>
          <p className="muted-copy">
            PDF.js no extrae automáticamente los archivos de imagen del PDF.
            Añade manualmente las imágenes que tengas permiso para publicar.
          </p>
          <input
            ref={imageInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleImageFiles}
          />
          <button
            className="button button-outline"
            onClick={() => imageInputRef.current?.click()}
          >
            ＋ Añadir imágenes
          </button>
          {project.media.length > 0 && (
            <div className="media-list">
              {project.media.map((image) => (
                <div className="media-row" key={image.path}>
                  <img src={image.preview} alt="" />
                  <label className="grow">
                    Texto alternativo
                    <input
                      value={image.alt}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          media: current.media.map((item) =>
                            item.path === image.path
                              ? { ...item, alt: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      placeholder={image.name}
                    />
                  </label>
                  <button
                    className="icon-button remove-button"
                    aria-label={`Eliminar imagen ${image.name}`}
                    onClick={() => removeImage(image.path)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );

  const updateImage = (imageKey, changes) =>
    updateProject((current) => ({
      ...current,
      media: current.media.map((image) =>
        (image.id || image.path) === imageKey
          ? { ...image, ...changes }
          : image,
      ),
    }));

  const moveImage = (imageKey, offset) =>
    updateProject((current) => {
      const images = current.media
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = images.findIndex(
        (image) => (image.id || image.path) === imageKey,
      );
      const target = index + offset;
      if (index < 0 || target < 0 || target >= images.length) return current;
      [images[index], images[target]] = [images[target], images[index]];
      return {
        ...current,
        media: images.map((image, imageIndex) => ({
          ...image,
          order: imageIndex + 1,
        })),
      };
    });

  const renderImages = () => (
    <>
      <PageHeader
        eyebrow="Imágenes del proyecto"
        title="Importa y revisa tus imágenes"
        description="Carga varias imágenes a la vez. Tesseract reconoce texto; las descripciones visuales requieren revisión y edición humana."
      />
      <section
        className={`drop-zone image-drop-zone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleImageFiles({
            target: { files: event.dataTransfer.files, value: "" },
          });
        }}
      >
        <input
          ref={imageInputRef}
          className="visually-hidden"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple
          aria-label="Seleccionar varias imágenes"
          onChange={handleImageFiles}
        />
        <span className="upload-icon">▧</span>
        <h2>Arrastra aquí tus imágenes</h2>
        <p>
          Selecciona una o varias fotografías para analizarlas en este
          dispositivo.
        </p>
        <ActionButton
          loading={imageProcessing}
          onClick={() => imageInputRef.current?.click()}
        >
          {imageProcessing ? "Analizando…" : "Elegir imágenes"}
        </ActionButton>
        <small>JPG, PNG o WEBP · hasta 10 MB por imagen</small>
      </section>
      {imageProcessing && (
        <section className="progress-card" role="status">
          <div className="progress-top">
            <strong>Reconociendo texto con Tesseract.js…</strong>
            <span>
              {imageProgress?.current || 0} de{" "}
              {imageProgress?.total || project.media.length}
            </span>
          </div>
          <div className="progress-track">
            <div
              style={{
                width: imageProgress?.total
                  ? `${Math.max(3, ((imageProgress.current || 0) / imageProgress.total) * 100)}%`
                  : "4%",
              }}
            />
          </div>
          <div className="progress-bottom">
            <span>
              {imageProgress?.status ||
                "Solo OCR; no se realiza reconocimiento visual de diagramas o gráficos."}
            </span>
          </div>
        </section>
      )}
      <section className="editor-card">
        <div className="editor-card-heading">
          <div>
            <p className="eyebrow">Origen de publicación</p>
            <h2>GitHub Pages o GitHub Raw</h2>
          </div>
        </div>
        <label>
          Origen de los archivos JSON
          <select
            value={project.resourceConfig?.mode || "local"}
            onChange={(event) =>
              updateProject((current) => ({
                ...current,
                resourceConfig: {
                  ...(current.resourceConfig || {}),
                  mode: event.target.value,
                },
              }))
            }
          >
            <option value="local">Local · incluido en GitHub Pages</option>
            <option value="github-raw">
              GitHub Raw · JSON desde repositorio público
            </option>
          </select>
        </label>
        <label>
          URL base de GitHub Raw
          <input
            value={project.resourceConfig?.rawBaseUrl || ""}
            onChange={(event) =>
              updateProject((current) => ({
                ...current,
                resourceConfig: {
                  ...(current.resourceConfig || {}),
                  rawBaseUrl: event.target.value,
                },
              }))
            }
            onBlur={() => {
              const rawBaseUrl = project.resourceConfig?.rawBaseUrl || "";
              if (isValidGitHubRawBaseUrl(rawBaseUrl))
                updateProject((current) => ({
                  ...current,
                  resourceConfig: {
                    ...current.resourceConfig,
                    rawBaseUrl: normalizeGitHubRawBaseUrl(rawBaseUrl),
                  },
                }));
            }}
            placeholder="https://raw.githubusercontent.com/usuario/repositorio/main/public/"
            autoComplete="url"
          />
          <small>
            Usa una URL pública que apunte a la carpeta que contiene data/ e
            images/. Requiere HTTPS y raw.githubusercontent.com.
          </small>
        </label>
        <Notice
          tone={
            project.resourceConfig?.mode === "github-raw" &&
            !isValidGitHubRawBaseUrl(project.resourceConfig?.rawBaseUrl)
              ? "warning"
              : "info"
          }
        >
          {project.resourceConfig?.mode === "github-raw"
            ? "El sitio descargará el JSON desde la URL configurada. La carpeta public/ no se agrega dos veces a la URL."
            : "El origen local es el predeterminado: las rutas relativas funcionan dentro de subdirectorios de GitHub Pages."}
        </Notice>
      </section>
      <section className="editor-card">
        <div className="editor-card-heading">
          <div>
            <p className="eyebrow">Galería y OCR</p>
            <h2>{project.media.length} imágenes</h2>
          </div>
        </div>
        {project.media.length === 0 && (
          <p className="empty-state">Aún no has añadido imágenes.</p>
        )}
        <div className="image-editor-list">
          {project.media
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((image, index) => {
              const imageKey = image.id || image.path;
              const preview =
                image.preview ||
                (isValidExternalImageUrl(image.path)
                  ? image.path
                  : image.source === "github-raw" &&
                      isValidGitHubRawBaseUrl(
                        project.resourceConfig?.rawBaseUrl,
                      )
                    ? resolveRawResourceUrl(
                        project.resourceConfig.rawBaseUrl,
                        image.path,
                      )
                    : "");
              return (
                <article className="image-editor-card" key={imageKey}>
                  {preview ? (
                    <img
                      className="image-editor-preview"
                      src={preview}
                      alt={image.alt || image.title || image.name}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="image-editor-placeholder"
                      aria-hidden="true"
                    >
                      IMG
                    </div>
                  )}
                  <div className="image-editor-fields">
                    <div className="image-editor-heading">
                      <strong>
                        {image.ocrReviewRequired
                          ? "OCR pendiente de revisión"
                          : "OCR listo para revisar"}{" "}
                        ·{" "}
                        {image.visualReviewRequired
                          ? "revisión visual pendiente"
                          : "revisión visual completada"}
                      </strong>
                      <span>{image.name}</span>
                    </div>
                    <div className="media-fields-grid">
                      <label>
                        Título
                        <input
                          value={image.title || ""}
                          onChange={(event) =>
                            updateImage(imageKey, { title: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Texto alternativo
                        <input
                          value={image.alt || ""}
                          onChange={(event) =>
                            updateImage(imageKey, { alt: event.target.value })
                          }
                          placeholder="Describe la imagen para accesibilidad"
                        />
                      </label>
                      <label>
                        Descripción visual revisada por el usuario
                        <textarea
                          rows="2"
                          value={image.visualDescription || ""}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              visualDescription: event.target.value,
                              description: event.target.value,
                            })
                          }
                          placeholder="Añade solo una descripción que hayas comprobado visualmente"
                        />
                      </label>
                      <label>
                        Descripción publicada
                        <textarea
                          rows="2"
                          value={image.description || ""}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Descripción revisada"
                        />
                      </label>
                      <label>
                        Reemplazar imagen (conserva el OCR)
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                          aria-label={`Reemplazar imagen ${image.title || image.name} (conserva el OCR)`}
                          onChange={(event) =>
                            replaceImageFile(imageKey, event)
                          }
                        />
                      </label>
                      <label>
                        Texto reconocido por OCR
                        <textarea
                          rows="4"
                          value={image.ocrText || ""}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              ocrText: event.target.value,
                              ocrReviewed: false,
                              ocrReviewRequired:
                                !event.target.value.trim() ||
                                (image.ocrConfidence ?? 0) < 75,
                            })
                          }
                          placeholder="El texto OCR aparecerá aquí; edítalo tras revisarlo"
                        />
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={Boolean(image.ocrReviewed)}
                          disabled={!image.ocrText?.trim()}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              ocrReviewed: event.target.checked,
                              ocrReviewRequired:
                                !event.target.checked || !image.ocrText?.trim(),
                            })
                          }
                        />{" "}
                        Confirmo que revisé el texto OCR
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={Boolean(image.visualReviewed)}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              visualReviewed: event.target.checked,
                              visualReviewRequired: !event.target.checked,
                            })
                          }
                        />{" "}
                        Confirmo que revisé la imagen visualmente
                      </label>
                      <div className="ocr-summary">
                        <strong>Resultado OCR</strong>
                        <span>
                          {image.ocrConfidence === null ||
                          image.ocrConfidence === undefined
                            ? "Sin confianza disponible"
                            : `Confianza: ${Math.round(image.ocrConfidence)}%`}
                        </span>
                        {Object.entries(image.ocrClassification || {}).map(
                          ([category, lines]) =>
                            lines?.length > 0 && (
                              <small key={category}>
                                <b>
                                  {{
                                    titles: "Posibles títulos",
                                    paragraphs: "Párrafos",
                                    dates: "Fechas",
                                    data: "Líneas con datos o números",
                                  }[category] || category}
                                  :
                                </b>{" "}
                                {lines.join(" · ")}
                              </small>
                            ),
                        )}
                        <small>
                          La clasificación de líneas usa únicamente el texto
                          OCR. Diagramas, gráficos y otros elementos visuales
                          quedan pendientes de revisión manual.
                        </small>
                      </div>
                      <label>
                        Sección asociada
                        <select
                          value={image.section || ""}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              section: event.target.value,
                            })
                          }
                        >
                          <option value="">Sin sección</option>
                          {project.sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Orden
                        <input
                          type="number"
                          min="1"
                          value={image.order || index + 1}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              order: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={Boolean(image.featured)}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              featured: event.target.checked,
                            })
                          }
                        />{" "}
                        Destacar imagen
                      </label>
                      <label>
                        Origen de la imagen
                        <select
                          value={image.source || "local"}
                          onChange={(event) =>
                            updateImage(imageKey, {
                              source: event.target.value,
                            })
                          }
                        >
                          <option value="local">Local · agregar al ZIP</option>
                          <option value="github-raw">
                            GitHub Raw · ruta relativa a la URL base
                          </option>
                          <option value="external">
                            URL HTTPS de imagen pública
                          </option>
                        </select>
                      </label>
                      {image.source === "external" && (
                        <label>
                          URL HTTPS de imagen
                          <input
                            type="url"
                            value={image.path}
                            onChange={(event) =>
                              updateImage(imageKey, {
                                path: event.target.value,
                              })
                            }
                            placeholder="https://sitio.example/imagen.jpg"
                          />
                          <small>
                            Usa una URL HTTPS pública de imagen. Se admiten
                            enlaces de CDN sin extensión de archivo.
                          </small>
                        </label>
                      )}
                      {image.source === "github-raw" && (
                        <label>
                          Ruta relativa en GitHub Raw
                          <input
                            value={image.path}
                            onChange={(event) =>
                              updateImage(imageKey, {
                                path: event.target.value,
                              })
                            }
                            placeholder="images/proyecto/imagen.jpg"
                          />
                        </label>
                      )}
                    </div>
                    <div className="image-editor-actions">
                      <button
                        className="button button-quiet"
                        disabled={index === 0}
                        onClick={() => moveImage(imageKey, -1)}
                      >
                        Subir
                      </button>
                      <button
                        className="button button-quiet"
                        disabled={index === project.media.length - 1}
                        onClick={() => moveImage(imageKey, 1)}
                      >
                        Bajar
                      </button>
                      <button
                        className="icon-button remove-button"
                        aria-label={`Eliminar imagen ${image.title || image.name}`}
                        onClick={() => removeImage(image.path)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
        </div>
      </section>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderVideos = () => (
    <>
      <PageHeader
        eyebrow="Videos del proyecto"
        title="Administra videos de YouTube"
        description="Agrega enlaces HTTPS de YouTube. El identificador y la URL de privacidad mejorada se validan antes de guardar."
      />
      <section className="editor-card">
        <div className="editor-card-heading">
          <div>
            <p className="eyebrow">Nuevo video</p>
            <h2>Agregar video</h2>
          </div>
        </div>
        <label>
          Título del video
          <input
            value={videoDraft.title}
            onChange={(event) =>
              setVideoDraft((draft) => ({
                ...draft,
                title: event.target.value,
              }))
            }
            placeholder="Título que se mostrará en la página"
          />
        </label>
        <label>
          Descripción
          <textarea
            rows="3"
            value={videoDraft.description}
            onChange={(event) =>
              setVideoDraft((draft) => ({
                ...draft,
                description: event.target.value,
              }))
            }
            placeholder="Descripción opcional"
          />
        </label>
        <label>
          URL original de YouTube
          <input
            value={videoDraft.url}
            onChange={(event) =>
              setVideoDraft((draft) => ({ ...draft, url: event.target.value }))
            }
            placeholder="https://www.youtube.com/watch?v=…"
            inputMode="url"
          />
        </label>
        {videoDraft.url && !parseYouTubeUrl(videoDraft.url) && (
          <p className="field-error" role="alert">
            La URL debe ser un enlace HTTPS válido de youtube.com o youtu.be.
          </p>
        )}
        <div className="media-fields-grid">
          <label>
            Sección relacionada
            <select
              value={videoDraft.section}
              onChange={(event) =>
                setVideoDraft((draft) => ({
                  ...draft,
                  section: event.target.value,
                }))
              }
            >
              <option value="">Sin sección</option>
              {project.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Orden
            <input
              type="number"
              min="1"
              value={videoDraft.order}
              onChange={(event) =>
                setVideoDraft((draft) => ({
                  ...draft,
                  order: event.target.value,
                }))
              }
              placeholder={String(project.videos.length + 1)}
            />
          </label>
        </div>
        <button className="button button-primary" onClick={addVideo}>
          ＋ Guardar video
        </button>
      </section>
      <section className="editor-card">
        <div className="editor-card-heading">
          <div>
            <p className="eyebrow">Vista previa y metadatos</p>
            <h2>{project.videos.length} videos</h2>
          </div>
        </div>
        {project.videos.length === 0 && (
          <p className="empty-state">
            No hay videos. La página pública ocultará esta sección.
          </p>
        )}
        <div className="video-admin-list">
          {project.videos
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((video) => (
              <article className="video-admin-card" key={video.id}>
                <YouTubePlayer video={video} />
                <label>
                  Título
                  <input
                    value={video.title}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        videos: current.videos.map((item) =>
                          item.id === video.id
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    rows="2"
                    value={video.description}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        videos: current.videos.map((item) =>
                          item.id === video.id
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  URL original
                  <input
                    value={video.url}
                    onChange={(event) => {
                      const parsed = parseYouTubeUrl(event.target.value);
                      updateProject((current) => ({
                        ...current,
                        videos: current.videos.map((item) =>
                          item.id === video.id
                            ? {
                                ...item,
                                url: event.target.value,
                                videoId: parsed?.videoId || "",
                                embedUrl: parsed?.embedUrl || "",
                              }
                            : item,
                        ),
                      }));
                    }}
                  />
                </label>
                <div className="media-fields-grid">
                  <label>
                    Sección relacionada
                    <select
                      value={video.section}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          videos: current.videos.map((item) =>
                            item.id === video.id
                              ? { ...item, section: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    >
                      <option value="">Sin sección</option>
                      {project.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Orden
                    <input
                      type="number"
                      min="1"
                      value={video.order}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          videos: current.videos.map((item) =>
                            item.id === video.id
                              ? {
                                  ...item,
                                  order: Math.max(
                                    1,
                                    Number(event.target.value) || 1,
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                {!parseYouTubeUrl(video.url) && (
                  <p className="field-error" role="alert">
                    Corrige la URL del video antes de exportar.
                  </p>
                )}
                <button
                  className="icon-button remove-button"
                  aria-label={`Eliminar video ${video.title}`}
                  onClick={() =>
                    updateProject((current) => ({
                      ...current,
                      videos: current.videos.filter(
                        (item) => item.id !== video.id,
                      ),
                    }))
                  }
                >
                  Eliminar
                </button>
              </article>
            ))}
        </div>
      </section>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderPreview = () => (
    <>
      <PageHeader
        eyebrow="Sitio público"
        title="Vista previa del proyecto"
        description="Así se organizará el contenido en el sitio público exportado."
      />
      <ActionButton
        as="a"
        variant="outline"
        className="client-view-link"
        href={`${import.meta.env.BASE_URL}#/View`}
        target="_blank"
        rel="noreferrer"
      >
        Abrir vista pública
      </ActionButton>
      <PublicPreview project={project} hideEmpty={hideEmpty} />
    </>
  );

  const renderExport = () => (
    <>
      <PageHeader
        eyebrow="Paquete listo para publicar"
        title="Exporta tu proyecto"
        description="Descarga los JSON por separado o crea un ZIP autónomo con sitio público, imágenes e instrucciones."
      />
      <div className="export-grid">
        <Surface as="section" variant="card" className="export-card">
          <div className="export-icon">{"{ }"}</div>
          <h2>Archivos JSON</h2>
          <p>
            Incluye proyecto, integrantes, objetivos, desarrollo, conclusiones y
            referencias, sin duplicar el contenido entre archivos.
          </p>
          <ActionButton
            variant="outline"
            disabled={!approved || validationErrors.length > 0}
            onClick={exportJson}
          >
            Descargar JSON · ZIP
          </ActionButton>
        </Surface>
        <Surface
          as="article"
          variant="featured"
          className="export-card export-featured"
        >
          <div className="export-icon">⇩</div>
          <span className="recommended">RECOMENDADO</span>
          <h2>Sitio completo en ZIP</h2>
          <p>
            Página responsive, carga de JSON por <code>fetch()</code>, imágenes,
            workflow de Pages y guía de publicación.
          </p>
          <ActionButton
            disabled={!approved || validationErrors.length > 0}
            onClick={exportZip}
          >
            Generar ZIP del sitio
          </ActionButton>
        </Surface>
      </div>
      {validationErrors.length > 0 && (
        <Notice tone="danger">
          <strong>No se puede exportar:</strong> {validationErrors.join(" ")}
        </Notice>
      )}
      <section className="approval-card">
        <div className="approval-icon">✓</div>
        <div>
          <h2>Revisión y autorización</h2>
          <p>
            Los archivos de GitHub Pages serán públicos. Revisa nombres, datos
            personales, permisos de publicación y exactitud del contenido.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => {
                const checked = event.target.checked;
                setApproved(checked);
                setProject((current) => ({
                  ...current,
                  updatedAt: new Date().toISOString(),
                  extraction: {
                    ...current.extraction,
                    reviewed: checked,
                    pendingReview: !checked,
                  },
                }));
              }}
            />{" "}
            Confirmo que revisé y autorizo la publicación de este contenido.
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={includeOriginal}
              onChange={(event) => setIncludeOriginal(event.target.checked)}
              disabled={!pdfFile}
            />{" "}
            Incluir el PDF original en el ZIP{" "}
            <span>(no recomendado para documentos con datos personales)</span>
          </label>
        </div>
      </section>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderQr = () => (
    <>
      <PageHeader
        eyebrow="Compartir proyecto"
        title="Tu proyecto, a un escaneo"
        description="El QR se crea a partir de la URL pública final. Configura primero el repositorio de GitHub Pages."
      />
      {!publicUrl && (
        <Notice tone="warning">
          Configura el usuario y el repositorio en la sección Publicación para
          generar el QR definitivo.
        </Notice>
      )}
      <div className="qr-layout">
        <section className="qr-preview-card">
          <div className="qr-image-wrap">
            {qrImage ? (
              <img src={qrImage} alt={`Código QR para ${publicUrl}`} />
            ) : (
              <div className="qr-placeholder">▦</div>
            )}
          </div>
          <h2>{project.title || "Proyecto escolar"}</h2>
          <p>{qrCaption || "Escanea para visitar la página del proyecto."}</p>
          {publicUrl && <code className="url-chip">{publicUrl}</code>}
        </section>
        <section className="editor-card qr-controls">
          <p className="eyebrow">Código descargable</p>
          <h2>Prepara tu QR</h2>
          <label>
            Texto opcional
            <textarea
              rows="3"
              value={qrCaption}
              onChange={(event) => setQrCaption(event.target.value)}
              placeholder="Ej. Escanea para conocer nuestro proyecto"
            />
          </label>
          <div className="qr-actions">
            <button
              className="button button-primary"
              disabled={!qrImage}
              onClick={downloadPng}
            >
              Descargar PNG · 1200 px
            </button>
            <button
              className="button button-outline"
              disabled={!publicUrl}
              onClick={exportQrPdf}
            >
              Descargar PDF imprimible
            </button>
            {publicUrl && (
              <button className="button button-quiet" onClick={copyUrl}>
                {copied ? "Enlace copiado ✓" : "Copiar enlace público"}
              </button>
            )}
          </div>
          <p className="muted-copy">
            Corrección de errores alta y margen de impresión. El QR apunta a la
            página pública, no a este administrador.
          </p>
        </section>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderPublish = () => (
    <>
      <PageHeader
        eyebrow="GitHub Pages"
        title="Configura tu publicación"
        description="El paquete exportado contiene los archivos estáticos y un workflow para publicar desde GitHub Actions."
      />
      <div className="publish-layout">
        <section className="editor-card">
          <p className="eyebrow">URL pública</p>
          <h2>Calcula la dirección del sitio</h2>
          <p className="muted-copy">
            Usa el propietario y el nombre exacto del repositorio donde
            publicarás el ZIP. Para el repositorio especial usuario.github.io,
            el sitio se publica en la raíz.
          </p>
          <div className="publish-fields">
            <label>
              Usuario u organización
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="tu-usuario"
                autoComplete="off"
              />
            </label>
            <label>
              Repositorio
              <input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="proyecto-escolar"
                autoComplete="off"
              />
            </label>
          </div>
          {publicUrl ? (
            <div className="generated-url">
              <span>URL prevista</span>
              <code>{publicUrl}</code>
              <button className="button button-quiet" onClick={copyUrl}>
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
          ) : (
            <p className="validation-hint">
              Escribe un usuario y un nombre de repositorio válidos para crear
              el enlace.
            </p>
          )}
        </section>
        <section className="editor-card">
          <p className="eyebrow">Pasos de despliegue</p>
          <h2>Publica en 4 pasos</h2>
          <ol className="publish-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Descarga el ZIP</strong>
                <p>Desde Exportar archivos, después de aprobar el contenido.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Descomprime en la raíz</strong>
                <p>Incluye el archivo oculto .github/workflows/pages.yml.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Sube los cambios</strong>
                <p>Haz push a la rama principal del repositorio público.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Revisa GitHub Pages</strong>
                <p>En Settings → Pages, selecciona GitHub Actions.</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
      <Notice tone="danger">
        <strong>Hosting estático sin autenticación.</strong> GitHub Pages no
        puede proteger este panel ni restringir el acceso al contenido
        publicado. No almacenes secretos, credenciales ni datos confidenciales
        aquí.
      </Notice>
    </>
  );

  const renderPage = () => {
    switch (activePage) {
      case "import":
        return renderImport();
      case "editor":
        return renderEditor();
      case "images":
        return renderImages();
      case "videos":
        return renderVideos();
      case "preview":
        return renderPreview();
      case "export":
        return renderExport();
      case "qr":
        return renderQr();
      case "publish":
        return renderPublish();
      default:
        return renderHome();
    }
  };

  if (isClientView)
    return <PublicClientView key={routeHash} hash={routeHash} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setActivePage("home")}
          aria-label="Ir al inicio"
        >
          <span className="brand-mark">a.</span>
          <span>
            Aula<small>PROYECTOS ESCOLARES</small>
          </span>
        </button>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav className="main-nav" aria-label="Navegación principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? "nav-active" : ""}`}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => setActivePage(item.id)}
            >
              <span className="nav-icon">
                <Icon name={item.id} size={19} />
              </span>
              {item.label}
              {item.id === "editor" && pendingCount > 0 && (
                <span className="nav-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span /> Procesamiento local
          </div>
          <p>Tus documentos se quedan en este dispositivo.</p>
          <span className="version-label">AULA · BETA 1.0</span>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Proyectos</span>
            <b>/</b>
            <strong>
              {navigation.find((item) => item.id === activePage)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="privacy-chip">
              <Icon name="privacy" size={15} />{" "}
              <span>Solo en este dispositivo</span>
            </span>
            <div className="avatar">A</div>
          </div>
        </header>
        <div className="mobile-brand">
          <span className="brand-mark">a.</span>
          <span>Aula</span>
        </div>
        <div className="content-area">
          <div key={activePage} className="page-transition">
            {renderPage()}
          </div>
        </div>
      </main>
      {error &&
        !["import", "images", "videos", "export", "qr"].includes(
          activePage,
        ) && (
          <div className="toast-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        )}
    </div>
  );
}

export default App;
