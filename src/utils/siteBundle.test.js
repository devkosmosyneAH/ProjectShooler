import JSZip from 'jszip';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEmptyProject, createProjectFiles } from './projectData';
import { createJsonZip, createSiteZip } from './siteBundle';

function sampleProject() {
  const project = createEmptyProject();
  project.projectId = 'proyecto-prueba';
  project.title = '<img src=x onerror=alert(1)> Proyecto';
  project.description = 'Descripción pública';
  project.institution = 'Escuela';
  project.authors = [{ id: 'a1', name: 'Ana' }];
  project.sections[0].content = 'Introducción visible';
  project.objectives.general = 'Objetivo de prueba';
  project.conclusions = ['Conclusión de prueba'];
  project.recommendations = ['Recomendación de prueba'];
  project.references = ['Referencia de prueba'];
  return project;
}

describe('static site and JSON exports', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  test('creates a publishable site archive with JSON data and workflow', async () => {
    const zipBlob = await createSiteZip(sampleProject());
    const zip = await JSZip.loadAsync(zipBlob);
    const projectJson = JSON.parse(await zip.file('public/data/proyecto.json').async('string'));

    expect(zip.file('public/index.html')).not.toBeNull();
    expect(zip.file('public/app.js')).not.toBeNull();
    expect(zip.file('public/styles.css')).not.toBeNull();
    expect(zip.files['public/images/proyecto/']?.dir).toBe(true);
    expect(zip.file('.github/workflows/pages.yml')).not.toBeNull();
    expect(projectJson.content.desarrollo).toBe('desarrollo.json');
    expect(await zip.file('README.md').async('string')).toContain('GitHub Pages');
  });

  test('public page fetches its JSON resources and renders text as text, not markup', async () => {
    const project = sampleProject();
    const files = createProjectFiles(project);
    const zip = await JSZip.loadAsync(await createSiteZip(project));
    const runtime = await zip.file('public/app.js').async('string');
    const resources = {
      './data/proyecto.json': files['proyecto.json'],
      ...Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'proyecto.json').map(([name, value]) => [`./data/${name}`, value])),
    };
    globalThis.fetch = vi.fn(async (url) => ({
      ok: Boolean(resources[url]),
      json: async () => JSON.parse(resources[url]),
    }));
    document.body.innerHTML = '<div id="project"></div>';
    const execute = new Function(runtime.replace(/\nloadProject\(\);\s*$/, '\nreturn loadProject();'));

    await execute();

    const root = document.querySelector('#project');
    expect(root.querySelector('h1').textContent).toBe(project.title);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('Introducción visible');
    expect(root.textContent).toContain('Conclusión de prueba');
    expect(root.textContent).toContain('Recomendación de prueba');
    expect(root.querySelector('.developer-credit').textContent).toContain('Cordova Anthony');
    const developerLinks = [...root.querySelectorAll('.developer-links a')];
    expect(developerLinks.map((link) => link.href)).toEqual([
      'https://devkosmosyneah.github.io/devkosmosyne-website/',
      'https://github.com/18-anth',
      'https://18-anth.github.io/CV_Anth/',
      'https://www.linkedin.com/in/anthony-c-a12928111/',
    ]);
    expect(developerLinks.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer')).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith('./data/proyecto.json');
  });

  test('creates a data-only ZIP with the six JSON documents', async () => {
    const zip = await JSZip.loadAsync(await createJsonZip(sampleProject()));
    expect(Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()).toEqual([
      'public/data/conclusiones.json',
      'public/data/desarrollo.json',
      'public/data/integrantes.json',
      'public/data/objetivos.json',
      'public/data/proyecto.json',
      'public/data/referencias.json',
    ]);
  });

  test('records whether empty public sections should be hidden', async () => {
    const zip = await JSZip.loadAsync(await createSiteZip(sampleProject(), {}, null, { hideEmptySections: false }));
    const main = JSON.parse(await zip.file('public/data/proyecto.json').async('string'));
    expect(main.hideEmptySections).toBe(false);
    expect(await zip.file('public/app.js').async('string')).toContain('!project.hideEmptySections');
  });

  test('references the original document only when it is included in the archive', async () => {
    const project = sampleProject();
    project.extraction.sourceFileName = 'school.pdf';
    const original = new File(['PDF bytes'], 'school.pdf', { type: 'application/pdf' });
    const zip = await JSZip.loadAsync(await createSiteZip(project, {}, original));
    const main = JSON.parse(await zip.file('public/data/proyecto.json').async('string'));
    expect(main.originalDocument.path).toBe('documents/school.pdf');
    expect(zip.file('public/documents/school.pdf')).not.toBeNull();
  });
});
