import {
  buildPagesUrl,
  createEmptyProject,
  createProjectFiles,
  extractProjectFromText,
  validateProject,
} from './projectData';

describe('project extraction and JSON model', () => {
  test('extracts labelled fields and sections without inventing missing content', () => {
    const project = extractProjectFromText([
      'Título: Huerto escolar',
      'Institución: Escuela Central',
      'Autores: Ana Pérez, Luis Díaz',
      'Descripción: Cultivo sostenible.',
      'Resumen',
      'El proyecto estudia el cultivo en la escuela.',
      'Introducción',
      'El huerto permite aprender ciencias.',
      'Objetivo general: Diseñar un huerto educativo.',
      'Objetivos específicos:',
      '1. Identificar plantas apropiadas.',
      'Conclusiones',
      'La comunidad participó.',
      'Recomendaciones',
      'Regar cada semana.',
      'Bibliografía',
      'García, A. (2024). Agricultura.',
      'Resultados',
      'Producción registrada por temporada.',
    ].join('\n'), 'huerto.pdf', 4, [2]);

    expect(project.title).toBe('Huerto escolar');
    expect(project.institution).toBe('Escuela Central');
    expect(project.authors.map(({ name }) => name)).toEqual(['Ana Pérez', 'Luis Díaz']);
    expect(project.objectives.general).toBe('Diseñar un huerto educativo.');
    expect(project.objectives.specific).toEqual(['Identificar plantas apropiadas.']);
    expect(project.sections.find(({ id }) => id === 'introduction').content).toContain('El huerto');
    expect(project.sections.find(({ id }) => id === 'results').content).toContain('Producción');
    expect(project.conclusions).toEqual(['La comunidad participó.']);
    expect(project.recommendations).toEqual(['Regar cada semana.']);
    expect(project.references).toEqual(['García, A. (2024). Agricultura.']);
    expect(project.extraction.ocrPages).toEqual([2]);
    expect(project.sections.find(({ id }) => id === 'methodology').pendingReview).toBe(true);
  });

  test('preserves tabular rows as structured cells', () => {
    const project = extractProjectFromText('Resultados\nPlanta\tCantidad\nMaíz\t12\nFrijol\t8');
    expect(project.tables[0].rows).toEqual([
      ['Planta', 'Cantidad'],
      ['Maíz', '12'],
      ['Frijol', '8'],
    ]);
  });

  test('creates valid separated JSON files without duplicating author records', () => {
    const project = createEmptyProject();
    project.projectId = 'huerto-escolar';
    project.title = 'Huerto escolar';
    project.authors = [{ id: 'autor-1', name: 'Ana Pérez', role: 'Estudiante' }];
    project.sections[0].content = 'Introducción del proyecto.';
    project.tables = [{ id: 'tabla-1', title: 'Resultados', rows: [['Cultivo', 'Cantidad'], ['Maíz', '12']] }];

    const files = createProjectFiles(project);
    const main = JSON.parse(files['proyecto.json']);
    const members = JSON.parse(files['integrantes.json']);
    const development = JSON.parse(files['desarrollo.json']);
    Object.values(files).forEach((contents) => expect(() => JSON.parse(contents)).not.toThrow());
    expect(main.authors).toEqual(['autor-1']);
    expect(members.integrantes[0].name).toBe('Ana Pérez');
    expect(development.tables[0].rows[1]).toEqual(['Maíz', '12']);
    expect(validateProject(project)).toEqual([]);
  });

  test('rejects invalid project shapes before export', () => {
    expect(validateProject(null)).toContain('El contenido del proyecto debe ser un objeto JSON.');
    const project = createEmptyProject();
    project.tables = 'not a list';
    expect(validateProject(project).length).toBeGreaterThan(0);
    expect(() => createProjectFiles(project)).toThrow();
  });
});

describe('GitHub Pages URL builder', () => {
  test('builds a repository page and the user-site root correctly', () => {
    expect(buildPagesUrl('school-team', 'science-project')).toBe('https://school-team.github.io/science-project/');
    expect(buildPagesUrl('school-team', 'school-team.github.io')).toBe('https://school-team.github.io/');
  });

  test('rejects invalid owners and repository names', () => {
    expect(buildPagesUrl('invalid owner', 'science-project')).toBe('');
    expect(buildPagesUrl('school-team', '../private')).toBe('');
  });
});
