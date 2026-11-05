# Aula · Generador de proyectos escolares

Aplicación React + Vite para extraer y revisar contenido de documentos PDF, exportar JSON y generar un sitio público estático con QR. El PDF se analiza en el navegador; nunca se envía al servidor. El motor y los modelos de idioma de Tesseract.js pueden descargarse desde una CDN cuando se necesita OCR.

## Requisitos

- Node.js compatible con Vite 7 (Node 20.19+ o 22.12+).
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
3. Añade manualmente fotografías que puedas publicar. PDF.js no extrae automáticamente imágenes incrustadas en este flujo.
4. En Exportar, confirma que revisaste y autorizas la publicación. Descarga los JSON o el ZIP del sitio. El PDF original solo se agrega si marcas la opción explícita.
5. Configura usuario y repositorio en Publicación, sube el contenido descomprimido a la raíz del repositorio y deja que GitHub Actions lo publique.
6. Después de verificar la URL real de Pages, usa esa URL para descargar el QR PNG o el PDF imprimible.

El ZIP incluye `public/index.html`, `public/app.js`, `public/styles.css`, `public/data/*.json`, `public/images/proyecto/`, instrucciones y `.github/workflows/pages.yml`. El workflow publica `public/` como raíz del sitio. La página pública carga sus datos mediante `fetch()` y construye el DOM con `textContent` para que el contenido del PDF no se ejecute como HTML.

## GitHub Pages y `base` de Vite

La configuración de Vite usa `/` durante desarrollo. En GitHub Actions, `vite.config.js` obtiene el nombre del repositorio desde `GITHUB_REPOSITORY` y establece `/<repositorio>/`; para `<usuario>.github.io` usa `/`. Para otra ruta se puede definir `VITE_BASE_PATH`, por ejemplo `VITE_BASE_PATH=/mi-repositorio/ npm run build`.

El ZIP generado publica el sitio estático del proyecto escolar, no el administrador React. Los archivos públicos deben extraerse en la raíz del repositorio destino. GitHub Pages no permite que el navegador escriba al repositorio ni da autenticación al panel. No guardes tokens o secretos en el frontend y no publiques datos de estudiantes sin autorización.

## Límites conocidos

- La identificación de títulos y secciones es heurística; toda extracción requiere revisión humana.
- Las tablas se reconstruyen a partir del espacio entre elementos de texto y pueden requerir corrección.
- Las imágenes incrustadas en el PDF no se extraen; se pueden cargar imágenes manualmente.
- Documentos protegidos con contraseña, dañados o incompatibles muestran un error; no se intenta eludir su protección.
- El borrador vive en la memoria de la pestaña y no se conserva al recargarla.
- En Pages, tanto el sitio público como cualquier panel publicado son accesibles públicamente; no hay autenticación segura sin un servicio externo.
