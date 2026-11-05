import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { MAX_PDF_SIZE, createEmptyProject, extractProjectFromText, validateProject, buildPagesUrl } from './utils/projectData';

const navigation = [
  { id: 'home', label: 'Inicio', icon: '⌂' },
  { id: 'import', label: 'Importar PDF', icon: '↥' },
  { id: 'editor', label: 'Editor de información', icon: '✎' },
  { id: 'preview', label: 'Vista previa', icon: '◉' },
  { id: 'export', label: 'Exportar archivos', icon: '⇩' },
  { id: 'qr', label: 'Generador QR', icon: '▦' },
  { id: 'publish', label: 'Publicación', icon: '↗' },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function PublicPreview({ project, hideEmpty = true }) {
  const visibleSections = project.sections.filter((section) => !hideEmpty || section.content.trim());
  const hasGoals = project.objectives.general || project.objectives.specific.some(Boolean);
  const hasContent = project.summary || hasGoals || visibleSections.length || project.conclusions.some(Boolean) || project.recommendations.some(Boolean) || project.references.some(Boolean) || project.media.length;
  return (
    <div className="public-preview">
      <header className="preview-hero">
        <p className="eyebrow">{project.institution || 'Proyecto escolar'}</p>
        <h2>{project.title || 'Título del proyecto'}</h2>
        {project.description && <p>{project.description}</p>}
        {!project.description && project.summary && <p>{project.summary}</p>}
        {project.authors.length > 0 && <span className="preview-byline">Por {project.authors.map((author) => author.name).filter(Boolean).join(', ')}</span>}
      </header>
      <div className="preview-content">
        {!hasContent && <p className="empty-state">Todavía no hay contenido para mostrar. Importa un PDF o completa el editor.</p>}
        {project.objectives.general && <article className="preview-card"><h3>Objetivo general</h3><p>{project.objectives.general}</p></article>}
        {project.objectives.specific.filter(Boolean).length > 0 && (
          <article className="preview-card"><h3>Objetivos específicos</h3><ul>{project.objectives.specific.filter(Boolean).map((objective, index) => <li key={index}>{objective}</li>)}</ul></article>
        )}
        {project.tables.map((table) => <article className="preview-card" key={table.id}><h3>{table.title}</h3><div className="table-scroll"><table><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} scope="col">{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></article>)}
        {visibleSections.map((section) => (
          <details className="preview-card" open key={section.id}>
            <summary>{section.title}</summary>
            <p>{section.content || 'Contenido pendiente de revisión.'}</p>
          </details>
        ))}
        {project.conclusions.filter(Boolean).length > 0 && (
          <article className="preview-card"><h3>Conclusiones</h3><ul>{project.conclusions.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul></article>
        )}
        {project.recommendations.filter(Boolean).length > 0 && (
          <article className="preview-card"><h3>Recomendaciones</h3><ul>{project.recommendations.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul></article>
        )}
        {project.references.filter(Boolean).length > 0 && (
          <article className="preview-card"><h3>Referencias</h3><ul>{project.references.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul></article>
        )}
        {project.media.length > 0 && (
          <article className="preview-card"><h3>Galería de imágenes</h3><div className="image-grid">
            {project.media.map((image) => <figure key={image.path}><img src={image.preview} alt={image.alt || image.name} /><figcaption>{image.alt || image.name}</figcaption></figure>)}
          </div></article>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('home');
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
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-icon">✦</span>
          <p className="eyebrow">De documento a experiencia web</p>
          <h2>Un proyecto escolar, listo para compartir.</h2>
          <p>Extrae, organiza y revisa el contenido de tu documento antes de publicarlo como un sitio estático con su propio código QR.</p>
          <button className="button button-light" onClick={() => inputRef.current?.click()}>Importar un PDF <span aria-hidden="true">→</span></button>
        </div>
        <div className="welcome-orbit" aria-hidden="true"><div className="orbit-card orbit-document">PDF <small>proyecto.pdf</small></div><div className="orbit-card orbit-web">↗ <small>sitio web</small></div><div className="orbit-card orbit-qr">▦</div><div className="orbit-center">A</div></div>
      </section>
      <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => processFile(event.target.files?.[0])} />
      <div className="stats-grid">
        <article className="stat-card"><span>01</span><strong>{project.extraction.pageCount || '—'}</strong><p>Páginas procesadas</p></article>
        <article className="stat-card"><span>02</span><strong>{project.sections.filter((item) => item.content).length}</strong><p>Secciones con contenido</p></article>
        <article className="stat-card"><span>03</span><strong>{project.media.length}</strong><p>Imágenes añadidas</p></article>
        <article className="stat-card"><span>04</span><strong>{pendingCount}</strong><p>Datos por revisar</p></article>
      </div>
      <section className="steps-section">
        <div className="section-heading"><div><p className="eyebrow">Flujo de trabajo</p><h2>Del PDF a tu página pública</h2></div></div>
        <div className="steps-grid">{[['01', 'Importa', 'Procesa el PDF en tu navegador.'], ['02', 'Revisa', 'Corrige cada dato antes de publicarlo.'], ['03', 'Exporta', 'Descarga la página y publícala en GitHub Pages.']].map(([number, title, text]) => <article className="step-card" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
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
        <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => processFile(event.target.files?.[0])} />
        <span className="upload-icon">↑</span>
        <h2>Arrastra aquí tu PDF</h2>
        <p>o selecciona un archivo desde tu dispositivo</p>
        <button className="button button-primary" disabled={processing} onClick={() => inputRef.current?.click()}>Elegir documento</button>
        <small>PDF · máximo 50 MB · procesa texto y OCR localmente</small>
      </section>
      {pdfFile && <div className="file-card"><div className="file-icon">PDF</div><div><strong>{pdfFile.name}</strong><p>{(pdfFile.size / 1024 / 1024).toFixed(2)} MB · {project.extraction.pageCount || 'páginas por detectar'}</p></div><span className={`status-pill ${processing ? 'status-running' : processingCancelled ? 'status-running' : 'status-ready'}`}>{processing ? 'Procesando' : processingCancelled ? 'Cancelado' : 'Listo'}</span></div>}
      {processing && <section className="progress-card"><div className="progress-top"><strong>{progress?.phase === 'ocr' ? 'Reconociendo texto con OCR…' : 'Extrayendo texto…'}</strong><span>{progress?.page ? `Página ${progress.page} de ${progress.total}` : 'Preparando documento'}</span></div><div className="progress-track"><div style={{ width: progress?.total ? `${Math.max(3, (progress.page / progress.total) * 100)}%` : '4%' }} /></div><div className="progress-bottom"><span>{progress?.status || 'El archivo permanece en este dispositivo.'}</span><button className="button button-quiet" onClick={() => { cancelRef.current = true; }}>Cancelar proceso</button></div></section>}
      {project.extraction.pageCount > 0 && !processing && <Notice tone="success">Extracción completada en {project.extraction.pageCount} páginas. OCR aplicado en {project.extraction.ocrPages.length} páginas.</Notice>}
      <Notice>PDF.js y Tesseract se ejecutan en el navegador. El motor y los datos de idioma de OCR pueden descargarse desde una CDN; el documento no se envía a ningún servidor.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}
    </>
  );

  const renderEditor = () => (
    <>
      <PageHeader eyebrow="Revisión editorial" title="Editor de información" description="Verifica y corrige el texto detectado. Los campos vacíos quedan pendientes: no se completa contenido automáticamente." />
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
          <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={handleImageFiles} />
          <button className="button button-outline" onClick={() => imageInputRef.current?.click()}>＋ Añadir imágenes</button>
          {project.media.length > 0 && <div className="media-list">{project.media.map((image) => <div className="media-row" key={image.path}><img src={image.preview} alt="" /><label className="grow">Texto alternativo<input value={image.alt} onChange={(event) => updateProject((current) => ({ ...current, media: current.media.map((item) => item.path === image.path ? { ...item, alt: event.target.value } : item) }))} placeholder={image.name} /></label><button className="icon-button remove-button" aria-label={`Eliminar imagen ${image.name}`} onClick={() => removeImage(image.path)}>×</button></div>)}</div>}
        </section>
      </div>
    </>
  );

  const renderPreview = () => (
    <>
      <PageHeader eyebrow="Sitio público" title="Vista previa del proyecto" description="Así se organizará el contenido en el sitio público exportado." />
      <PublicPreview project={project} hideEmpty={hideEmpty} />
    </>
  );

  const renderExport = () => (
    <>
      <PageHeader eyebrow="Paquete listo para publicar" title="Exporta tu proyecto" description="Descarga los JSON por separado o crea un ZIP autónomo con sitio público, imágenes e instrucciones." />
      <div className="export-grid">
        <article className="export-card"><div className="export-icon">{"{ }"}</div><h2>Archivos JSON</h2><p>Incluye proyecto, integrantes, objetivos, desarrollo, conclusiones y referencias, sin duplicar el contenido entre archivos.</p><button className="button button-outline" disabled={!approved || validationErrors.length > 0} onClick={exportJson}>Descargar JSON · ZIP</button></article>
        <article className="export-card export-featured"><div className="export-icon">⇩</div><span className="recommended">RECOMENDADO</span><h2>Sitio completo en ZIP</h2><p>Página responsive, carga de JSON por <code>fetch()</code>, imágenes, workflow de Pages y guía de publicación.</p><button className="button button-primary" disabled={!approved || validationErrors.length > 0} onClick={exportZip}>Generar ZIP del sitio</button></article>
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage('home')} aria-label="Ir al inicio"><span className="brand-mark">a.</span><span>Aula<small>PROYECTOS ESCOLARES</small></span></button>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav className="main-nav" aria-label="Navegación principal">{navigation.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} onClick={() => setActivePage(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === 'editor' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="local-badge"><span /> Procesamiento local</div><p>Tus documentos se quedan en este dispositivo.</p><span className="version-label">AULA · BETA 1.0</span></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb"><span>Proyectos</span><b>/</b><strong>{navigation.find((item) => item.id === activePage)?.label}</strong></div><div className="topbar-right"><span className="privacy-chip">⌑ <span>Solo en este dispositivo</span></span><div className="avatar">A</div></div></header>
        <div className="mobile-brand"><span className="brand-mark">a.</span><span>Aula</span></div>
        <div className="content-area">{renderPage()}</div>
      </main>
      {error && activePage !== 'import' && activePage !== 'export' && activePage !== 'qr' && <div className="toast-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Cerrar aviso">×</button></div>}
    </div>
  );
}

export default App;
