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
];
