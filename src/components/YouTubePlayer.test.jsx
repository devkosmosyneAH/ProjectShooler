import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import YouTubePlayer from './YouTubePlayer';

describe('YouTubePlayer', () => {
  const video = {
    title: 'Presentación del proyecto',
    description: 'Video explicativo',
    url: 'https://youtu.be/a1B2c3D4e5F',
    videoId: 'a1B2c3D4e5F',
  };

  test('renders a lazy privacy-enhanced player and source link', () => {
    render(<YouTubePlayer video={video} />);
    const iframe = screen.getByTitle(video.title);
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/a1B2c3D4e5F');
    expect(iframe).toHaveAttribute('loading', 'lazy');
    expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(screen.getByRole('link', { name: /abrir video original/i })).toHaveAttribute('href', video.url);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    fireEvent.load(iframe);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('does not construct an iframe from an invalid URL', () => {
    const { container } = render(<YouTubePlayer video={{ ...video, url: 'https://youtube.com.evil/watch?v=a1B2c3D4e5F' }} />);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
