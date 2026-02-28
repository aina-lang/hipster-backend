import { FlyerCategory } from '../types/flyer.types';

export const FLYER_CATEGORIES: FlyerCategory[] = [
  {
    id: 'fashion',
    label: 'MODE & FASHION',
    icon: 'Sparkles',
    image: 'https://hipster-api.fr/assets/fashion-flyer.jpeg',
    models: [
      {
        label: 'Fashion Vertical Impact',
        structure: {
          subject: 'full-portrait',
          subjectSize: 'hero',
          title: 'vertical-left',
          banner: 'none',
          particles: 'none',
          decorations: ['gradient-dark-overlay'],
          background: 'studio-atmospheric',
          colorFilter: 'editorial',
          typography: 'ultra-bold-vertical',
          frame: 'borderless',
        },
      },
    ],
  },
  {
    id: 'impact',
    label: 'BOLD & IMPACT',
    icon: 'Zap',
    image: 'https://hipster-api.fr/assets/impact-flyer.jpeg',
    models: [
      {
        label: 'Magazine Cover Poster',
        structure: {
          subject: 'product-center',
          subjectSize: 'large',
          title: 'bold-diagonal',
          banner: 'dynamic-ribbon',
          particles: 'urban-grit',
          decorations: ['sticker-bombed'],
          background: 'street-urban',
          colorFilter: 'high-contrast',
          typography: 'heavy-display',
          frame: 'rough-edge',
        },
      },
      {
        label: 'Impact Commercial',
        structure: {
          subject: 'centered-portrait',
          subjectSize: 'full',
          title: 'top-overlay',
          banner: 'none',
          particles: 'subtle-dust',
          decorations: ['magazine-grid'],
          background: 'minimalist-studio',
          colorFilter: 'vogue',
          typography: 'didone-serif',
          frame: 'thin-white',
        },
      },
    ],
  },
  {
    id: 'luxury',
    label: 'PREMIUM & LUXE',
    icon: 'Crown',
    image: 'https://hipster-api.fr/assets/luxury-flyer.jpeg',
    models: [
      {
        label: 'Editorial Motion',
        structure: {
          subject: 'dynamic-action',
          subjectSize: 'hero',
          title: 'kinetic-text',
          banner: 'none',
          particles: 'motion-blur',
          decorations: ['cinematic-bars'],
          background: 'abstract-gradient',
          colorFilter: 'soft-dreamy',
          typography: 'modern-sans',
          frame: 'borderless',
        },
      },
    ],
  },
];
