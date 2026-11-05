import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { MAX_PDF_SIZE, createEmptyProject, extractProjectFromText, validateProject, buildPagesUrl } from './utils/projectData';
import { DEVELOPER_PROFILE } from './utils/developerProfile';
import { ActionButton, Icon, Surface } from './components/Primitives';

const navigation = [
  { id: 'home', label: 'Inicio' },
  { id: 'import', label: 'Importar PDF' },
  { id: 'editor', label: 'Editor de información' },
  { id: 'preview', label: 'Vista previa' },
  { id: 'export', label: 'Exportar archivos' },
  { id: 'qr', label: 'Generador QR' },
  { id: 'publish', label: 'Publicación' },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractedJsonFilename(sourceFileName, fallback) {
  const baseName = sourceFileName
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '');
  return `${baseName || fallback}.json`;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function Notice({ tone = 'info', children }) {
  return <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

function isPublicViewHash(hash) {
  return hash.split('?')[0].replace(/\/+$/, '').toLowerCase() === '#/view';
}

function publicDocumentUrl(fileName = '') {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const path = fileName
    ? `documents/${fileName.split('/').map(encodeURIComponent).join('/')}`
    : 'documents/index.json';
  return new URL(path, baseUrl);
}

function PublicClientView({ hash }) {
  const [view, setView] = useState({ loading: true, project: null, file: '', projects: [], error: '' });

  useEffect(() => {
    let active = true;
    const loadProject = async () => {
      setView({ loading: true, project: null, file: '', projects: [], error: '' });
      try {
        const manifestResponse = await fetch(publicDocumentUrl());
        if (!manifestResponse.ok) throw new Error('No se pudo cargar el índice de proyectos publicados.');
        const manifest = await manifestResponse.json();
        if (!Array.isArray(manifest.projects)) throw new Error('El índice de proyectos no tiene un formato válido.');

        const projects = manifest.projects;
        const requestedFile = new URLSearchParams(hash.split('?')[1] || '').get('project');
        if (!projects.length) {
          if (active) setView({ loading: false, project: null, file: '', projects, error: 'Todavía no hay proyectos JSON en la carpeta documents.' });
          return;
        }
        if (requestedFile && !projects.some((item) => item.file === requestedFile)) {
          throw new Error('El proyecto solicitado no aparece en el índice publicado.');
        }
        if (!requestedFile && projects.length > 1) {
          if (active) setView({ loading: false, project: null, file: '', projects, error: '' });
          return;
        }

        const selected = projects.find((item) => item.file === requestedFile) || projects[0];
        const projectResponse = await fetch(publicDocumentUrl(selected.file));
        if (!projectResponse.ok) throw new Error(`No se pudo cargar ${selected.file}.`);
        const project = await projectResponse.json();
        if ((!Array.isArray(project.media) || project.media.length === 0) && selected.images?.length) {
          project.media = selected.images.map((path) => {
            const name = path.split('/').pop();
            return { name, path, alt: name };
          });
        }
        const validationErrors = validateProject(project);
        if (validationErrors.length) throw new Error(`El archivo ${selected.file} no contiene un proyecto válido: ${validationErrors.join(' ')}`);
        if (active) setView({ loading: false, project, file: selected.file, projects, error: '' });
      } catch (loadError) {
        if (active) setView({ loading: false, project: null, file: '', projects: [], error: loadError.message });
      }
    };

    loadProject();
    return () => { active = false; };
  }, [hash]);

  if (view.loading) {
    return (
      <main className="client-view client-loading" aria-busy="true">
        <p className="visually-hidden" role="status">Cargando proyecto…</p>
        <div className="loading-skeleton loading-skeleton-hero" aria-hidden="true" />
        <div className="loading-skeleton loading-skeleton-card" aria-hidden="true" />
        <div className="loading-skeleton loading-skeleton-card" aria-hidden="true" />
      </main>
    );
  }
  if (view.error) {
    return (
      <main className="client-view">
        <section className="client-message" role="alert">
          <h1>No se pudo mostrar el proyecto</h1>
          <p>{view.error}</p>
          <p>Coloca el archivo JSON y sus imágenes en <code>documents/</code> y vuelve a publicar el sitio.</p>
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
              <a key={item.file} href={`#/View?project=${encodeURIComponent(item.file)}`}>
                {item.title || 'Proyecto escolar'}
              </a>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const mediaSrc = (media) => {
    if (media.preview) return media.preview;
    const path = media.path.replace(/^\/+/, '').replace(/^documents\//, '');
    return new URL(path.split('/').map(encodeURIComponent).join('/'), publicDocumentUrl(view.file)).href;
  };
  return (
    <main className="client-view">
      <PublicPreview project={view.project} mediaSrc={mediaSrc} />
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

function PublicPreview({ project, hideEmpty = true, mediaSrc = (media) => media.preview || media.path }) {
  const visibleSections = project.sections.filter((section) => !hideEmpty || section.content.trim());
  const specificObjectives = project.objectives.specific.filter(Boolean);
  const conclusions = project.conclusions.filter(Boolean);
  const recommendations = project.recommendations.filter(Boolean);
  const references = project.references.filter(Boolean);
  const hasGoals = project.objectives.general || specificObjectives.length;
  const hasContent = project.description || project.summary || hasGoals || visibleSections.length || project.tables.length || conclusions.length || recommendations.length || references.length || project.media.length;
  const chapters = [
    ...(project.summary ? [{ id: 'project-summary', label: 'Resumen', title: 'El proyecto en breve', content: project.summary }] : []),
    ...(hasGoals ? [{
      id: 'project-objectives',
      label: 'Objetivos',
      title: 'Objetivo general',
      content: project.objectives.general,
      listTitle: specificObjectives.length ? 'Objetivos específicos' : '',
      items: specificObjectives,
    }] : []),
    ...visibleSections.map((section) => ({
      id: `project-section-${section.id}`,
      label: section.title,
      title: section.title,
      content: section.content || 'Contenido pendiente de revisión.',
    })),
  ];
  const firstMedia = project.media[0];
  const remainingMedia = project.media.slice(firstMedia ? 1 : 0);
  const pageLinks = [
    ...chapters.map(({ id, label }) => ({ id, label })),
    ...(project.tables.length ? [{ id: 'project-tables', label: 'Tablas' }] : []),
    ...(conclusions.length ? [{ id: 'project-conclusions', label: 'Conclusiones' }] : []),
    ...(recommendations.length ? [{ id: 'project-recommendations', label: 'Recomendaciones' }] : []),
    ...(references.length ? [{ id: 'project-references', label: 'Referencias' }] : []),
    ...(remainingMedia.length ? [{ id: 'project-gallery', label: 'Galería' }] : []),
  ];
  return (
    <div className="public-preview project-infographic">
      <div className="infographic-masthead"><span className="infographic-brand">Aula<span>.</span></span><span>Proyecto escolar</span></div>
      <header className="infographic-hero" id="project-start">
        <div className="infographic-hero-copy">
          <p className="infographic-institution">{project.institution || 'Proyecto escolar'}</p>
          <p className="eyebrow">{project.extraction.pageCount > 0 ? `Documento fuente · ${project.extraction.pageCount} páginas` : 'Proyecto escolar'}</p>
          <h1>{project.title || 'Proyecto escolar'}</h1>
          {project.description && <p className="infographic-description">{project.description}</p>}
          {project.authors.length > 0 && <p className="preview-byline">Por {project.authors.map((author) => author.name).filter(Boolean).join(', ')}</p>}
        </div>
        {firstMedia ? (
          <figure className="infographic-cover">
            <img src={mediaSrc(firstMedia)} alt={firstMedia.alt || firstMedia.name} />
            {(firstMedia.alt || firstMedia.name) && <figcaption>{firstMedia.alt || firstMedia.name}</figcaption>}
          </figure>
        ) : (
          <div className="infographic-art" aria-hidden="true"><span /><span /><span /></div>
        )}
      </header>
      {pageLinks.length > 0 && <nav className="infographic-toc" aria-label="Secciones del proyecto">{pageLinks.map(({ id, label }) => <a href={`#${id}`} key={id}>{label}</a>)}</nav>}
      <div className="infographic-content">
        {!hasContent && <p className="empty-state">Todavía no hay contenido para mostrar. Importa un PDF o completa el editor.</p>}
        {chapters.length > 0 && <section className="infographic-flow" aria-label="Contenido del proyecto">{chapters.map((chapter, index) => (
          <article className="infographic-chapter" id={chapter.id} key={chapter.id}>
            <div className="chapter-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
            <div className="chapter-card">
              <p className="chapter-kicker">{chapter.label}</p>
              <h2>{chapter.title}</h2>
              {chapter.content && <p>{chapter.content}</p>}
              {chapter.listTitle && <h3>{chapter.listTitle}</h3>}
              {chapter.items?.length > 0 && <ul>{chapter.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
            </div>
          </article>
        ))}</section>}
        {project.tables.length > 0 && <section className="infographic-extra" id="project-tables"><h2>Tablas del proyecto</h2><div className="infographic-data-grid">{project.tables.map((table) => <article className="infographic-data-card" key={table.id}><h3>{table.title}</h3><div className="table-scroll"><table><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} scope="col">{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></article>)}</div></section>}
        {(conclusions.length > 0 || recommendations.length > 0) && <section className="infographic-data-grid">
          {conclusions.length > 0 && <article className="infographic-data-card infographic-accent-peach" id="project-conclusions"><p className="chapter-kicker">Cierre</p><h2>Conclusiones</h2><ul>{conclusions.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}
          {recommendations.length > 0 && <article className="infographic-data-card infographic-accent-lilac" id="project-recommendations"><p className="chapter-kicker">Siguientes pasos</p><h2>Recomendaciones</h2><ul>{recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}
        </section>}
        {references.length > 0 && <section className="infographic-data-card infographic-references" id="project-references"><p className="chapter-kicker">Fuentes consultadas</p><h2>Referencias</h2><ol>{references.map((item, index) => <li key={index}>{item}</li>)}</ol></section>}
        {remainingMedia.length > 0 && <section className="infographic-gallery infographic-data-card" id="project-gallery"><p className="chapter-kicker">Material visual</p><h2>Galería del proyecto</h2><div className="image-grid">
          {remainingMedia.map((image) => <figure key={image.path}><img src={mediaSrc(image)} alt={image.alt || image.name} loading="lazy" /><figcaption>{image.alt || image.name}</figcaption></figure>)}
        </div></section>}
      </div>
      <footer className="developer-credit">
        <div className="developer-credit-inner">
          <div>
            <p className="developer-credit-kicker">Créditos</p>
            <p className="developer-credit-title">Desarrollado por</p>
            <strong>{DEVELOPER_PROFILE.name}</strong>
          </div>
          <nav className="developer-links" aria-label="Enlaces del desarrollador">
            {DEVELOPER_PROFILE.links.map(({ label, href }) => (
              <a href={href} key={href} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true">↗</span></a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('home');
  const [routeHash, setRouteHash] = useState(() => window.location.hash);
  const [project, setProject] = useState(createEmptyProject);
  const [pdfFile, setPdfFile] = useState(null);
  const [imageFiles, setImageFiles] = useState({});
  const [progress, setProgress] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingCancelled, setProcessingCancelled] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('');
  const [qrCaption, setQrCaption] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const cancelRef = useRef(false);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const publicUrl = useMemo(() => buildPagesUrl(owner, repository), [owner, repository]);
  const pendingCount = useMemo(() => {
    let count = project.sections.filter((section) => section.content.trim().length === 0).length;
    if (!project.title.trim()) count += 1;
    if (!project.institution.trim()) count += 1;
    return count;
  }, [project]);
  const validationErrors = useMemo(() => validateProject(project), [project]);
  const isClientView = isPublicViewHash(routeHash);

  useEffect(() => {
    const syncHash = () => setRouteHash(window.location.hash);
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    if (!publicUrl) {
      setQrImage('');
      return;
    }
    let current = true;
    import('./utils/qr')
      .then(({ makeQrDataUrl }) => makeQrDataUrl(publicUrl))
      .then((image) => { if (current) setQrImage(image); })
      .catch((qrError) => { if (current) setError(qrError.message); });
    return () => { current = false; };
  }, [publicUrl]);

  const updateProject = (updater) => {
    setProject((current) => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      return { ...next, updatedAt: new Date().toISOString(), extraction: { ...next.extraction, reviewed: false, pendingReview: true } };
    });
    setApproved(false);
  };

  const processFile = async (file) => {
    if (!file || processing) return;
    setError('');
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      setError('El archivo debe ser un PDF.');
      return;
    }
    if (file.size === 0 || file.size > MAX_PDF_SIZE) {
      setError(file.size === 0 ? 'El archivo está vacío.' : 'El PDF supera el límite de 50 MB.');
      return;
    }
    setPdfFile(file);
    setProcessing(true);
    setProcessingCancelled(false);
    setProgress({ page: 0, total: 0, phase: 'loading' });
    cancelRef.current = false;
    try {
      const { processPdf } = await import('./utils/pdfProcessor');
      const result = await processPdf(file, {
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
      });
      if (cancelRef.current) return;
      const extracted = extractProjectFromText(
        result.pages.map((page) => page.text).filter(Boolean).join('\n'),
        file.name,
        result.pageCount,
        result.ocrPages,
      );
      extracted.extraction.pendingReview = true;
      const json = `${JSON.stringify(extracted, null, 2)}\n`;
      downloadBlob(
        new Blob([json], { type: 'application/json' }),
        extractedJsonFilename(file.name, extracted.projectId),
      );
      setProject(extracted);
      setApproved(false);
      setActivePage('editor');
    } catch (processingError) {
      if (processingError.name === 'PdfProcessingCancelledError') setProcessingCancelled(true);
      else setError(processingError.message);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const handleImageFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter((file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024);
    if (validFiles.length !== files.length) setError('Solo se aceptan imágenes de hasta 10 MB cada una.');
    try {
      const additions = await Promise.all(validFiles.map(async (file, index) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.+/g, '-');
        const path = `images/proyecto/${Date.now()}-${index}-${safeName}`;
        return { path, file, preview: await fileAsDataUrl(file) };
      }));
      setImageFiles((current) => Object.fromEntries([...Object.entries(current), ...additions.map(({ path, file }) => [path, file])]));
      updateProject((current) => ({
        ...current,
        media: [...current.media, ...additions.map(({ path, file, preview }) => ({ path, name: file.name, alt: '', preview }))],
      }));
    } catch (imageError) {
      setError(imageError.message);
    } finally {
      event.target.value = '';
    }
  };

  const removeImage = (imagePath) => {
    updateProject((current) => ({ ...current, media: current.media.filter((item) => item.path !== imagePath) }));
    setImageFiles((current) => {
      const next = { ...current };
      delete next[imagePath];
      return next;
    });
  };

  const exportJson = () => {
    if (!approved || validationErrors.length) return;
    import('./utils/siteBundle')
      .then(({ createJsonZip }) => createJsonZip(project, { hideEmptySections: hideEmpty }))
      .then((zip) => downloadBlob(zip, `${project.projectId}-datos-json.zip`))
      .catch((zipError) => setError(`No se pudieron exportar los JSON: ${zipError.message}`));
  };

  const exportZip = async () => {
    if (!approved || validationErrors.length) return;
    setError('');
    try {
      const { createSiteZip } = await import('./utils/siteBundle');
      const zip = await createSiteZip(project, imageFiles, includeOriginal ? pdfFile : null, { hideEmptySections: hideEmpty });
      downloadBlob(zip, `${project.projectId || 'proyecto-escolar'}-publicacion.zip`);
    } catch (zipError) {
      setError(`No se pudo crear el ZIP: ${zipError.message}`);
    }
  };

  const downloadPng = () => {
    if (!qrImage) return;
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = 'codigo-qr-proyecto.png';
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
      setError('No se pudo copiar automáticamente. Selecciona y copia el enlace manualmente.');
    }
  };

  const exportQrPdf = async () => {
    try {
      const { downloadQrPdf } = await import('./utils/qr');
      await downloadQrPdf(publicUrl, qrCaption);
    } catch (qrError) {
      setError(qrError.message);
    }
  };

  const renderHome = () => (
    <>
      <PageHeader eyebrow="Espacio de trabajo" title="Publica un proyecto escolar" description="Convierte un PDF en una página accesible, revisada y lista para compartir." />
      <Surface as="section" variant="hero" className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-icon"><Icon name="spark" size={18} /></span>
          <p className="eyebrow">De documento a experiencia web</p>
          <h2>Un proyecto escolar, listo para compartir.</h2>
          <p>Extrae, organiza y revisa el contenido de tu documento antes de publicarlo como un sitio estático con su propio código QR.</p>
          <ActionButton variant="light" onClick={() => inputRef.current?.click()}>Importar un PDF <span aria-hidden="true">→</span></ActionButton>
        </div>
        <div className="welcome-orbit" aria-hidden="true"><div className="orbit-shape"><span /><span /><span /></div><div className="orbit-center">a.</div></div>
      </Surface>
      <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" aria-hidden="true" tabIndex={-1} onChange={(event) => processFile(event.target.files?.[0])} />
      <div className="stats-grid">
        <Surface as="article" variant="stat" className="stat-card"><span>01</span><strong>{project.extraction.pageCount || '—'}</strong><p>Páginas procesadas</p></Surface>
        <Surface as="article" variant="stat" className="stat-card"><span>02</span><strong>{project.sections.filter((item) => item.content).length}</strong><p>Secciones con contenido</p></Surface>
        <Surface as="article" variant="stat" className="stat-card"><span>03</span><strong>{project.media.length}</strong><p>Imágenes añadidas</p></Surface>
        <Surface as="article" variant="stat" className="stat-card"><span>04</span><strong>{pendingCount}</strong><p>Datos por revisar</p></Surface>
      </div>
      <section className="steps-section">
        <div className="section-heading"><div><p className="eyebrow">Flujo de trabajo</p><h2>Del PDF a tu página pública</h2></div></div>
        <div className="steps-grid">{[['01', 'Importa', 'Procesa el PDF en tu navegador.'], ['02', 'Revisa', 'Corrige cada dato antes de publicarlo.'], ['03', 'Exporta', 'Descarga la página y publícala en GitHub Pages.']].map(([number, title, text]) => <Surface as="article" variant="card" className="step-card" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></Surface>)}</div>
      </section>
      <Notice tone="warning">GitHub Pages es público y no ofrece autenticación de administrador. No publiques información confidencial ni datos personales sin autorización.</Notice>
    </>
  );

  const renderImport = () => (
    <>
      <PageHeader eyebrow="Procesamiento local" title="Importa tu documento" description="El texto se extrae en tu dispositivo. El OCR solo se ejecuta en páginas sin suficiente texto seleccionable." />
      <section
        className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); processFile(event.dataTransfer.files?.[0]); }}
      >
        <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" aria-hidden="true" tabIndex={-1} onChange={(event) => processFile(event.target.files?.[0])} />
        <span className="upload-icon">↑</span>
        <h2>Arrastra aquí tu PDF</h2>
        <p>o selecciona un archivo desde tu dispositivo</p>
        <ActionButton loading={processing} onClick={() => inputRef.current?.click()}>{processing ? 'Procesando…' : 'Elegir documento'}</ActionButton>
        <small>PDF · máximo 50 MB · procesa texto y OCR localmente</small>
      </section>
      {pdfFile && <div className="file-card"><div className="file-icon">PDF</div><div><strong>{pdfFile.name}</strong><p>{(pdfFile.size / 1024 / 1024).toFixed(2)} MB · {project.extraction.pageCount || 'páginas por detectar'}</p></div><span className={`status-pill ${processing ? 'status-running' : processingCancelled ? 'status-running' : 'status-ready'}`}>{processing ? 'Procesando' : processingCancelled ? 'Cancelado' : 'Listo'}</span></div>}
      {processing && <section className="progress-card"><div className="progress-top"><strong>{progress?.phase === 'ocr' ? 'Reconociendo texto con OCR…' : 'Extrayendo texto…'}</strong><span>{progress?.page ? `Página ${progress.page} de ${progress.total}` : 'Preparando documento'}</span></div><div className="progress-track"><div style={{ width: progress?.total ? `${Math.max(3, (progress.page / progress.total) * 100)}%` : '4%' }} /></div><div className="progress-bottom"><span>{progress?.status || 'El archivo permanece en este dispositivo.'}</span><button className="button button-quiet" onClick={() => { cancelRef.current = true; }}>Cancelar proceso</button></div></section>}
      {project.extraction.pageCount > 0 && !processing && <Notice tone="success">Extracción completada en {project.extraction.pageCount} páginas. OCR aplicado en {project.extraction.ocrPages.length} páginas. Se descargó {project.projectId}.json; si lo necesitas en <code>documents</code>, muévelo allí desde la carpeta de descargas.</Notice>}
      <Notice>PDF.js y Tesseract se ejecutan en el navegador. El motor y los datos de idioma de OCR pueden descargarse desde una CDN; el documento no se envía a ningún servidor.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderEditor = () => (
    <>
      <PageHeader eyebrow="Revisión editorial" title="Editor de información" description="Verifica y corrige el texto detectado. Los campos vacíos quedan pendientes: no se completa contenido automáticamente." />
      {project.extraction.pageCount > 0 && <Notice tone="success">Extracción completada en {project.extraction.pageCount} páginas. Se descargó {extractedJsonFilename(project.extraction.sourceFileName, project.projectId)}; si lo necesitas en <code>documents</code>, muévelo allí desde la carpeta de descargas.</Notice>}
      {project.extraction.sourceFileName && <Notice tone="warning">Detectado desde {project.extraction.sourceFileName}. Confirma nombres, referencias y contenido antes de exportar.</Notice>}
      {pendingCount > 0 && <Notice tone="warning">Hay {pendingCount} campos o secciones vacíos. Puedes completarlos o publicarlos ocultos.</Notice>}
      <div className="editor-layout">
        {project.tables.length > 0 && <section className="editor-card"><div className="editor-card-heading"><div><p className="eyebrow">Datos tabulares</p><h2>Tablas recuperadas del PDF</h2></div></div><p className="muted-copy">Revisa y corrige las celdas. La separación de columnas se infiere de las posiciones del texto en el PDF.</p>{project.tables.map((table, tableIndex) => <div className="table-edit" key={table.id}><label>Título de la tabla<input value={table.title} onChange={(event) => updateProject((current) => ({ ...current, tables: current.tables.map((item, index) => index === tableIndex ? { ...item, title: event.target.value } : item) }))} /></label>{table.rows.map((row, rowIndex) => <div className="table-edit-row" key={rowIndex}>{row.map((cell, cellIndex) => <label key={cellIndex}>Fila {rowIndex + 1} · Columna {cellIndex + 1}<input value={cell} onChange={(event) => updateProject((current) => ({ ...current, tables: current.tables.map((item, itemIndex) => itemIndex === tableIndex ? { ...item, rows: item.rows.map((cells, rowItemIndex) => rowItemIndex === rowIndex ? cells.map((value, cellItemIndex) => cellItemIndex === cellIndex ? event.target.value : value) : cells) } : item) }))} /></label>)}</div>)}</div>)}</section>}
        <section className="editor-card">
          <div className="editor-card-heading"><div><p className="eyebrow">Datos principales</p><h2>Identificación del proyecto</h2></div><span className="review-dot">{project.extraction.reviewed ? 'Revisado' : 'Revisión pendiente'}</span></div>
          <label>Título del proyecto<input value={project.title} onChange={(event) => updateProject({ title: event.target.value })} placeholder="Título tal como aparece en el documento" /></label>
          <label>Descripción<textarea rows="3" value={project.description} onChange={(event) => updateProject({ description: event.target.value })} placeholder="Descripción extraída o revisada" /></label>
          <label>Institución educativa<input value={project.institution} onChange={(event) => updateProject({ institution: event.target.value })} placeholder="Nombre de la institución" /></label>
          <label>Resumen<textarea rows="4" value={project.summary} onChange={(event) => updateProject({ summary: event.target.value })} placeholder="Resumen del proyecto" /></label>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading"><div><p className="eyebrow">Equipo</p><h2>Autores e integrantes</h2></div></div>
          {project.authors.map((author, index) => <div className="repeat-row" key={author.id}><label className="grow">Nombre<input value={author.name} onChange={(event) => updateProject((current) => ({ ...current, authors: current.authors.map((person, personIndex) => personIndex === index ? { ...person, name: event.target.value } : person) }))} /></label><label>Rol opcional<input value={author.role} onChange={(event) => updateProject((current) => ({ ...current, authors: current.authors.map((person, personIndex) => personIndex === index ? { ...person, role: event.target.value } : person) }))} /></label><button className="icon-button remove-button" aria-label="Eliminar integrante" onClick={() => updateProject((current) => ({ ...current, authors: current.authors.filter((_, personIndex) => personIndex !== index) }))}>×</button></div>)}
          <button className="button button-outline" onClick={() => updateProject((current) => ({ ...current, authors: [...current.authors, { id: `integrante-${Date.now()}`, name: '', role: '' }] }))}>＋ Añadir integrante</button>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading"><div><p className="eyebrow">Objetivos</p><h2>Objetivo general y específicos</h2></div></div>
          <label>Objetivo general<textarea rows="3" value={project.objectives.general} onChange={(event) => updateProject((current) => ({ ...current, objectives: { ...current.objectives, general: event.target.value } }))} placeholder="Objetivo general" /></label>
          {project.objectives.specific.map((objective, index) => <div className="repeat-row" key={index}><label className="grow">Objetivo específico {index + 1}<textarea rows="2" value={objective} onChange={(event) => updateProject((current) => ({ ...current, objectives: { ...current.objectives, specific: current.objectives.specific.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } }))} /></label><button className="icon-button remove-button" aria-label={`Eliminar objetivo ${index + 1}`} onClick={() => updateProject((current) => ({ ...current, objectives: { ...current.objectives, specific: current.objectives.specific.filter((_, itemIndex) => itemIndex !== index) } }))}>×</button></div>)}
          <button className="button button-outline" onClick={() => updateProject((current) => ({ ...current, objectives: { ...current.objectives, specific: [...current.objectives.specific, ''] } }))}>＋ Añadir objetivo</button>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading"><div><p className="eyebrow">Contenido</p><h2>Secciones del proyecto</h2></div><label className="toggle-label"><input type="checkbox" checked={hideEmpty} onChange={(event) => setHideEmpty(event.target.checked)} /> Ocultar vacías</label></div>
          {project.sections.map((section, index) => (
            <label className={`section-field ${!section.content.trim() ? 'section-pending' : ''}`} key={section.id}>
              <span className="field-title">{section.title}{!section.content.trim() && <small>Pendiente de revisión</small>}</span>
              <textarea rows="5" value={section.content} onChange={(event) => updateProject((current) => ({ ...current, sections: current.sections.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value, pendingReview: !event.target.value.trim() } : item) }))} placeholder={`Contenido de ${section.title.toLowerCase()}`} />
            </label>
          ))}
          <label>Conclusiones <small>Una por línea</small><textarea rows="4" value={project.conclusions.join('\n')} onChange={(event) => updateProject((current) => ({ ...current, conclusions: event.target.value.split('\n') }))} placeholder="Conclusiones" /></label>
          <label>Recomendaciones <small>Una por línea</small><textarea rows="4" value={project.recommendations.join('\n')} onChange={(event) => updateProject((current) => ({ ...current, recommendations: event.target.value.split('\n') }))} placeholder="Recomendaciones" /></label>
          <label>Bibliografía y referencias <small>Una referencia por línea</small><textarea rows="5" value={project.references.join('\n')} onChange={(event) => updateProject((current) => ({ ...current, references: event.target.value.split('\n') }))} placeholder="Referencias bibliográficas" /></label>
        </section>
        <section className="editor-card">
          <div className="editor-card-heading"><div><p className="eyebrow">Recursos</p><h2>Imágenes y fotografías</h2></div></div>
          <p className="muted-copy">PDF.js no extrae automáticamente los archivos de imagen del PDF. Añade manualmente las imágenes que tengas permiso para publicar.</p>
          <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" multiple aria-hidden="true" tabIndex={-1} onChange={handleImageFiles} />
          <button className="button button-outline" onClick={() => imageInputRef.current?.click()}>＋ Añadir imágenes</button>
          {project.media.length > 0 && <div className="media-list">{project.media.map((image) => <div className="media-row" key={image.path}><img src={image.preview} alt="" /><label className="grow">Texto alternativo<input value={image.alt} onChange={(event) => updateProject((current) => ({ ...current, media: current.media.map((item) => item.path === image.path ? { ...item, alt: event.target.value } : item) }))} placeholder={image.name} /></label><button className="icon-button remove-button" aria-label={`Eliminar imagen ${image.name}`} onClick={() => removeImage(image.path)}>×</button></div>)}</div>}
        </section>
      </div>
    </>
  );

  const renderPreview = () => (
    <>
      <PageHeader eyebrow="Sitio público" title="Vista previa del proyecto" description="Así se organizará el contenido en el sitio público exportado." />
      <ActionButton as="a" variant="outline" className="client-view-link" href={`${import.meta.env.BASE_URL}#/View`} target="_blank" rel="noreferrer">Abrir vista pública</ActionButton>
      <PublicPreview project={project} hideEmpty={hideEmpty} />
    </>
  );

  const renderExport = () => (
    <>
      <PageHeader eyebrow="Paquete listo para publicar" title="Exporta tu proyecto" description="Descarga los JSON por separado o crea un ZIP autónomo con sitio público, imágenes e instrucciones." />
      <div className="export-grid">
        <Surface as="section" variant="card" className="export-card"><div className="export-icon">{"{ }"}</div><h2>Archivos JSON</h2><p>Incluye proyecto, integrantes, objetivos, desarrollo, conclusiones y referencias, sin duplicar el contenido entre archivos.</p><ActionButton variant="outline" disabled={!approved || validationErrors.length > 0} onClick={exportJson}>Descargar JSON · ZIP</ActionButton></Surface>
        <Surface as="article" variant="featured" className="export-card export-featured"><div className="export-icon">⇩</div><span className="recommended">RECOMENDADO</span><h2>Sitio completo en ZIP</h2><p>Página responsive, carga de JSON por <code>fetch()</code>, imágenes, workflow de Pages y guía de publicación.</p><ActionButton disabled={!approved || validationErrors.length > 0} onClick={exportZip}>Generar ZIP del sitio</ActionButton></Surface>
      </div>
      {validationErrors.length > 0 && <Notice tone="danger"><strong>No se puede exportar:</strong> {validationErrors.join(' ')}</Notice>}
      <section className="approval-card">
        <div className="approval-icon">✓</div><div><h2>Revisión y autorización</h2><p>Los archivos de GitHub Pages serán públicos. Revisa nombres, datos personales, permisos de publicación y exactitud del contenido.</p>
          <label className="check-label"><input type="checkbox" checked={approved} onChange={(event) => { const checked = event.target.checked; setApproved(checked); setProject((current) => ({ ...current, updatedAt: new Date().toISOString(), extraction: { ...current.extraction, reviewed: checked, pendingReview: !checked } })); }} /> Confirmo que revisé y autorizo la publicación de este contenido.</label>
          <label className="check-label"><input type="checkbox" checked={includeOriginal} onChange={(event) => setIncludeOriginal(event.target.checked)} disabled={!pdfFile} /> Incluir el PDF original en el ZIP <span>(no recomendado para documentos con datos personales)</span></label>
        </div>
      </section>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderQr = () => (
    <>
      <PageHeader eyebrow="Compartir proyecto" title="Tu proyecto, a un escaneo" description="El QR se crea a partir de la URL pública final. Configura primero el repositorio de GitHub Pages." />
      {!publicUrl && <Notice tone="warning">Configura el usuario y el repositorio en la sección Publicación para generar el QR definitivo.</Notice>}
      <div className="qr-layout">
        <section className="qr-preview-card"><div className="qr-image-wrap">{qrImage ? <img src={qrImage} alt={`Código QR para ${publicUrl}`} /> : <div className="qr-placeholder">▦</div>}</div><h2>{project.title || 'Proyecto escolar'}</h2><p>{qrCaption || 'Escanea para visitar la página del proyecto.'}</p>{publicUrl && <code className="url-chip">{publicUrl}</code>}</section>
        <section className="editor-card qr-controls"><p className="eyebrow">Código descargable</p><h2>Prepara tu QR</h2><label>Texto opcional<textarea rows="3" value={qrCaption} onChange={(event) => setQrCaption(event.target.value)} placeholder="Ej. Escanea para conocer nuestro proyecto" /></label><div className="qr-actions"><button className="button button-primary" disabled={!qrImage} onClick={downloadPng}>Descargar PNG · 1200 px</button><button className="button button-outline" disabled={!publicUrl} onClick={exportQrPdf}>Descargar PDF imprimible</button>{publicUrl && <button className="button button-quiet" onClick={copyUrl}>{copied ? 'Enlace copiado ✓' : 'Copiar enlace público'}</button>}</div><p className="muted-copy">Corrección de errores alta y margen de impresión. El QR apunta a la página pública, no a este administrador.</p></section>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderPublish = () => (
    <>
      <PageHeader eyebrow="GitHub Pages" title="Configura tu publicación" description="El paquete exportado contiene los archivos estáticos y un workflow para publicar desde GitHub Actions." />
      <div className="publish-layout">
        <section className="editor-card"><p className="eyebrow">URL pública</p><h2>Calcula la dirección del sitio</h2><p className="muted-copy">Usa el propietario y el nombre exacto del repositorio donde publicarás el ZIP. Para el repositorio especial usuario.github.io, el sitio se publica en la raíz.</p><div className="publish-fields"><label>Usuario u organización<input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="tu-usuario" autoComplete="off" /></label><label>Repositorio<input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="proyecto-escolar" autoComplete="off" /></label></div>{publicUrl ? <div className="generated-url"><span>URL prevista</span><code>{publicUrl}</code><button className="button button-quiet" onClick={copyUrl}>{copied ? 'Copiado ✓' : 'Copiar'}</button></div> : <p className="validation-hint">Escribe un usuario y un nombre de repositorio válidos para crear el enlace.</p>}</section>
        <section className="editor-card"><p className="eyebrow">Pasos de despliegue</p><h2>Publica en 4 pasos</h2><ol className="publish-steps"><li><span>1</span><div><strong>Descarga el ZIP</strong><p>Desde Exportar archivos, después de aprobar el contenido.</p></div></li><li><span>2</span><div><strong>Descomprime en la raíz</strong><p>Incluye el archivo oculto .github/workflows/pages.yml.</p></div></li><li><span>3</span><div><strong>Sube los cambios</strong><p>Haz push a la rama principal del repositorio público.</p></div></li><li><span>4</span><div><strong>Revisa GitHub Pages</strong><p>En Settings → Pages, selecciona GitHub Actions.</p></div></li></ol></section>
      </div>
      <Notice tone="danger"><strong>Hosting estático sin autenticación.</strong> GitHub Pages no puede proteger este panel ni restringir el acceso al contenido publicado. No almacenes secretos, credenciales ni datos confidenciales aquí.</Notice>
    </>
  );

  const renderPage = () => {
    switch (activePage) {
      case 'import': return renderImport();
      case 'editor': return renderEditor();
      case 'preview': return renderPreview();
      case 'export': return renderExport();
      case 'qr': return renderQr();
      case 'publish': return renderPublish();
      default: return renderHome();
    }
  };

  if (isClientView) return <PublicClientView key={routeHash} hash={routeHash} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage('home')} aria-label="Ir al inicio"><span className="brand-mark">a.</span><span>Aula<small>PROYECTOS ESCOLARES</small></span></button>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav className="main-nav" aria-label="Navegación principal">{navigation.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => setActivePage(item.id)}><span className="nav-icon"><Icon name={item.id} size={19} /></span>{item.label}{item.id === 'editor' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="local-badge"><span /> Procesamiento local</div><p>Tus documentos se quedan en este dispositivo.</p><span className="version-label">AULA · BETA 1.0</span></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb"><span>Proyectos</span><b>/</b><strong>{navigation.find((item) => item.id === activePage)?.label}</strong></div><div className="topbar-right"><span className="privacy-chip"><Icon name="privacy" size={15} /> <span>Solo en este dispositivo</span></span><div className="avatar">A</div></div></header>
        <div className="mobile-brand"><span className="brand-mark">a.</span><span>Aula</span></div>
        <div className="content-area"><div key={activePage} className="page-transition">{renderPage()}</div></div>
      </main>
      {error && activePage !== 'import' && activePage !== 'export' && activePage !== 'qr' && <div className="toast-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Cerrar aviso">×</button></div>}
    </div>
  );
}

export default App;
