import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import App from './App';
import { processPdf } from './utils/pdfProcessor';

vi.mock('./utils/pdfProcessor', () => ({
  processPdf: vi.fn(),
}));

beforeEach(() => {
  processPdf.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('shows the project dashboard and administrative sections', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /publica un proyecto escolar/i })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: /navegación principal/i })).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: /navegación principal/i })).getByRole('button', { name: /importar pdf/i })).toBeInTheDocument();
});

test('navigates to PDF import', () => {
  render(<App />);
  fireEvent.click(within(screen.getByRole('navigation', { name: /navegación principal/i })).getByRole('button', { name: /importar pdf/i }));
  expect(screen.getByRole('heading', { name: /importa tu documento/i })).toBeInTheDocument();
  expect(screen.getByText(/OCR solo se ejecuta en páginas/i)).toBeInTheDocument();
});

test('downloads the extracted project as a JSON file', async () => {
  const NativeURL = URL;
  const createObjectURL = vi.fn(() => 'blob:project-json');
  vi.stubGlobal('URL', Object.assign(class extends NativeURL {}, {
    createObjectURL,
    revokeObjectURL: vi.fn(),
  }));
  const downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.push(this.download);
  });
  processPdf.mockResolvedValue({
    pages: [{ text: 'Título: Proyecto de prueba\nInstitución: Escuela\nIntroducción\nTexto de prueba.' }],
    pageCount: 1,
    ocrPages: [],
  });

  render(<App />);
  fireEvent.click(within(screen.getByRole('navigation', { name: /navegación principal/i })).getByRole('button', { name: /importar pdf/i }));
  const input = document.querySelector('input[type="file"][accept="application/pdf,.pdf"]');
  fireEvent.change(input, {
    target: { files: [new File(['pdf'], 'proyecto.pdf', { type: 'application/pdf' })] },
  });

  await waitFor(() => expect(downloads).toHaveLength(1));
  expect(downloads[0]).toBe('proyecto.json');
  expect(screen.getByText(/muévelo allí desde la carpeta de descargas/i)).toBeInTheDocument();
  const [blob] = createObjectURL.mock.calls[0];
  const savedProjectText = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const savedProject = JSON.parse(savedProjectText);
  expect(savedProject.title).toBe('Proyecto de prueba');
  expect(savedProject.extraction.sourceFileName).toBe('proyecto.pdf');
});
