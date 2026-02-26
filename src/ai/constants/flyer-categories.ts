import { FlyerCategory } from '../types/flyer.types';

export const FLYER_CATEGORIES: FlyerCategory[] = [
  {
    id: 'dark',
    label: 'SOMBRE & LUXE',
    icon: 'Moon',
    image: 'https://hipster-api.fr/assets/flyer.jpeg',
    models: [
      {
        label: 'Noir & Or',
        variants: [
          {
            label: 'Noir & Or – Sobre & Raffiné',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'sparks',
              decorations: ['corner-marks', 'foil-texture'],
              background: 'solid-dark',
              colorFilter: 'matte',
              typography: 'serif-editorial',
              frame: 'thin-border',
            },
          },
          {
            label: 'Noir & Or – Festif & Brillant',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'badge-circle',
              particles: 'sparks',
              decorations: ['foil-texture', 'diagonal-stripe'],
              background: 'gradient-radial',
              colorFilter: 'vivid',
              typography: 'oversized-display',
              frame: 'double-border',
            },
          },
          {
            label: 'Noir & Or – Corporate',
            structure: {
              subject: 'bleed-right',
              subjectSize: 'large',
              title: 'center-left',
              banner: 'strip-top',
              particles: 'none',
              decorations: ['corner-marks', 'geometric-border'],
              background: 'solid-dark',
              colorFilter: 'duotone',
              typography: 'sans-bold',
              frame: 'corner-brackets',
            },
          },
          {
            label: 'Noir & Or – Romantique',
            structure: {
              subject: 'center',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'badge-pill',
              particles: 'petals',
              decorations: ['floral-ornament', 'foil-texture'],
              background: 'gradient-radial',
              colorFilter: 'matte',
              typography: 'script-hand',
              frame: 'full-arch',
            },
          },
        ],
      },
      {
        label: 'Minuit Premium',
        variants: [
          {
            label: 'Minuit Premium – Sobre',
            structure: {
              subject: 'bleed-right',
              subjectSize: 'large',
              title: 'center-left',
              banner: 'strip-top',
              particles: 'bokeh',
              decorations: ['corner-marks'],
              background: 'gradient-linear',
              colorFilter: 'matte',
              typography: 'serif-editorial',
              frame: 'thin-border',
            },
          },
          {
            label: 'Minuit Premium – Festif',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'badge-circle',
              particles: 'stars',
              decorations: ['foil-texture', 'neon-glow-outline'],
              background: 'gradient-mesh',
              colorFilter: 'vivid',
              typography: 'oversized-display',
              frame: 'double-border',
            },
          },
          {
            label: 'Minuit Premium – Cérémoniel',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'sparks',
              decorations: ['ribbon-seal', 'floral-ornament'],
              background: 'solid-dark',
              colorFilter: 'duotone',
              typography: 'serif-editorial',
              frame: 'full-arch',
            },
          },
        ],
      },
      // ... Les autres modèles seront ajoutés progressivement ou via une migration complète
    ],
  },
  {
    id: 'light',
    label: 'CLAIR & ÉPURÉ',
    icon: 'Sun',
    image: 'https://hipster-api.fr/assets/bg-onboarding.jpeg',
    models: [
      {
        label: 'Blanc Pur',
        variants: [
          {
            label: 'Blanc Pur – Ultra Minimaliste',
            structure: {
              subject: 'center',
              subjectSize: 'medium',
              title: 'top-center',
              banner: 'none',
              particles: 'none',
              decorations: ['corner-marks'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'minimal-label',
              frame: 'thin-border',
            },
          },
        ],
      },
    ],
  },
  // Note: Pour une implémentation complète, nous devrions migrer TOUS les modèles de flyerModels.ts
];
