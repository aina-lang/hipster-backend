export interface VisualArchitecture {
  name: string;
  layoutType: string;
  colorPalette: string;
  rules: {
    subject: string;
    background: string;
    title: string;
    subtitle: string;
    infoBlock: string;
    upperZone: string;
    constraints: string;
  };
}

export const FASHION_VERTICAL_IMPACT_ARCH: VisualArchitecture = {
  name: 'Fashion Vertical Impact',
  layoutType: 'TYPE_FASHION_VERTICAL',
  colorPalette: 'Luxury/Neon',
  rules: {
    subject:
      'SUBJECT: High-fashion portrait, offset slightly. Crop from chest upward. Cinematic depth of field (f/1.8). Sharp focus on face, confident posture. Professional editorial photography.',
    background:
      'BACKGROUND: Minimalist studio or atmospheric dark environment. Deep charcoal or black. Soft dramatic lighting.',
    title:
      'RENDER TEXT - MAIN TITLE: Vertically aligned on the LEFT margin. Ultra-bold sans-serif. Rotated 90 degrees. Large scale.',
    subtitle:
      'RENDER TEXT - SUBTITLE: Elegant script/cursive font at the CENTER-BOTTOM area.',
    infoBlock:
      'RENDER TEXT - INFO: Small-caps, centered at the absolute BOTTOM.',
    upperZone: 'UPPER: None.',
    constraints:
      'LAYOUT: Strict magazine cover composition. YOU MUST RENDER ALL TEXT BLOCKS DIRECTLY ON THE IMAGE. Professional typography integration. No logos. Zero AI artifacts.',
  },
};

export const STREET_SALE_ARCH: VisualArchitecture = {
  name: 'Street Sale',
  layoutType: 'TYPE_EDITORIAL_COVER',
  colorPalette: 'Urban/Vibrant',
  rules: {
    subject:
      'SUBJECT: Centered professional portrait or hero product. Eye level. High-end lighting.',
    background:
      'BACKGROUND: Solid or ultra-soft gradient. Clean minimalist aesthetic. No textures.',
    title:
      'RENDER TEXT - TITLE: Luxury Serif Masthead (top position, center-aligned).',
    subtitle: 'RENDER TEXT - SUBTITLE: Large elegant serif, horizontal only.',
    infoBlock: 'RENDER TEXT - INFO: Smaller serif, clean spacing.',
    upperZone: 'UPPER: None.',
    constraints:
      'LAYOUT: Premium minimalist editorial cover. RENDER ALL TEXT BLOCKS DIRECTLY. No vertical typography. No italic.',
  },
};

export const MAGAZINE_COVER_ARCH: VisualArchitecture = {
  name: 'Magazine Cover',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Classic/Editorial',
  rules: {
    subject:
      'SUBJECT: Centered professional portrait. Eye level. High-end lighting.',
    background:
      'BACKGROUND: Minimalist studio background. Neutral color or subtle texture.',
    title:
      'RENDER TEXT - TITLE: Classic Serif Masthead (top position, authoritative).',
    subtitle: 'RENDER TEXT - SUBTITLE: Modern sans-serif text overlays.',
    infoBlock: 'RENDER TEXT - INFO: Side-aligned headlines in editorial grid.',
    upperZone: 'UPPER: Minor details (date, issue number).',
    constraints:
      'LAYOUT: Classic magazine cover hierarchy. RENDER ALL TEXT BLOCKS DIRECTLY. Publication quality.',
  },
};

export const EDITORIAL_MOTION_ARCH: VisualArchitecture = {
  name: 'Editorial Motion',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Dreamy/Fluid',
  rules: {
    subject:
      'SUBJECT: Subject in motion or with fluid fabric. Soft Ethereal edges.',
    background:
      'BACKGROUND: Abstract gradients, soft focus, dream-like atmosphere. Light leaks.',
    title:
      'RENDER TEXT - TITLE: Thin, wide-spaced sans-serif. Minimalist and elegant.',
    subtitle: 'RENDER TEXT - SUBTITLE: Artistic calligraphy or fine script.',
    infoBlock: 'RENDER TEXT - INFO: Subtle overlays or transparent blocks.',
    upperZone: 'UPPER: Minimalist branding elements.',
    constraints:
      'LAYOUT: Breathable, lots of negative space. RENDER ALL TEXT BLOCKS DIRECTLY. Reference: Kinfolk magazine.',
  },
};

export const SPLIT_TYPO_ARCH: VisualArchitecture = {
  name: 'Split Typo',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Minimalist/Block',
  rules: {
    subject:
      'SUBJECT: Subject confined to one half of the layout. Sharp silhouette.',
    background:
      'BACKGROUND: Strict two-tone split. Solid color block vs photographic.',
    title:
      'RENDER TEXT - TITLE: Massive typography filling the split zone. Bold block letters.',
    subtitle: 'RENDER TEXT - SUBTITLE: Horizontal contrast text. Small.',
    infoBlock: 'RENDER TEXT - INFO: Bottom-aligned strict grid.',
    upperZone: 'UPPER: Vertical branding lines.',
    constraints:
      'LAYOUT: Strict 50/50 split. Modernist Swiss design. RENDER ALL TEXT BLOCKS DIRECTLY.',
  },
};

export const LUXURY_SERIE_ARCH: VisualArchitecture = {
  name: 'Luxury Serie',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Gold/Black/White',
  rules: {
    subject: 'SUBJECT: Floating product or macro detail. Extreme sharp focus.',
    background:
      'BACKGROUND: Dark textured marble, silk, or premium paper texture.',
    title:
      'RENDER TEXT - TITLE: Luxury Serif with thin accents (Gold or Silver appearance).',
    subtitle:
      'RENDER TEXT - SUBTITLE: "LIMITED EDITION" or "PREMIUM" label. Small.',
    infoBlock: 'RENDER TEXT - INFO: Discreet premium typography.',
    upperZone: 'UPPER: Thin ornamental borders.',
    constraints:
      'LAYOUT: Golden ratio composition. RENDER ALL TEXT BLOCKS DIRECTLY. Reference: Rolex luxury ads.',
  },
};

export const VISUAL_ARCHITECTURES_MAP: Record<string, VisualArchitecture> = {
  FASHION_VERTICAL_IMPACT: FASHION_VERTICAL_IMPACT_ARCH,
  STREET_SALE: STREET_SALE_ARCH,
  MAGAZINE_COVER: MAGAZINE_COVER_ARCH,
  EDITORIAL_MOTION: EDITORIAL_MOTION_ARCH,
  SPLIT_TYPO: SPLIT_TYPO_ARCH,
  LUXURY_SERIE: LUXURY_SERIE_ARCH,
};

export function getVisualArchitecture(
  modelName: string,
): VisualArchitecture | undefined {
  const normalized = modelName?.toUpperCase()?.replace(/[\s-]+/g, '_');
  return (
    VISUAL_ARCHITECTURES_MAP[normalized] ||
    VISUAL_ARCHITECTURES_MAP[modelName?.toUpperCase()]
  );
}
