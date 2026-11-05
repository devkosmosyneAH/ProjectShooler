# Aula · Generador de proyectos escolares

Aplicación React + Vite para extraer y revisar contenido de documentos PDF, exportar JSON y generar un sitio público estático con QR. El PDF se analiza en el navegador; nunca se envía al servidor. El motor y los modelos de idioma de Tesseract.js pueden descargarse desde una CDN cuando se necesita OCR.

## Requisitos

- Node.js compatible con Vite 7 y Vitest 4 (Node 20.19+, 22.12–22.x o 24+).
- npm.

## Desarrollo y pruebas

```sh
npm install
npm start
npm test
npm run build
```

La aplicación de desarrollo queda disponible en `http://localhost:5173`.

## Flujo de uso

1. Importa o arrastra un PDF (máximo 50 MB). PDF.js extrae texto página por página y Tesseract.js solo procesa páginas con menos de 30 caracteres seleccionables. El OCR usa español e inglés.
2. Corrige el proyecto en el editor. Los encabezados se detectan mediante heurísticas; revisa nombres, secciones y tablas antes de continuar.
3. En **Imágenes y OCR**, selecciona o arrastra varias imágenes JPG, PNG o WEBP (máximo 10 MB por archivo). Tesseract.js reconoce texto en español e inglés en el navegador. El texto y su confianza se guardan por separado; los resultados vacíos o de baja confianza quedan pendientes de revisión. La aplicación no interpreta visualmente diagramas o gráficos: las descripciones y el texto alternativo deben revisarse o introducirse manualmente.
4. Edita títulos, descripciones, texto OCR, texto alternativo, orden y sección de cada imagen. Puedes marcar una imagen como destacada. En **Videos YouTube**, añade URLs HTTPS de youtube.com o youtu.be; el identificador se valida antes de crear el reproductor.
5. En Exportar, confirma que revisaste y autorizas la publicación. Descarga los JSON o el ZIP del sitio, que incluye los archivos de imagen locales referenciados. El PDF original solo se agrega si marcas la opción explícita.
6. Configura usuario y repositorio en Publicación, sube el contenido descomprimido a la raíz del repositorio y deja que GitHub Actions lo publique.
7. Después de verificar la URL real de Pages, usa esa URL para descargar el QR PNG o el PDF imprimible.

El ZIP incluye `public/index.html`, `public/app.js`, `public/styles.css`, `public/data/*.json`, las imágenes locales, instrucciones y `.github/workflows/pages.yml`. El workflow publica `public/` como raíz del sitio. La página pública carga sus datos mediante `fetch()` y construye el DOM con `textContent` para que el contenido del PDF no se ejecute como HTML. El ZIP no se genera si una imagen local referenciada no está disponible.

## Metadatos multimedia

`public/data/proyecto.json` mantiene compatibilidad con los recursos existentes y referencia `multimedia.json`. El archivo multimedia contiene `images`, `videos` y `resourceConfig`. Una imagen conserva `id`, `title`, `description`, `visualDescription`, `alt`, `path`, `section`, `order`, `featured`, `ocrText`, `ocrConfidence`, `ocrReviewRequired`, el estado de revisión y la clasificación heurística de líneas OCR. Solo `ocrText` procede del reconocimiento; las descripciones visuales son contenido manual. No se publica una interpretación automática de diagramas o gráficos.

Cada video incluye `id`, `title`, `description`, `platform: "youtube"`, URL original, `videoId`, URL `youtube-nocookie.com`, sección y orden. El reproductor vuelve a validar el dominio y el identificador antes de crear el iframe.

El origen predeterminado es `{ "mode": "local", "rawBaseUrl": "" }`: los JSON se cargan desde `./data/` y las imágenes desde rutas relativas incluidas en el ZIP, por lo que funciona bajo una ruta de repositorio de GitHub Pages. Para configurar GitHub Raw, elige ese origen en el administrador e indica una URL HTTPS pública de `raw.githubusercontent.com` que termine en la carpeta que contiene `data/` e `images/`, por ejemplo `https://raw.githubusercontent.com/usuario/repositorio/main/public/`. Los JSON se cargarán desde esa carpeta remota; las imágenes marcadas como locales siguen en el ZIP y las imágenes configuradas como Raw se resuelven desde la misma base. No se aceptan tokens ni dominios arbitrarios. El repositorio remoto debe permitir acceso público y CORS desde el sitio.

## GitHub Pages y `base` de Vite

La configuración de Vite usa `/` durante desarrollo. En GitHub Actions, `vite.config.js` obtiene el nombre del repositorio desde `GITHUB_REPOSITORY` y establece `/<repositorio>/`; para `<usuario>.github.io` usa `/`. En compilaciones locales usa la ruta de `homepage` del manifiesto. Para otra ruta se puede definir `VITE_BASE_PATH`, por ejemplo `VITE_BASE_PATH=/mi-repositorio/ npm run build`. El script `npm run deploy` publica `dist/` con `gh-pages`.

El ZIP generado publica el sitio estático del proyecto escolar, no el administrador React. Los archivos públicos deben extraerse en la raíz del repositorio destino. GitHub Pages no permite que el navegador escriba al repositorio ni da autenticación al panel. No guardes tokens o secretos en el frontend y no publiques datos de estudiantes sin autorización.

## Límites conocidos

- La identificación de títulos y secciones es heurística; toda extracción requiere revisión humana.
- Las tablas se reconstruyen a partir del espacio entre elementos de texto y pueden requerir corrección.
- Las imágenes incrustadas en el PDF no se extraen; se pueden cargar imágenes manualmente. El OCR no constituye reconocimiento visual avanzado y no describe diagramas, gráficos ni objetos.
- Documentos protegidos con contraseña, dañados o incompatibles muestran un error; no se intenta eludir su protección.
- El borrador vive en la memoria de la pestaña y no se conserva al recargarla.
- En Pages, tanto el sitio público como cualquier panel publicado son accesibles públicamente; no hay autenticación segura sin un servicio externo.

## Interfaz

El panel usa un sistema visual editorial de tonos marfil, verde bosque y acentos lima, implementado con variables CSS y sin dependencias de animación adicionales. Los componentes compartidos `Surface` y `ActionButton` admiten variantes y elemento semántico (`as`); las transiciones respetan `prefers-reduced-motion`.

La ruta `#/view/` presenta el proyecto como una infografía adaptable: sus etapas se construyen con el resumen, los objetivos y las secciones existentes; las imágenes destacadas y la galería usan únicamente medios del proyecto. Los campos vacíos no generan contenido ficticio. Al pie se muestran los créditos del desarrollador y sus enlaces públicos, también incluidos en el sitio estático exportado.
