import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

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
