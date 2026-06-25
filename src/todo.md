# SEO verde — mantener y monitorizar

## Rendimiento (🟢)
- SSG sin JS runtime: zero JS por defecto en páginas principales. Mantener.
- Code splitting CSS por página si el proyecto crece.

## Structured Data (🟢)
- JSON-LD Person con nombre, título, email, redes, ubicación, tecnologías. Ya actualizado.
- Considerar añadir JSON-LD para subpáginas legales (WebPage/WebSite).

## SEO Móvil (🟢)
- Viewport configurado correctamente.
- Diseño responsive con Tailwind breakpoints.
- Mantener test de Google Mobile-Friendly tras cada deploy.

## Enlazado interno (🟢)
- Enlaces externos con `noopener noreferrer` correctos.
- Navegación con hash para scroll suave en homepage.

## PWA (🟢)
- Manifest presente con `start_url` y `display: standalone`.
- Service worker registrado (ya actualizado con cacheo offline).

## Seguridad (🟢)
- No hay contenido mixto (todos los recursos externos usan HTTPS).
- Considerar añadir cabeceras HSTS y CSP desde GitHub Pages.

## i18n (🟢)
- Atributo `lang` correcto en cada página.
- `og:locale` por idioma.
- Setup de rutas i18n completo.
