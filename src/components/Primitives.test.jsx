import { render, screen } from '@testing-library/react';
import { ActionButton, Surface } from './Primitives';

test('Surface renders a semantic element with its visual variant', () => {
  render(<Surface as="article" variant="featured">Featured content</Surface>);

  expect(screen.getByRole('article')).toHaveClass('surface', 'surface--featured');
});

test('ActionButton can render a link without losing its variant', () => {
  render(<ActionButton as="a" variant="outline" href="#preview">Open preview</ActionButton>);

  expect(screen.getByRole('link', { name: 'Open preview' })).toHaveClass('button', 'button-outline');
});

test('ActionButton exposes a disabled loading state', () => {
  render(<ActionButton loading>Processing</ActionButton>);

  expect(screen.getByRole('button', { name: 'Processing' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Processing' })).toHaveAttribute('aria-busy', 'true');
});
