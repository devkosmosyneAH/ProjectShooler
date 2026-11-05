import JSZip from 'jszip';
import { createProjectFiles } from './projectData';
import { DEVELOPER_PROFILE } from './developerProfile';

const publicRuntime = `const root = document.querySelector('#project');
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
    const response = await fetch('./data/proyecto.json');
    if (!response.ok) throw new Error('No se encontró data/proyecto.json.');
    const project = await response.json();
    const files = project.content;
    const names = ['integrantes', 'objetivos', 'desarrollo', 'conclusiones', 'referencias'];
    const values = await Promise.all(names.map(async name => {
      const fileResponse = await fetch('./data/' + files[name]);
      if (!fileResponse.ok) throw new Error('No se pudo cargar ' + files[name] + '.');
      return fileResponse.json();
    }));
    const [authors, objectives, development, conclusions, references] = values;
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
    const gallery = project.media.filter(item => item.path);
    if (gallery.length) {
      const section = el('section', undefined, 'card gallery');
      section.append(el('h2', 'Galería'));
      gallery.forEach(item => {
        const figure = el('figure');
        const image = document.createElement('img');
        image.src = item.path;
        image.alt = item.alt || item.name || 'Imagen del proyecto';
        figure.append(image);
        if (item.alt) figure.append(el('figcaption', item.alt));
        section.append(figure);
      });
      content.append(section);
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
loadProject();
`;

const publicStyles = `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172238;background:#f4f6fb;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0}.hero{padding:clamp(3rem,9vw,7rem) max(1.25rem,calc((100vw - 860px)/2));background:linear-gradient(135deg,#102b52,#225c86);color:#fff}.hero h1{max-width:850px;margin:.7rem 0;font-size:clamp(2rem,6vw,4.5rem);line-height:1.04;letter-spacing:-.04em}.hero p{max-width:720px;color:#dce9f5;line-height:1.75}.eyebrow{font-size:.76rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#b5dbde}.byline{font-size:.9rem}.toc{position:sticky;top:0;z-index:1;display:flex;gap:.5rem;overflow:auto;padding:.9rem max(1rem,calc((100vw - 900px)/2));background:#fff;border-bottom:1px solid #e8ebf1}.toc a{flex:none;padding:.55rem .8rem;border-radius:99px;color:#315b78;text-decoration:none;font-size:.85rem}.toc a:hover,.toc a:focus-visible{background:#e8f4f4;outline:none}.content{max-width:900px;margin:2.5rem auto;padding:0 1.25rem 4rem;display:grid;gap:1rem}.card{padding:clamp(1.2rem,4vw,2rem);border:1px solid #e8ebf1;border-radius:18px;background:#fff;box-shadow:0 10px 30px #152b4d0a;line-height:1.8}.card h2{margin-top:0;font-size:1.35rem}.card p{white-space:pre-wrap;color:#49586e}.card p.pending{color:#8a97a6;font-style:italic}.card summary{cursor:pointer;font-size:1.15rem;font-weight:700}.card ul{padding-left:1.3rem}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.gallery h2{grid-column:1/-1}.gallery figure{margin:0}.gallery img{width:100%;height:220px;object-fit:cover;border-radius:12px}.gallery figcaption{font-size:.85rem;color:#59677a}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{padding:.55rem .7rem;border:1px solid #dfe6ed;text-align:left}th{background:#f2f6f7}.error{max-width:700px;margin:4rem auto;padding:2rem;color:#8d2834;background:#fff;border-radius:12px}@media(max-width:600px){.hero{padding-top:3rem;padding-bottom:3rem}.content{margin-top:1rem}.toc{padding:.7rem}}@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}.card{animation:rise .35s ease both}@keyframes rise{from{opacity:.5;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}`;
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
    <script src="./app.js" defer></script>
  </body>
</html>
`;

export async function createSiteZip(project, imageFiles = {}, originalFile = null, { hideEmptySections = true } = {}) {
  const zip = new JSZip();
  const jsonFiles = createProjectFiles(project, { includeOriginal: Boolean(originalFile), hideEmptySections });
  zip.file('public/index.html', publicHtml);
  zip.file('public/app.js', publicRuntime);
  zip.file('public/styles.css', `${publicStyles}${developerStyles}`);
  Object.entries(jsonFiles).forEach(([name, content]) => zip.file(`public/data/${name}`, content));
  zip.folder('public/images/proyecto');

  for (const media of project.media) {
    const file = imageFiles[media.path];
    if (file) zip.file(`public/${media.path}`, file);
  }
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

export async function createJsonZip(project, { hideEmptySections = true } = {}) {
  const zip = new JSZip();
  Object.entries(createProjectFiles(project, { hideEmptySections })).forEach(([name, content]) => zip.file(`public/data/${name}`, content));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
