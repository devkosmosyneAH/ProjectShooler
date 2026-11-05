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
import { createEmptyProject } from "./utils/projectData";
import { analyzeImageFiles } from "./utils/multimedia";

vi.mock("./utils/multimedia", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, analyzeImageFiles: vi.fn() };
});

vi.mock("./utils/pdfProcessor", () => ({
  processPdf: vi.fn(),
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
  expect(screen.getByRole("navigation", { name: /secciones del proyecto/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Introducción" })).toHaveAttribute("href", "#project-section-introduction");
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
