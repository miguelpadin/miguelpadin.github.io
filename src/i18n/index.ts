export const languages = { en: 'EN', es: 'ES', gl: 'GL' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

export const skillUrls: Record<string, string> = {
  // Frontend
  'Vue':                   'https://vuejs.org',
  'Nuxt':                  'https://nuxt.com',
  'TypeScript':            'https://www.typescriptlang.org',
  'Pinia':                 'https://pinia.vuejs.org',
  'Vuex':                  'https://vuex.vuejs.org',
  'PrimeVue':              'https://primevue.org',
  'Quasar':                'https://quasar.dev',
  'BootstrapVue':          'https://bootstrap-vue.org',
  'Tailwind':              'https://tailwindcss.com',
  'Bootstrap':             'https://getbootstrap.com',
  'Bulma':                 'https://bulma.io',
  'SASS':                  'https://sass-lang.com',
  'SCSS':                  'https://sass-lang.com',
  'Flexbox':               'https://developer.mozilla.org/docs/Web/CSS/CSS_flexible_box_layout',
  'CSS Grid':              'https://developer.mozilla.org/docs/Web/CSS/CSS_grid_layout',
  'Vite':                  'https://vitejs.dev',
  // Backend
  'Python':                'https://www.python.org',
  'REST APIs':             'https://restfulapi.net',
  'RESTful':               'https://restfulapi.net',
  'HATEOAS':               'https://restfulapi.net/hateoas',
  'OpenAPI':               'https://www.openapis.org',
  'Odoo':                  'https://www.odoo.com',
  'SQL':                   'https://www.w3schools.com/sql/',
  'PostgreSQL':            'https://www.postgresql.org',
  'Oracle':                'https://www.oracle.com/database/',
  'PL/SQL':                'https://www.oracle.com/database/technologies/appdev/plsql.html',
  'Node.js':               'https://nodejs.org',
  // Testing
  'Vitest':                'https://vitest.dev',
  'Jest':                  'https://jestjs.io',
  'Playwright':            'https://playwright.dev',
  'Cypress':               'https://www.cypress.io',
  'Vue Test Utils':        'https://test-utils.vuejs.org',
  'Testing Library':       'https://testing-library.com',
  'pytest':                'https://pytest.org',
  'TDD':                   'https://martinfowler.com/bliki/TestDrivenDevelopment.html',
  'BDD':                   'https://cucumber.io/docs/bdd/',
  // Tooling
  'GitHub Actions':        'https://github.com/features/actions',
  'Git':                   'https://git-scm.com',
  'CI/CD':                 'https://about.gitlab.com/topics/ci-cd/',
  'ESM':                   'https://developer.mozilla.org/docs/Web/JavaScript/Guide/Modules',
  'Code Review':           'https://google.github.io/eng-practices/review/',
  // Architecture
  'Hexagonal Architecture':     'https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)',
  'Arquitectura Hexagonal':     'https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)',
  'DDD':                        'https://martinfowler.com/bliki/DomainDrivenDesign.html',
  'Clean Architecture':         'https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html',
  'SOLID':                      'https://en.wikipedia.org/wiki/SOLID',
  'REST':                       'https://restfulapi.net',
  'MVC':                        'https://developer.mozilla.org/docs/Glossary/MVC',
};

export function getLangUrl(targetLang: Lang): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return targetLang === 'en' ? `${base}/` : `${base}/${targetLang}/`;
}

const ui = {
  en: {
    nav: {
      experience: 'Experience',
      skills: 'Skills',
      contact: 'Contact',
    },
    hero: {
      label: 'Software Engineer',
      bio: '9+ years building enterprise systems and modern web applications. Focused on scalable architecture, code quality and developer experience. Based in Las Palmas de Gran Canaria, Spain.',
    },
    experience: {
      label: 'Experience',
      current: 'Current',
      jobs: [
        {
          company: 'Roomdoo',
          role: 'Full-stack Developer',
          period: '2020 — Present',
          location: 'Remote',
          current: true,
          highlights: [
            'Defined and consolidated the frontend architecture using Vue 3, TypeScript, Pinia, PrimeVue and Vite — applying DDD and a modular approach that scaled with the team.',
            'Technical leadership within the frontend team: development standards, code reviews and cross-team coordination.',
            'Built complex features for a PMS (hotel management software). Collaborated on the Odoo core module and created the first version of the REST API with automatic OpenAPI documentation.',
            'Built the automated testing infrastructure from scratch — Vitest + Testing Library on the frontend, pytest on the backend — evolving from zero tests to a TDD-ready workflow.',
            'Designed and maintained the CI pipeline in GitHub Actions: linting, formatting, tests and coverage.',
          ],
        },
        {
          company: 'Adoita IT Solutions',
          role: 'Full-stack Developer',
          period: '2016 — 2019',
          location: 'Pontevedra, Spain',
          current: false,
          highlights: [
            'Developed a real-time manufacturing monitoring platform using Node.js, Vue 2 and Socket.io.',
            'Maintained and evolved a manufacturing ERP based on Oracle, PL/SQL, Oracle Forms and Oracle Reports.',
            'Built and expanded an employee Android app (Java) covering time tracking, leave management and quality control.',
          ],
        },
        {
          company: 'Edisa Sistemas de Información',
          role: 'PL/SQL Developer',
          period: '2010 — 2012',
          location: 'Vigo, Spain',
          current: false,
          highlights: [
            'Extended and maintained ERP modules using Oracle, PL/SQL, Oracle Forms and Oracle Reports.',
            'Developed ERP extensions in Java and resolved critical production issues.',
          ],
        },
      ],
    },
    skills: {
      label: 'Skills',
      groups: [
        { label: 'Frontend', items: ['Vue', 'Nuxt', 'TypeScript', 'Pinia', 'Vuex', 'PrimeVue', 'Quasar', 'BootstrapVue', 'Tailwind', 'Bootstrap', 'Bulma', 'SASS', 'SCSS', 'Flexbox', 'CSS Grid', 'Vite'] },
        { label: 'Backend', items: ['Python', 'REST APIs', 'RESTful', 'HATEOAS', 'OpenAPI', 'Odoo', 'SQL', 'PostgreSQL', 'Oracle', 'PL/SQL', 'Node.js'] },
        { label: 'Testing', items: ['Vitest', 'Jest', 'Playwright', 'Cypress', 'Vue Test Utils', 'Testing Library', 'pytest', 'TDD', 'BDD'] },
        { label: 'Tooling & Process', items: ['GitHub Actions', 'Git', 'CI/CD', 'ESM', 'Code Review'] },
        { label: 'Architecture', items: ['Hexagonal Architecture', 'DDD', 'Clean Architecture', 'SOLID', 'REST', 'MVC'] },
      ],
      languagesLabel: 'Languages',
      spanish: { label: 'Spanish', level: 'Native' },
      galician: { label: 'Galician', level: 'Native' },
      english: { label: 'English', level: 'Professional proficiency' },
    },
    contact: {
      label: 'Contact',
      heading: ["Let's work", 'together.'],
      subtext: 'Open to new opportunities and interesting conversations.',
    },
    footer: 'Las Palmas de Gran Canaria, Spain',
  },

  es: {
    nav: {
      experience: 'Experiencia',
      skills: 'Habilidades',
      contact: 'Contacto',
    },
    hero: {
      label: 'Ingeniero de Software',
      bio: 'Más de 9 años construyendo sistemas empresariales y aplicaciones web modernas. Enfocado en arquitectura escalable, calidad de código y experiencia de desarrollo. Afincado en Las Palmas de Gran Canaria, España.',
    },
    experience: {
      label: 'Experiencia',
      current: 'Actual',
      jobs: [
        {
          company: 'Roomdoo',
          role: 'Desarrollador Full-stack',
          period: '2020 — Presente',
          location: 'Remoto',
          current: true,
          highlights: [
            'Definición y consolidación de la arquitectura frontend usando Vue 3, TypeScript, Pinia, PrimeVue y Vite, aplicando DDD y un enfoque modular que escaló con el equipo.',
            'Liderazgo técnico en el equipo frontend: estándares de desarrollo, revisiones de código y coordinación entre equipos.',
            'Desarrollo de funcionalidades complejas para un PMS (software de gestión hotelera). Colaboración en el módulo core de Odoo y creación de la primera versión de la REST API con documentación OpenAPI automática.',
            'Construcción de la infraestructura de testing desde cero — Vitest + Testing Library en frontend, pytest en backend — evolucionando de un entorno sin tests a un flujo TDD estable.',
            'Diseño y mantenimiento del pipeline CI en GitHub Actions: linting, formateo, tests y cobertura.',
          ],
        },
        {
          company: 'Adoita IT Solutions',
          role: 'Desarrollador Full-stack',
          period: '2016 — 2019',
          location: 'Pontevedra, España',
          current: false,
          highlights: [
            'Desarrollo de una plataforma de monitorización en tiempo real para procesos de fabricación usando Node.js, Vue 2 y Socket.io.',
            'Mantenimiento y evolución de un ERP de fabricación basado en Oracle, PL/SQL, Oracle Forms y Oracle Reports.',
            'Desarrollo y ampliación de una app Android para empleados (Java) con módulos de control horario, gestión de ausencias y control de calidad.',
          ],
        },
        {
          company: 'Edisa Sistemas de Información',
          role: 'Desarrollador PL/SQL',
          period: '2010 — 2012',
          location: 'Vigo, España',
          current: false,
          highlights: [
            'Extensión y mantenimiento de módulos ERP usando Oracle, PL/SQL, Oracle Forms y Oracle Reports.',
            'Desarrollo de extensiones ERP en Java y resolución de incidencias críticas en producción.',
          ],
        },
      ],
    },
    skills: {
      label: 'Habilidades',
      groups: [
        { label: 'Frontend', items: ['Vue', 'Nuxt', 'TypeScript', 'Pinia', 'Vuex', 'PrimeVue', 'Quasar', 'BootstrapVue', 'Tailwind', 'Bootstrap', 'Bulma', 'SASS', 'SCSS', 'Flexbox', 'CSS Grid', 'Vite'] },
        { label: 'Backend', items: ['Python', 'REST APIs', 'RESTful', 'HATEOAS', 'OpenAPI', 'Odoo', 'SQL', 'PostgreSQL', 'Oracle', 'PL/SQL', 'Node.js'] },
        { label: 'Testing', items: ['Vitest', 'Jest', 'Playwright', 'Cypress', 'Vue Test Utils', 'Testing Library', 'pytest', 'TDD', 'BDD'] },
        { label: 'Herramientas y proceso', items: ['GitHub Actions', 'Git', 'CI/CD', 'ESM', 'Code Review'] },
        { label: 'Arquitectura', items: ['Arquitectura Hexagonal', 'DDD', 'Clean Architecture', 'SOLID', 'REST', 'MVC'] },
      ],
      languagesLabel: 'Idiomas',
      spanish: { label: 'Español', level: 'Nativo' },
      galician: { label: 'Gallego', level: 'Nativo' },
      english: { label: 'Inglés', level: 'Nivel profesional' },
    },
    contact: {
      label: 'Contacto',
      heading: ['Trabajemos', 'juntos.'],
      subtext: 'Abierto a nuevas oportunidades y conversaciones interesantes.',
    },
    footer: 'Las Palmas de Gran Canaria, España',
  },

  gl: {
    nav: {
      experience: 'Experiencia',
      skills: 'Habilidades',
      contact: 'Contacto',
    },
    hero: {
      label: 'Enxeñeiro de Software',
      bio: 'Máis de 9 anos construíndo sistemas empresariais e aplicacións web modernas. Enfocado en arquitectura escalable, calidade de código e experiencia de desenvolvemento. Afincado en Las Palmas de Gran Canaria, España.',
    },
    experience: {
      label: 'Experiencia',
      current: 'Actual',
      jobs: [
        {
          company: 'Roomdoo',
          role: 'Desenvolvedor Full-stack',
          period: '2020 — Presente',
          location: 'Remoto',
          current: true,
          highlights: [
            'Definición e consolidación da arquitectura frontend usando Vue 3, TypeScript, Pinia, PrimeVue e Vite, aplicando DDD e un enfoque modular que escalou co equipo.',
            'Liderado técnico no equipo frontend: estándares de desenvolvemento, revisións de código e coordinación entre equipos.',
            'Desenvolvemento de funcionalidades complexas para un PMS (software de xestión hoteleira). Colaboración no módulo core de Odoo e creación da primeira versión da REST API con documentación OpenAPI automática.',
            'Construción da infraestrutura de testing desde cero — Vitest + Testing Library en frontend, pytest en backend — evolucionando dun contorno sen tests a un fluxo TDD estable.',
            'Deseño e mantemento do pipeline CI en GitHub Actions: linting, formateo, tests e cobertura.',
          ],
        },
        {
          company: 'Adoita IT Solutions',
          role: 'Desenvolvedor Full-stack',
          period: '2016 — 2019',
          location: 'Pontevedra, España',
          current: false,
          highlights: [
            'Desenvolvemento dunha plataforma de monitorización en tempo real para procesos de fabricación usando Node.js, Vue 2 e Socket.io.',
            'Mantemento e evolución dun ERP de fabricación baseado en Oracle, PL/SQL, Oracle Forms e Oracle Reports.',
            'Desenvolvemento e ampliación dunha app Android para empregados (Java) con módulos de control horario, xestión de ausencias e control de calidade.',
          ],
        },
        {
          company: 'Edisa Sistemas de Información',
          role: 'Desenvolvedor PL/SQL',
          period: '2010 — 2012',
          location: 'Vigo, España',
          current: false,
          highlights: [
            'Extensión e mantemento de módulos ERP usando Oracle, PL/SQL, Oracle Forms e Oracle Reports.',
            'Desenvolvemento de extensións ERP en Java e resolución de incidencias críticas en produción.',
          ],
        },
      ],
    },
    skills: {
      label: 'Habilidades',
      groups: [
        { label: 'Frontend', items: ['Vue', 'Nuxt', 'TypeScript', 'Pinia', 'Vuex', 'PrimeVue', 'Quasar', 'BootstrapVue', 'Tailwind', 'Bootstrap', 'Bulma', 'SASS', 'SCSS', 'Flexbox', 'CSS Grid', 'Vite'] },
        { label: 'Backend', items: ['Python', 'REST APIs', 'RESTful', 'HATEOAS', 'OpenAPI', 'Odoo', 'SQL', 'PostgreSQL', 'Oracle', 'PL/SQL', 'Node.js'] },
        { label: 'Testing', items: ['Vitest', 'Jest', 'Playwright', 'Cypress', 'Vue Test Utils', 'Testing Library', 'pytest', 'TDD', 'BDD'] },
        { label: 'Ferramentas e proceso', items: ['GitHub Actions', 'Git', 'CI/CD', 'ESM', 'Code Review'] },
        { label: 'Arquitectura', items: ['Arquitectura Hexagonal', 'DDD', 'Clean Architecture', 'SOLID', 'REST', 'MVC'] },
      ],
      languagesLabel: 'Idiomas',
      spanish: { label: 'Español', level: 'Nativo' },
      galician: { label: 'Galego', level: 'Nativo' },
      english: { label: 'Inglés', level: 'Nivel profesional' },
    },
    contact: {
      label: 'Contacto',
      heading: ['Traballemos', 'xuntos.'],
      subtext: 'Aberto a novas oportunidades e conversas interesantes.',
    },
    footer: 'Las Palmas de Gran Canaria, España',
  },
} as const;

export type Translations = (typeof ui)[Lang];

export function useTranslations(lang: Lang): Translations {
  return ui[lang];
}
