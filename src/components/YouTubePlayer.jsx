import { useEffect, useState } from 'react';
import { parseYouTubeUrl } from '../utils/multimedia';

export default function YouTubePlayer({ video }) {
  const parsed = parseYouTubeUrl(video?.url);
  const videoId = parsed?.videoId || '';
  const validId = /^[A-Za-z0-9_-]{11}$/.test(videoId) && (!video?.videoId || video.videoId === videoId);
  const embedUrl = validId ? `https://www.youtube-nocookie.com/embed/${videoId}` : '';
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [videoId]);

  if (!validId) return null;

  return (
    <article className="youtube-player">
      {video.title && <h3>{video.title}</h3>}
      {video.description && <p>{video.description}</p>}
      <div className="youtube-frame">
        {!loaded && !failed && <span className="youtube-loading" role="status">Cargando reproductor…</span>}
        {failed
          ? <p className="youtube-error" role="alert">No se pudo cargar el reproductor. Puedes abrir el video original.</p>
          : <iframe
              src={embedUrl}
              title={video.title || 'Video de YouTube'}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />}
      </div>
      {parsed && <a href={parsed.url} target="_blank" rel="noopener noreferrer">Abrir video original ↗</a>}
    </article>
  );
}
