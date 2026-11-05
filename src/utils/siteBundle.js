import JSZip from 'jszip';
import { createProjectFiles } from './projectData';
import { DEVELOPER_PROFILE } from './developerProfile';

const publicRuntime = (resourceConfig) => `const root = document.querySelector('#project');
const resourceConfig = ${JSON.stringify(resourceConfig)};
const rawBaseUrl = resourceConfig.rawBaseUrl ? resourceConfig.rawBaseUrl.replace(/\\/+$/, '') + '/' : '';
const rawResourceUrl = path => new URL(path.split('/').map(encodeURIComponent).join('/'), rawBaseUrl).href;
const dataUrl = name => resourceConfig.mode === 'github-raw' ? rawResourceUrl('data/' + name) : './data/' + name;
const imageUrl = image => image.source === 'github-raw' ? rawResourceUrl(image.path) : './' + image.path;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const addText = (parent, tag, text) => {
  if (!text) return;
  String(text).split(/\\n+/).filter(Boolean).forEach(line => parent.append(el(tag, line)));
};
const showError = message => {
  root.replaceChildren(el('p', message, 'error'));
};
const developerProfile = ${JSON.stringify(DEVELOPER_PROFILE)};
async function loadProject() {
  try {
    const response = await fetch(dataUrl('proyecto.json'));
    if (!response.ok) throw new Error('No se encontró data/proyecto.json.');
    const project = await response.json();
    const files = project.content || {};
    const names = ['integrantes', 'objetivos', 'desarrollo', 'conclusiones', 'referencias'];
    const values = await Promise.all(names.map(async name => {
      const fileResponse = await fetch(dataUrl(files[name] || name + '.json'));
      if (!fileResponse.ok) throw new Error('No se pudo cargar ' + files[name] + '.');
      return fileResponse.json();
    }));
    const [authors, objectives, development, conclusions, references] = values;
    const multimedia = files.multimedia
      ? await (async () => {
          const multimediaResponse = await fetch(dataUrl(files.multimedia));
          if (!multimediaResponse.ok) throw new Error('No se pudo cargar ' + files.multimedia + '.');
          return multimediaResponse.json();
        })()
      : { images: project.media || [], videos: project.videos || [] };
    const images = (multimedia.images || project.media || []).filter(item => item.path).sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.order || 0) - (b.order || 0));
    const videos = (multimedia.videos || project.videos || []).slice().sort((a, b) => a.order - b.order);
    document.title = project.title || 'Proyecto escolar';
    const header = el('header', undefined, 'hero');
    header.append(el('span', project.institution || 'Proyecto escolar', 'eyebrow'));
    header.append(el('h1', project.title || 'Proyecto sin título'));
    addText(header, 'p', project.description || project.summary);
    if (authors.integrantes.length) {
      const people = el('p', 'Por ' + authors.integrantes.map(person => person.name).join(', '), 'byline');
      header.append(people);
    }
    root.replaceChildren(header);
    const nav = el('nav', undefined, 'toc');
    nav.setAttribute('aria-label', 'Navegación por secciones');
    const sections = [];
    if (objectives.general || objectives.specific.length) sections.push(['objetivos', 'Objetivos']);
    development.sections.forEach(section => {
      if (section.content || !project.hideEmptySections) sections.push([section.id, section.title]);
    });
    if (conclusions.items.length) sections.push(['conclusiones', 'Conclusiones']);
    if ((development.recommendations || []).length) sections.push(['recomendaciones', 'Recomendaciones']);
    if (references.items.length) sections.push(['referencias', 'Referencias']);
    if (images.length) sections.push(['project-gallery', 'Galería']);
    if (videos.length) sections.push(['project-videos', 'Videos']);
    sections.forEach(([id, title]) => {
      const link = el('a', title);
      link.href = '#' + id;
      nav.append(link);
    });
    root.append(nav);
    const content = el('main', undefined, 'content');
    if (objectives.general || objectives.specific.length) {
      const section = el('section', undefined, 'card');
      section.id = 'objetivos';
      section.append(el('h2', 'Objetivos'));
      addText(section, 'p', objectives.general);
      if (objectives.specific.length) {
        const list = el('ul');
        objectives.specific.forEach(item => list.append(el('li', item)));
        section.append(list);
      }
      content.append(section);
    }
    development.sections.filter(section => section.content || !project.hideEmptySections).forEach(item => {
      const section = el('details', undefined, 'card');
      section.open = true;
      section.id = item.id;
      section.append(el('summary', item.title));
      if (item.content) addText(section, 'p', item.content);
      else section.append(el('p', 'Contenido pendiente de revisión.', 'pending'));
      content.append(section);
    });
    (development.tables || []).forEach(table => {
      const section = el('section', undefined, 'card');
      section.append(el('h2', table.title || 'Tabla'));
      const wrapper = el('div', undefined, 'table-scroll');
      const element = document.createElement('table');
      table.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const cellElement = document.createElement(rowIndex === 0 ? 'th' : 'td');
          cellElement.textContent = cell;
          tr.append(cellElement);
        });
        element.append(tr);
      });
      wrapper.append(element);
      section.append(wrapper);
      content.append(section);
    });
    if ((development.recommendations || []).length) {
      const section = el('section', undefined, 'card');
      section.id = 'recomendaciones';
      section.append(el('h2', 'Recomendaciones'));
      const list = el('ul');
      development.recommendations.forEach(item => list.append(el('li', item)));
      section.append(list);
      content.append(section);
    }
    if (conclusions.items.length) {
      const section = el('section', undefined, 'card');
      section.id = 'conclusiones';
      section.append(el('h2', 'Conclusiones'));
      const list = el('ul');
      conclusions.items.forEach(item => list.append(el('li', item)));
      section.append(list);
      content.append(section);
    }
    if (references.items.length) {
      const section = el('section', undefined, 'card');
      section.id = 'referencias';
      section.append(el('h2', 'Referencias'));
      const list = el('ul');
      references.items.forEach(item => list.append(el('li', item)));
      section.append(list);
      content.append(section);
    }
    const gallery = images;
    if (gallery.length) {
      const section = el('section', undefined, 'card gallery');
      section.id = 'project-gallery';
      section.append(el('h2', 'Galería'));
      gallery.forEach((item, index) => {
        const figure = el('figure');
        const button = el('button', undefined, 'gallery-image-button');
        const image = document.createElement('img');
        image.src = imageUrl(item);
        image.alt = item.alt || item.title || item.name || 'Imagen del proyecto';
        image.loading = 'lazy';
        image.decoding = 'async';
        button.append(image);
        button.addEventListener('click', () => openGallery(index));
        figure.append(button);
        if (item.title) figure.append(el('strong', item.title));
        if (item.description) figure.append(el('figcaption', item.description));
        else if (item.alt) figure.append(el('figcaption', item.alt));
        if (item.section) figure.append(el('small', 'Sección: ' + item.section));
        section.append(figure);
      });
      content.append(section);
    }
    if (videos.length) {
      const section = el('section', undefined, 'card video-gallery');
      section.id = 'project-videos';
      section.append(el('h2', 'Videos del proyecto'));
      videos.forEach(video => {
        const parsed = parseYouTube(video.url);
        if (!parsed) return;
        const card = el('article', undefined, 'video-card');
        if (video.title) card.append(el('h3', video.title));
        if (video.description) card.append(el('p', video.description));
        const frame = el('div', undefined, 'video-frame');
        const loading = el('span', 'Cargando reproductor…', 'video-loading');
        const iframe = document.createElement('iframe');
        iframe.src = parsed;
        iframe.title = video.title || 'Video de YouTube';
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;
        iframe.addEventListener('load', () => loading.remove(), { once: true });
        iframe.addEventListener('error', () => { loading.textContent = 'No se pudo cargar el reproductor.'; }, { once: true });
        frame.append(loading, iframe);
        card.append(frame);
        const original = el('a', 'Abrir video original ↗');
        original.href = video.url;
        original.target = '_blank';
        original.rel = 'noopener noreferrer';
        card.append(original);
        section.append(card);
      });
      if (section.querySelector('iframe')) content.append(section);
    }
    root.append(content);
    const footer = el('footer', undefined, 'developer-credit');
    const credit = el('div', undefined, 'developer-credit-inner');
    const identity = el('div', undefined, 'developer-identity');
    identity.append(el('p', 'Créditos', 'developer-credit-kicker'));
    identity.append(el('p', 'Desarrollado por', 'developer-credit-title'));
    identity.append(el('strong', developerProfile.name));
    const links = el('nav', undefined, 'developer-links');
    links.setAttribute('aria-label', 'Enlaces del desarrollador');
    developerProfile.links.forEach(({ label, href }) => {
      const link = el('a', label + ' ↗');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    });
    credit.append(identity, links);
    footer.append(credit);
    root.append(footer);
  } catch (error) {
    showError('No se pudo cargar el proyecto. ' + error.message);
  }
}
function parseYouTube(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) return '';
    let id = '';
    if (url.hostname.endsWith('youtu.be')) id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else id = url.pathname.match(/^\\/(?:shorts|embed)\\/([^/]+)\\/?$/)?.[1] || '';
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : '';
  } catch {
    return '';
  }
}
let galleryImages = [];
let galleryIndex = 0;
function openGallery(index) {
  galleryImages = [...document.querySelectorAll('.gallery figure')];
  galleryIndex = index;
  const dialog = document.querySelector('#image-lightbox');
  if (!dialog) return;
  renderGalleryImage();
  if (!dialog.open) dialog.showModal();
}
function renderGalleryImage() {
  const dialog = document.querySelector('#image-lightbox');
  const figure = galleryImages[galleryIndex];
  if (!dialog || !figure) return;
  const thumbnail = figure.querySelector('img');
  const image = dialog.querySelector('img');
  image.src = thumbnail.src;
  image.alt = thumbnail.alt;
  dialog.querySelector('.lightbox-caption').textContent = figure.querySelector('strong')?.textContent || thumbnail.alt;
  dialog.querySelector('.lightbox-position').textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
}
function moveGallery(offset) {
  if (!galleryImages.length) return;
  galleryIndex = (galleryIndex + offset + galleryImages.length) % galleryImages.length;
  renderGalleryImage();
}
loadProject();
`;

const publicStyles = `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172238;background:#f4f6fb;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0}.hero{padding:clamp(3rem,9vw,7rem) max(1.25rem,calc((100vw - 860px)/2));background:linear-gradient(135deg,#102b52,#225c86);color:#fff}.hero h1{max-width:850px;margin:.7rem 0;font-size:clamp(2rem,6vw,4.5rem);line-height:1.04;letter-spacing:-.04em}.hero p{max-width:720px;color:#dce9f5;line-height:1.75}.eyebrow{font-size:.76rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#b5dbde}.byline{font-size:.9rem}.toc{position:sticky;top:0;z-index:1;display:flex;gap:.5rem;overflow:auto;padding:.9rem max(1rem,calc((100vw - 900px)/2));background:#fff;border-bottom:1px solid #e8ebf1}.toc a{flex:none;padding:.55rem .8rem;border-radius:99px;color:#315b78;text-decoration:none;font-size:.85rem}.toc a:hover,.toc a:focus-visible{background:#e8f4f4;outline:none}.content{max-width:900px;margin:2.5rem auto;padding:0 1.25rem 4rem;display:grid;gap:1rem}.card{padding:clamp(1.2rem,4vw,2rem);border:1px solid #e8ebf1;border-radius:18px;background:#fff;box-shadow:0 10px 30px #152b4d0a;line-height:1.8}.card h2{margin-top:0;font-size:1.35rem}.card p{white-space:pre-wrap;color:#49586e}.card p.pending{color:#8a97a6;font-style:italic}.card summary{cursor:pointer;font-size:1.15rem;font-weight:700}.card ul{padding-left:1.3rem}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.gallery h2{grid-column:1/-1}.gallery figure{min-width:0;margin:0}.gallery-image-button{display:block;width:100%;padding:0;border:0;border-radius:12px;background:transparent;cursor:zoom-in}.gallery img{width:100%;height:220px;object-fit:cover;border-radius:12px}.gallery strong,.gallery figcaption,.gallery small{display:block;margin-top:.35rem;color:#59677a;font-size:.85rem}.video-gallery{display:grid;gap:1rem}.video-gallery h2{margin-bottom:0}.video-card{min-width:0}.video-frame{position:relative;overflow:hidden;width:100%;aspect-ratio:16/9;border-radius:12px;background:#101820}.video-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.video-loading{position:absolute;inset:0;display:grid;place-items:center;color:#fff}.video-card>a{display:inline-block;margin-top:.6rem;color:#315b78}.lightbox{position:fixed;max-width:min(96vw,1100px);max-height:92vh;padding:48px 56px 20px;border:0;border-radius:14px;background:#101820;color:#fff}.lightbox::backdrop{background:rgb(8 15 24 / 85%)}.lightbox img{display:block;max-width:100%;max-height:72vh;margin:auto;object-fit:contain}.lightbox button{position:absolute;border:0;border-radius:50%;background:#ffffffdd;color:#172238;font-size:28px;cursor:pointer}.lightbox-close{top:10px;right:10px;width:40px;height:40px}.lightbox-previous,.lightbox-next{top:50%;width:40px;height:48px;transform:translateY(-50%)}.lightbox-previous{left:8px}.lightbox-next{right:8px}.lightbox-caption,.lightbox-position{text-align:center}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{padding:.55rem .7rem;border:1px solid #dfe6ed;text-align:left}th{background:#f2f6f7}.error{max-width:700px;margin:4rem auto;padding:2rem;color:#8d2834;background:#fff;border-radius:12px}@media(max-width:600px){.hero{padding-top:3rem;padding-bottom:3rem}.content{margin-top:1rem}.toc{padding:.7rem}.lightbox{width:96vw;padding:48px 40px 15px}}@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}.card{animation:rise .35s ease both}@keyframes rise{from{opacity:.5;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}`;
const developerStyles = `.developer-credit{padding:2rem max(1.25rem,calc((100vw - 900px)/2));background:#203d32;color:#fffdf0}.developer-credit-inner{display:flex;max-width:900px;align-items:center;justify-content:space-between;gap:1.5rem;margin:auto}.developer-credit-kicker{margin:0 0 .45rem;color:#d7dd76;font-size:.65rem;font-weight:750;letter-spacing:.14em;text-transform:uppercase}.developer-credit-title{margin:0 0 .2rem;color:#d2dbd0;font-size:.8rem}.developer-identity strong{font-family:Georgia,"Times New Roman",serif;font-size:1.45rem;letter-spacing:-.025em}.developer-links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.55rem}.developer-links a{display:inline-flex;min-height:36px;align-items:center;gap:.4rem;padding:0 .8rem;border:1px solid rgb(239 240 106 / 30%);border-radius:999px;color:#f0efcf;font-size:.72rem;text-decoration:none;transition:color .18s ease,background .18s ease,border-color .18s ease}.developer-links a:hover{border-color:#eff06a;background:#eff06a;color:#243d31}@media(max-width:600px){.developer-credit-inner{align-items:flex-start;flex-direction:column;gap:1rem}.developer-links{justify-content:flex-start}}@media(prefers-reduced-motion:reduce){.developer-links a{transition:none}}`;

const publicHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Proyecto escolar publicado como sitio estático." />
    <title>Proyecto escolar</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="project" aria-live="polite"><p class="error">Cargando proyecto…</p></div>
    <dialog id="image-lightbox" class="lightbox" aria-label="Vista ampliada de la galería">
      <button class="lightbox-close" type="button" aria-label="Cerrar">×</button>
      <button class="lightbox-previous" type="button" aria-label="Imagen anterior">‹</button>
      <img alt="" />
      <button class="lightbox-next" type="button" aria-label="Imagen siguiente">›</button>
      <p class="lightbox-caption"></p><small class="lightbox-position"></small>
    </dialog>
    <script>
      document.querySelector('.lightbox-close').addEventListener('click', () => document.querySelector('#image-lightbox').close());
      document.querySelector('.lightbox-previous').addEventListener('click', () => moveGallery(-1));
      document.querySelector('.lightbox-next').addEventListener('click', () => moveGallery(1));
      document.querySelector('#image-lightbox').addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') moveGallery(-1);
        if (event.key === 'ArrowRight') moveGallery(1);
      });
    </script>
    <script src="./app.js" defer></script>
  </body>
</html>
`;

function assertBundledImages(project, imageFiles) {
  for (const image of project.media) {
    if (image.source === 'github-raw') continue;
    if (!imageFiles[image.path]) {
      throw new Error(`Falta el archivo local de la imagen "${image.title || image.name}": ${image.path}. No se exportaron referencias rotas.`);
    }
  }
}

function addLocalImages(zip, project, imageFiles) {
  for (const image of project.media) {
    if (image.source !== 'github-raw') zip.file(`public/${image.path}`, imageFiles[image.path]);
  }
}

export async function createSiteZip(project, imageFiles = {}, originalFile = null, { hideEmptySections = true } = {}) {
  assertBundledImages(project, imageFiles);
  const zip = new JSZip();
  const jsonFiles = createProjectFiles(project, { includeOriginal: Boolean(originalFile), hideEmptySections });
  zip.file('public/index.html', publicHtml);
  zip.file('public/app.js', publicRuntime(project.resourceConfig || { mode: 'local', rawBaseUrl: '' }));
  zip.file('public/styles.css', `${publicStyles}${developerStyles}`);
  Object.entries(jsonFiles).forEach(([name, content]) => zip.file(`public/data/${name}`, content));
  zip.folder('public/images/proyecto');

  addLocalImages(zip, project, imageFiles);
  if (originalFile) {
    const safeName = originalFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^\.+/, '') || 'documento.pdf';
    zip.file(`public/documents/${safeName}`, originalFile);
  }

  zip.file('README.md', `# Publicación del proyecto escolar

1. Crea un repositorio público en GitHub. Este paquete es un sitio estático; no contiene credenciales ni protege contenido privado.
2. Descomprime todos los archivos de este paquete en la raíz del repositorio. Conserva la carpeta \`.github/workflows\`.
3. Revisa \`public/data/\`, especialmente los nombres y demás datos personales de estudiantes. El documento PDF original solo se incluye si lo solicitaste.
4. Confirma los archivos y súbelos a la rama principal:

\`\`\`sh
git add .
git commit -m "Publicar proyecto escolar"
git push
\`\`\`

5. En GitHub Pages abre **Settings → Pages** y elige **GitHub Actions** si no quedó seleccionado automáticamente. El flujo \`.github/workflows/pages.yml\` publica la carpeta \`public/\` como raíz del sitio.
6. La URL será \`https://<usuario>.github.io/<repositorio>/\` (o la raíz para el repositorio \`<usuario>.github.io\`). Configura esa URL en el generador para crear el QR definitivo.

Los PDF se procesan en el navegador; nunca se envían a este sitio. La aplicación no tiene autenticación de administrador: cualquier información publicada en Pages será pública.
`);
  zip.file('.github/workflows/pages.yml', `name: Publish project site
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./public
      - id: deployment
        uses: actions/deploy-pages@v4
`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function createJsonZip(project, imageFiles = {}, { hideEmptySections = true } = {}) {
  assertBundledImages(project, imageFiles);
  const zip = new JSZip();
  Object.entries(createProjectFiles(project, { hideEmptySections })).forEach(([name, content]) => zip.file(`public/data/${name}`, content));
  addLocalImages(zip, project, imageFiles);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
