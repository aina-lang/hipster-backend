import { FlyerCategory } from '../types/flyer.types';

export const FLYER_CATEGORIES: FlyerCategory[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1 · SOMBRE & LUXE
  // ═══════════════════════════════════════════════════════════════════════════
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
      {
        label: 'Élégance Sombre',
        variants: [
          {
            label: 'Élégance Sombre – Minimaliste',
            structure: {
              subject: 'center',
              subjectSize: 'large',
              title: 'top-left',
              banner: 'none',
              particles: 'none',
              decorations: ['corner-marks'],
              background: 'solid-dark',
              colorFilter: 'bw',
              typography: 'minimal-label',
              frame: 'thin-border',
            },
          },
          {
            label: 'Élégance Sombre – Texturé',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'dust',
              decorations: ['foil-texture'],
              background: 'texture-grain',
              colorFilter: 'matte',
              typography: 'serif-editorial',
              frame: 'double-border',
            },
          },
          {
            label: 'Élégance Sombre – Floral',
            structure: {
              subject: 'center',
              subjectSize: 'large',
              title: 'bottom-center',
              banner: 'badge-pill',
              particles: 'petals',
              decorations: ['floral-ornament'],
              background: 'gradient-radial',
              colorFilter: 'faded',
              typography: 'script-hand',
              frame: 'full-arch',
            },
          },
        ],
      },
      {
        label: 'Néon Sombre',
        variants: [
          {
            label: 'Néon Sombre – Rose & Noir',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'strip-top',
              particles: 'sparks',
              decorations: ['neon-glow-outline'],
              background: 'solid-dark',
              colorFilter: 'neon-wash',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
          {
            label: 'Néon Sombre – Vert & Noir',
            structure: {
              subject: 'bleed-left',
              subjectSize: 'large',
              title: 'center-right',
              banner: 'strip-right',
              particles: 'sparks',
              decorations: ['neon-glow-outline', 'diagonal-stripe'],
              background: 'solid-dark',
              colorFilter: 'neon-wash',
              typography: 'condensed-stack',
              frame: 'diagonal-split',
            },
          },
          {
            label: 'Néon Sombre – Multi-Néon',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'top-center',
              banner: 'badge-circle',
              particles: 'sparks',
              decorations: ['neon-glow-outline', 'halftone-overlay'],
              background: 'solid-dark',
              colorFilter: 'vivid',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
          {
            label: 'Néon Sombre – Cyber Violet',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'badge-pill',
              particles: 'sparks',
              decorations: ['neon-glow-outline', 'white-city-silhouette'],
              background: 'solid-dark',
              colorFilter: 'neon-wash',
              typography: 'serif-editorial',
              frame: 'full-arch',
            },
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2 · CLAIR & ÉPURÉ
  // ═══════════════════════════════════════════════════════════════════════════
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
          {
            label: 'Blanc Pur – Avec Accent Sombre',
            structure: {
              subject: 'bleed-left',
              subjectSize: 'large',
              title: 'center-left',
              banner: 'strip-top',
              particles: 'none',
              decorations: ['corner-marks', 'geometric-border'],
              background: 'solid-light',
              colorFilter: 'bw',
              typography: 'sans-bold',
              frame: 'corner-brackets',
            },
          },
          {
            label: 'Blanc Pur – Avec Accent Doré',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'sparks',
              decorations: ['foil-texture', 'corner-marks'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'serif-editorial',
              frame: 'thin-border',
            },
          },
        ],
      },
      {
        label: 'Minimaliste Doux',
        variants: [
          {
            label: 'Minimaliste Doux – Sobre',
            structure: {
              subject: 'center',
              subjectSize: 'medium',
              title: 'top-left',
              banner: 'none',
              particles: 'none',
              decorations: ['corner-marks'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'minimal-label',
              frame: 'thin-border',
            },
          },
          {
            label: 'Minimaliste Doux – Festif',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'badge-pill',
              particles: 'confetti',
              decorations: ['corner-marks'],
              background: 'gradient-linear',
              colorFilter: 'none',
              typography: 'sans-bold',
              frame: 'thin-border',
            },
          },
          {
            label: 'Minimaliste Doux – Poétique',
            structure: {
              subject: 'center',
              subjectSize: 'medium',
              title: 'bottom-center',
              banner: 'badge-pill',
              particles: 'petals',
              decorations: ['floral-ornament'],
              background: 'gradient-radial',
              colorFilter: 'faded',
              typography: 'script-hand',
              frame: 'full-arch',
            },
          },
        ],
      },
      {
        label: 'Pastel Tendre',
        variants: [
          {
            label: 'Pastel Tendre – Anniversaire',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'badge-circle',
              particles: 'confetti',
              decorations: ['corner-marks'],
              background: 'gradient-radial',
              colorFilter: 'vivid',
              typography: 'sans-bold',
              frame: 'thin-border',
            },
          },
          {
            label: 'Pastel Tendre – Baby Shower',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'badge-pill',
              particles: 'bubbles',
              decorations: ['floral-ornament'],
              background: 'gradient-linear',
              colorFilter: 'none',
              typography: 'script-hand',
              frame: 'full-arch',
            },
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3 · BOLD & IMPACT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'bold',
    label: 'BOLD & IMPACT',
    icon: 'Flame',
    image: 'https://hipster-api.fr/assets/site-web.jpeg',
    models: [
      {
        label: 'Style Brutaliste',
        variants: [
          {
            label: 'Brutaliste – Brut & Cru',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'top-left',
              banner: 'strip-left',
              particles: 'dust',
              decorations: ['white-city-silhouette'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'oversized-display',
              frame: 'thick-border',
            },
          },
          {
            label: 'Brutaliste – Sombre',
            structure: {
              subject: 'bleed-left',
              subjectSize: 'large',
              title: 'center-right',
              banner: 'strip-right',
              particles: 'dust',
              decorations: ['scanlines', 'noise-grain'],
              background: 'solid-dark',
              colorFilter: 'bw',
              typography: 'oversized-display',
              frame: 'thick-border',
            },
          },
        ],
      },
      {
        label: 'Rouge Total',
        variants: [
          {
            label: 'Rouge Total – Plein',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'strip-top',
              particles: 'none',
              decorations: ['white-city-silhouette'],
              background: 'solid-color',
              colorFilter: 'duotone',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
          {
            label: 'Rouge Total – Dégradé',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-top',
              particles: 'sparks',
              decorations: ['none'],
              background: 'gradient-linear',
              colorFilter: 'vivid',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4 · COLORÉ & FESTIF
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'colorful',
    label: 'COLORÉ & FESTIF',
    icon: 'Sparkles',
    image: 'https://hipster-api.fr/assets/social.jpeg',
    models: [
      {
        label: 'Confettis Pop',
        variants: [
          {
            label: 'Confettis Pop – Enfant',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'badge-circle',
              particles: 'confetti',
              decorations: ['corner-marks'],
              background: 'gradient-radial',
              colorFilter: 'vivid',
              typography: 'sans-bold',
              frame: 'thin-border',
            },
          },
          {
            label: 'Confettis Pop – Luxe',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'sparks',
              decorations: ['foil-texture', 'ribbon-seal'],
              background: 'gradient-radial',
              colorFilter: 'matte',
              typography: 'serif-editorial',
              frame: 'double-border',
            },
          },
        ],
      },
      {
        label: 'Ambiance Tropicale',
        variants: [
          {
            label: 'Tropicale – Plage & Soleil',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'badge-pill',
              particles: 'bokeh',
              decorations: ['wave-bottom', 'floral-ornament'],
              background: 'gradient-radial',
              colorFilter: 'vivid',
              typography: 'sans-bold',
              frame: 'thin-border',
            },
          },
          {
            label: 'Tropicale – Néon',
            structure: {
              subject: 'center',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'strip-top',
              particles: 'sparks',
              decorations: ['neon-glow-outline', 'white-city-silhouette'],
              background: 'solid-dark',
              colorFilter: 'neon-wash',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5 · CLASSIQUE & FORMEL
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'classic',
    label: 'CLASSIQUE & FORMEL',
    icon: 'Gem',
    image: 'https://hipster-api.fr/assets/ordi_blanc_bg.jpeg',
    models: [
      {
        label: 'Corporate Épuré',
        variants: [
          {
            label: 'Corporate – Sobre & Professionnel',
            structure: {
              subject: 'bleed-right',
              subjectSize: 'large',
              title: 'center-left',
              banner: 'strip-top',
              particles: 'none',
              decorations: ['corner-marks', 'geometric-border'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'serif-editorial',
              frame: 'corner-brackets',
            },
          },
          {
            label: 'Corporate – Moderne & Aéré',
            structure: {
              subject: 'center',
              subjectSize: 'medium',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'none',
              decorations: ['geometric-border'],
              background: 'solid-light',
              colorFilter: 'none',
              typography: 'sans-bold',
              frame: 'thin-border',
            },
          },
        ],
      },
      {
        label: 'Formel Business',
        variants: [
          {
            label: 'Business – Marine & Or',
            structure: {
              subject: 'bleed-left',
              subjectSize: 'large',
              title: 'center-right',
              banner: 'strip-right',
              particles: 'none',
              decorations: ['foil-texture', 'corner-marks'],
              background: 'solid-dark',
              colorFilter: 'duotone',
              typography: 'serif-editorial',
              frame: 'double-border',
            },
          },
        ],
      },
      {
        label: 'Art Déco',
        variants: [
          {
            label: 'Art Déco – Or & Noir',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'geometric-shapes',
              decorations: ['foil-texture', 'geometric-border', 'corner-marks'],
              background: 'solid-dark',
              colorFilter: 'duotone',
              typography: 'serif-editorial',
              frame: 'double-border',
            },
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6 · CRÉATIF & GRAPHIQUE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'creative',
    label: 'CRÉATIF & GRAPHIQUE',
    icon: 'Palette',
    image: 'https://hipster-api.fr/assets/illus4.jpeg',
    models: [
      {
        label: 'Double Exposition',
        variants: [
          {
            label: 'Double Exposition – Sombre',
            structure: {
              subject: 'full-bleed',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'strip-top',
              particles: 'bokeh',
              decorations: ['noise-grain'],
              background: 'solid-dark',
              colorFilter: 'duotone',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
          {
            label: 'Double Exposition – Colorée',
            structure: {
              subject: 'full-bleed',
              subjectSize: 'hero',
              title: 'bottom-center',
              banner: 'strip-top',
              particles: 'bokeh',
              decorations: ['neon-glow-outline'],
              background: 'gradient-mesh',
              colorFilter: 'neon-wash',
              typography: 'oversized-display',
              frame: 'none',
            },
          },
        ],
      },
      {
        label: 'Photo Argentique',
        variants: [
          {
            label: 'Argentique – Noir & Blanc',
            structure: {
              subject: 'full-bleed',
              subjectSize: 'hero',
              title: 'bottom-left',
              banner: 'strip-bottom',
              particles: 'noise-grain',
              decorations: ['none'],
              background: 'photo-overlay',
              colorFilter: 'bw',
              typography: 'minimal-label',
              frame: 'none',
            },
          },
        ],
      },
      {
        label: 'Marbre & Pierre',
        variants: [
          {
            label: 'Marbre – Blanc & Or',
            structure: {
              subject: 'center-bottom',
              subjectSize: 'large',
              title: 'top-center',
              banner: 'strip-bottom',
              particles: 'sparks',
              decorations: ['foil-texture', 'corner-marks'],
              background: 'texture-marble',
              colorFilter: 'none',
              typography: 'serif-editorial',
              frame: 'double-border',
            },
          },
        ],
      },
    ],
  },
];
