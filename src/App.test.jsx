import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import App from "./App";
import { processPdf } from "./utils/pdfProcessor";
import { createEmptyProject, createProjectFiles } from "./utils/projectData";
import { analyzeImageFiles } from "./utils/multimedia";
import { makeQrDataUrl } from "./utils/qr";

vi.mock("./utils/multimedia", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, analyzeImageFiles: vi.fn() };
});

vi.mock("./utils/pdfProcessor", () => ({
  processPdf: vi.fn(),
}));

vi.mock("./utils/qr", () => ({
  makeQrDataUrl: vi.fn(async () => "data:image/png;base64,qr"),
  downloadQrPdf: vi.fn(),
}));

beforeEach(() => {
  processPdf.mockReset();
  analyzeImageFiles.mockReset();
});

afterEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("shows the project dashboard and administrative sections", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /publica un proyecto escolar/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: /navegación principal/i }),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("navigation", { name: /navegación principal/i }),
    ).getByRole("button", { name: /importar pdf/i }),
  ).toBeInTheDocument();
});

test("navigates to PDF import", () => {
  render(<App />);
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: /navegación principal/i }),
    ).getByRole("button", { name: /importar pdf/i }),
  );
  expect(document.querySelector(".infographic-videos")).toBeNull();
  expect(
    screen.getByRole("heading", { name: /importa tu documento/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/OCR solo se ejecuta en páginas/i),
  ).toBeInTheDocument();
});

test("downloads the extracted project as a JSON file", async () => {
  const NativeURL = URL;
  const createObjectURL = vi.fn(() => "blob:project-json");
  vi.stubGlobal(
    "URL",
    Object.assign(class extends NativeURL {}, {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    }),
  );
  const downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function click() {
      downloads.push(this.download);
    },
  );
  processPdf.mockResolvedValue({
    pages: [
      {
        text: "Título: Proyecto de prueba\nInstitución: Escuela\nIntroducción\nTexto de prueba.",
      },
    ],
    pageCount: 1,
    ocrPages: [],
  });

  render(<App />);
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: /navegación principal/i }),
    ).getByRole("button", { name: /importar pdf/i }),
  );
  const input = document.querySelector(
    'input[type="file"][accept="application/pdf,.pdf"]',
  );
  fireEvent.change(input, {
    target: {
      files: [new File(["pdf"], "proyecto.pdf", { type: "application/pdf" })],
    },
  });

  await waitFor(() => expect(downloads).toHaveLength(1));
  expect(downloads[0]).toBe("proyecto.json");
  expect(
    screen.getByText(/muévelo allí desde la carpeta de descargas/i),
  ).toBeInTheDocument();
  const [blob] = createObjectURL.mock.calls[0];
  const savedProjectText = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const savedProject = JSON.parse(savedProjectText);
  expect(savedProject.title).toBe("Proyecto de prueba");
  expect(savedProject.extraction.sourceFileName).toBe("proyecto.pdf");
});

test("renders only the public project at the View hash route", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-publico";
  project.title = "Proyecto para clientes";
  project.summary = "Resumen breve";
  project.sections[0].content = "Contenido real de introducción";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).endsWith("/documents/index.json")) {
        return {
          ok: true,
          json: async () => ({
            projects: [
              {
                file: "nombre-personalizado.json",
                title: project.title,
                images: ["images/proyecto/foto.png"],
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => project };
    }),
  );
  window.location.hash = "#/view/";

  render(<App />);

  expect(
    await screen.findByRole("heading", { name: project.title }),
  ).toBeInTheDocument();
  expect(document.getElementById("main-content")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: /secciones del proyecto/i })).toBeInTheDocument();
  const introductionLink = screen.getByRole("link", {
    name: "Introducción",
  });
  expect(introductionLink).toHaveAttribute(
    "href",
    "#project-section-introduction",
  );
  expect(screen.getByRole("link", { name: "Resumen" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  const sectionLinks = within(
    screen.getByRole("navigation", { name: /secciones del proyecto/i }),
  ).getAllByRole("link");
  for (const link of sectionLinks) {
    const target = document.getElementById(
      link.getAttribute("href").slice(1),
    );
    expect(target).not.toBeNull();
    fireEvent.click(link);
    expect(window.location.hash).toBe("#/view/");
    expect(link).toHaveAttribute("aria-current", "location");
  }
  expect(screen.getByText("Contenido real de introducción")).toBeInTheDocument();
  expect(screen.getByAltText("foto.png")).toBeInTheDocument();
  expect(screen.getByText(/Anthony/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Página web/ })).toHaveAttribute("href", "https://devkosmosyneah.github.io/devkosmosyne-website/");
  expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/18-anth");
  expect(screen.getByRole("link", { name: /^CV/ })).toHaveAttribute("href", "https://18-anth.github.io/CV_Anth/");
  expect(screen.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", "https://www.linkedin.com/in/anthony-c-a12928111/");
  expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("rel", "noopener noreferrer");
  expect(
    screen.queryByRole("navigation", { name: /navegación principal/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByAltText("foto.png")).toHaveAttribute(
    "src",
    expect.stringContaining("/documents/images/proyecto/foto.png"),
  );

  const projectMenu = screen.getByRole("navigation", {
    name: /secciones del proyecto/i,
  });
  const qrButton = within(projectMenu).getByRole("button", {
    name: /mostrar código qr/i,
  });
  fireEvent.click(qrButton);
  const qrDialog = await screen.findByRole("dialog", {
    name: /escanea para compartir la página con los demás/i,
  });
  expect(
    within(qrDialog).getByRole("img", { name: /código qr para/i }),
  ).toHaveAttribute("src", "data:image/png;base64,qr");
  expect(makeQrDataUrl).toHaveBeenCalledWith(window.location.href);
  expect(within(qrDialog).getByText(/#\/view\//i)).toBeInTheDocument();

  fireEvent.keyDown(qrDialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(qrButton).toHaveFocus();
});

test("opens and closes the mobile project menu with an edge swipe", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-navegacion-movil";
  project.title = "Proyecto móvil";
  project.sections[0].content = "Contenido de introducción";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      String(url).endsWith("/documents/index.json")
        ? {
            ok: true,
            json: async () => ({
              projects: [{ file: "proyecto.json", title: project.title }],
            }),
          }
        : { ok: true, json: async () => project },
    ),
  );
  window.location.hash = "#/view/";
  render(<App />);

  const menuButton = await screen.findByRole("button", {
    name: /secciones/i,
  });
  const dispatchTouch = (type, x, y = 100) => {
    const event = new Event(type);
    Object.defineProperty(event, type === "touchstart" ? "touches" : "changedTouches", {
      value: [{ clientX: x, clientY: y }],
    });
    window.dispatchEvent(event);
  };

  dispatchTouch("touchstart", 5);
  dispatchTouch("touchend", 100);
  await waitFor(() => expect(menuButton).toHaveAttribute("aria-expanded", "true"));

  dispatchTouch("touchstart", 200);
  dispatchTouch("touchend", 100);
  await waitFor(() => expect(menuButton).toHaveAttribute("aria-expanded", "false"));
  fireEvent.click(menuButton);
  fireEvent.click(screen.getByRole("link", { name: "Introducción" }));
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  expect(window.location.hash).toBe("#/view/");
});

test("keeps the selected published project on the public route", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-seleccionado";
  project.title = "Proyecto seleccionado";
  project.sections[0].content = "Contenido del proyecto seleccionado";
  const fetchMock = vi.fn(async (url) => {
    if (String(url).endsWith("/documents/index.json")) {
      return {
        ok: true,
        json: async () => ({
          projects: [
            { file: "primero.json", title: "Primer proyecto" },
            { file: "segundo.json", title: project.title },
          ],
        }),
      };
    }
    return { ok: true, json: async () => project };
  });
  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = "#/View///?project=segundo.json";

  render(<App />);

  expect(
    await screen.findByRole("heading", { name: project.title }),
  ).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).endsWith("/documents/segundo.json"),
    ),
  ).toBe(true);
  expect(
    screen.queryByRole("navigation", { name: /navegación principal/i }),
  ).not.toBeInTheDocument();
});

test("renders direct internet image paths from multimedia in the public gallery", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-galeria-remota";
  project.title = "Proyecto con galería remota";
  project.media = [
    {
      id: "image-cover",
      title: "Portada",
      name: "portada.jpg",
      alt: "Portada del proyecto",
      path: "images/proyecto/portada.jpg",
      source: "local",
      order: 1,
      featured: false,
    },
    {
      id: "image-online",
      title: "Imagen OCR en internet",
      name: "imagen.jpg",
      alt: "Imagen OCR alojada en internet",
      path: "https://images.example.org/region/1?width=900",
      source: "local",
      order: 2,
      featured: false,
      ocrText: "Texto que se conservó del OCR",
      ocrConfidence: 90,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).endsWith("/documents/index.json")) {
        return {
          ok: true,
          json: async () => ({
            projects: [{ file: "proyecto.json", title: project.title }],
          }),
        };
      }
      return { ok: true, json: async () => project };
    }),
  );
  window.location.hash = "#/view/";

  render(<App />);

  const image = await screen.findByAltText("Imagen OCR alojada en internet");
  expect(image).toHaveAttribute(
    "src",
    "https://images.example.org/region/1?width=900",
  );
  expect(screen.getByText("Imagen OCR en internet")).toBeInTheDocument();
});

test("renders image URLs embedded in the public development section", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-con-imagen-en-texto";
  project.title = "Proyecto con imágenes";
  const development = project.sections.find(
    (section) => section.id === "development",
  );
  development.content =
    "Descripción de la provincia.\n\nImágenes:\n- Marimba esmeraldeña: https://example.com/marimba.jpg?size=large";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).endsWith("/documents/index.json")) {
        return {
          ok: true,
          json: async () => ({
            projects: [{ file: "proyecto.json", title: project.title }],
          }),
        };
      }
      return { ok: true, json: async () => project };
    }),
  );
  window.location.hash = "#/view/";

  render(<App />);

  const image = await screen.findByAltText("Marimba esmeraldeña");
  expect(image).toHaveAttribute(
    "src",
    "https://example.com/marimba.jpg?size=large",
  );
  expect(screen.getByText("Marimba esmeraldeña")).toBeInTheDocument();
  expect(screen.getByText("Descripción de la provincia.")).toBeInTheDocument();
});

test("hydrates the separated project JSON files in the public View route", async () => {
  const project = createEmptyProject();
  project.projectId = "proyecto-dividido";
  project.title = "Proyecto dividido";
  project.authors = [{ id: "autor-1", name: "Ana", role: "Estudiante" }];
  project.objectives.general = "Investigar el tema.";
  project.sections[0].content = "Contenido desde desarrollo.json";
  project.conclusions = ["Conclusión desde conclusiones.json"];
  project.references = ["Referencia desde referencias.json"];
  project.media = [
    {
      id: "image-1",
      title: "Imagen del proyecto",
      name: "foto.png",
      alt: "Fotografía del proyecto",
      path: "images/proyecto/foto.png",
      source: "local",
      section: "introduction",
      order: 1,
      ocrText: "Texto OCR conservado",
    },
  ];
  project.videos = [
    {
      id: "video-1",
      title: "Video del proyecto",
      description: "Descripción del video",
      platform: "youtube",
      url: "https://youtu.be/a1B2c3D4e5F",
      videoId: "a1B2c3D4e5F",
      embedUrl: "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
      section: "introduction",
      order: 1,
    },
  ];
  const files = createProjectFiles(project);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/documents/index.json")) {
        return { ok: false, status: 404 };
      }
      const filename = decodeURIComponent(path.split("/").pop());
      if (!files[filename]) return { ok: false };
      return { ok: true, json: async () => JSON.parse(files[filename]) };
    }),
  );
  window.location.hash = "#/view/";

  render(<App />);

  expect(
    await screen.findByRole("heading", { name: project.title }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Por Ana/)).toBeInTheDocument();
  expect(screen.getByText("Contenido desde desarrollo.json")).toBeInTheDocument();
  expect(screen.getByText("Investigar el tema.")).toBeInTheDocument();
  expect(screen.getByText("Conclusión desde conclusiones.json")).toBeInTheDocument();
  expect(screen.getByAltText("Fotografía del proyecto")).toBeInTheDocument();
  expect(screen.getByTitle("Video del proyecto")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F",
  );
});

test("imports and OCR-analyzes multiple images while keeping OCR text editable", async () => {
  analyzeImageFiles.mockImplementation(async (files) => files.map((_, index) => ({
    ocrText: `Texto OCR ${index + 1}`,
    ocrConfidence: 90,
    ocrReviewRequired: false,
    ocrClassification: { titles: [], paragraphs: [], dates: [], data: [] },
    visualReviewRequired: true,
  })));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /imágenes y ocr/i }));
  const files = Array.from({ length: 8 }, (_, index) => new File([`image-${index}`], `image-${index + 1}.jpg`, { type: "image/jpeg" }));

  fireEvent.change(screen.getByLabelText(/seleccionar varias imágenes/i), { target: { files } });

  expect(await screen.findByText("8 imágenes")).toBeInTheDocument();
  await waitFor(() => expect(analyzeImageFiles).toHaveBeenCalledWith(files, expect.objectContaining({ onProgress: expect.any(Function) })));
  const ocrFields = await screen.findAllByLabelText("Texto reconocido por OCR");
  expect(ocrFields).toHaveLength(8);
  expect(ocrFields[0]).toHaveValue("Texto OCR 1");
  fireEvent.change(ocrFields[0], { target: { value: "Texto OCR corregido" } });
  expect(ocrFields[0]).toHaveValue("Texto OCR corregido");
  fireEvent.change(screen.getAllByLabelText("Título")[0], { target: { value: "Fotografía revisada" } });
  fireEvent.change(screen.getAllByLabelText("Descripción publicada")[0], { target: { value: "Descripción manual" } });
  fireEvent.change(screen.getAllByLabelText("Sección asociada")[0], { target: { value: "introduction" } });
  fireEvent.click(screen.getByRole("button", { name: /vista previa/i }));
  expect(await screen.findByText("Fotografía revisada")).toBeInTheDocument();
  expect(screen.getByText("Descripción manual")).toBeInTheDocument();
});

test("replaces an image file without changing its OCR results or rerunning OCR", async () => {
  analyzeImageFiles.mockResolvedValue([
    {
      ocrText: "Texto OCR que ya se había leído",
      ocrConfidence: 91,
      ocrReviewRequired: false,
      ocrReviewed: true,
      ocrClassification: { titles: ["Título original"], paragraphs: [], dates: [], data: [] },
    },
  ]);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /imágenes y ocr/i }));
  const original = new File(["original"], "original.jpg", {
    type: "image/jpeg",
  });
  fireEvent.change(screen.getByLabelText(/seleccionar varias imágenes/i), {
    target: { files: [original] },
  });
  const ocrField = await screen.findByLabelText("Texto reconocido por OCR");
  await waitFor(() => expect(ocrField).toHaveValue("Texto OCR que ya se había leído"));

  const replacement = new File(["replacement"], "replacement.webp", {
    type: "image/webp",
  });
  fireEvent.change(
    screen.getByLabelText(/reemplazar imagen original\.jpg \(conserva el ocr\)/i),
    { target: { files: [replacement] } },
  );

  expect(ocrField).toHaveValue("Texto OCR que ya se había leído");
  expect(screen.getByText(/confianza: 91%/i)).toBeInTheDocument();
  expect(
    screen.getByLabelText(/confirmo que revisé el texto ocr/i),
  ).toBeChecked();
  expect(analyzeImageFiles).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByText("replacement.webp")).toBeInTheDocument(),
  );
});

test("adds a validated YouTube URL to the administrator preview", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /videos youtube/i }));
  fireEvent.change(screen.getByLabelText("Título del video"), { target: { value: "Presentación escolar" } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Presentación del proyecto" } });
  fireEvent.change(screen.getByLabelText("URL original de YouTube"), { target: { value: "https://www.youtube.com/shorts/a1B2c3D4e5F?feature=share" } });
  fireEvent.click(screen.getByRole("button", { name: /guardar video/i }));

  expect(await screen.findByTitle("Presentación escolar")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/a1B2c3D4e5F");
  expect(screen.getByRole("link", { name: /abrir video original/i })).toHaveAttribute("href", "https://www.youtube.com/shorts/a1B2c3D4e5F?feature=share");
});
