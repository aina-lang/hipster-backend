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
      'SUBJECT: Portrait full-frame, offset left. Crop serré, profondeur de champ cinématique (f/1.4–f/1.8). Editorial quality. Kinetic energy, sharp focus on face, confident posture.',
    background:
      'BACKGROUND: Dark moody environment, atmospheric depth. Dégradé sombre overlay (noir → transparent) haut/droite. Éclairage teinté par la COULEUR PRINCIPALE (colorPrincipale).',
    title:
      'TITLE_VERTICAL: Ultra Bold (Montserrat Black 900 / ExtraBold). Texte vertical SUR GAUCHE. Rotation 90°. Occupe 80–90% de la hauteur. Couleur = COULEUR PRINCIPALE (colorPrincipale). Contour léger ou lueur douce.',
    subtitle:
      "SUBTITLE_SCRIPT: Font script (Allura / Great Vibes) au centre-bas. Couleur = COULEUR SECONDAIRE (colorSecondaire) ou blanc si non définie. Lueur subtile. Phrase fournie par l'utilisateur.",
    infoBlock:
      'INFO_BASELINE: Tout en bas centré. Petites caps / tracking large. Blanc. Contenu: contact / adresse.',
    upperZone: 'UPPER: Absent.',
    constraints:
      "LAYOUT: FASHION_VERTICAL_IMPACT strict. COULEUR PRINCIPALE = couleur du titre vertical. COULEUR SECONDAIRE = couleur du sous-titre script. Max 3 blocs texte. PAS d'icônes, PAS de stickers. 8K. Référence: Vogue / Harper's Bazaar. Zero AI artifacts.",
  },
};

export const STREET_SALE_ARCH: VisualArchitecture = {
  name: 'Street Sale',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Urban/Vibrant',
  rules: {
    subject:
      'SUBJECT: Dynamic product shot or model in urban setting. High contrast, sharp edges. Motion blur on background for speed feel.',
    background:
      'BACKGROUND: Urban street, concrete textures, neon signs blurred in background. High contrast lighting.',
    title:
      'TITLE: Mega Bold Sans-Serif. Diagonal placement or tilted. High energy. Color = colorPrincipale (Neon/Vibrant).',
    subtitle:
      'SUBTITLE: Heavy sans-serif block text. "SALE" or "OFFER" emphasis. High visibility.',
    infoBlock:
      'INFO: Impactful typography, heavy tracking. High contrast colors.',
    upperZone: 'UPPER: Dynamic badges or price stickers.',
    constraints:
      'LAYOUT: High energy, non-grid, overlapping elements. Streetwear aesthetic. Reference: Nike/Adidas street campaigns.',
  },
};

export const MAGAZINE_COVER_ARCH: VisualArchitecture = {
  name: 'Magazine Cover',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Classic/Editorial',
  rules: {
    subject:
      'SUBJECT: Centered portrait, eye level. Subject interacts with the masthead (slight overlap). Studio lighting, clean crisp details.',
    background:
      'BACKGROUND: Minimalist studio background. Solid color or very subtle texture. Shadow depth to create 3D feel.',
    title:
      'TITLE: Classic Serif Masthead (Didot/Bodoni style). Horizontal, top position. Large and authoritative.',
    subtitle:
      'SUBTITLE: Modern Sans-Serif overlays. "The Issue" or "Special Edition" typography.',
    infoBlock:
      'INFO: Side-aligned headlines, varied weights. Editorial grid layout.',
    upperZone: 'UPPER: Barcode, date, and issue number.',
    constraints:
      'LAYOUT: Classic magazine cover hierarchy. High-end printing look. Clear text-over-image legibility.',
  },
};

export const EDITORIAL_MOTION_ARCH: VisualArchitecture = {
  name: 'Editorial Motion',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Dreamy/Fluid',
  rules: {
    subject:
      'SUBJECT: Subject in motion, fluid fabric, soft edges. Ethereal and artistic. High key lighting with soft shadows.',
    background:
      'BACKGROUND: Abstract gradients, soft focus, dream-like atmosphere. Fluid shapes and light leaks.',
    title:
      'TITLE: Thin, wide-spaced Sans-Serif. Minimalist and elegant. Sophisticated placement.',
    subtitle:
      'SUBTITLE: Artistic calligraphy or fine script. Intertwined with the subject.',
    infoBlock:
      'INFO: Transparent blocks or subtle overlays. Minimalist contact info.',
    upperZone: 'UPPER: Minimalist logo or branding.',
    constraints:
      'LAYOUT: Breathable, lots of negative space. Artistic movement feel. Reference: Kinfolk or CEREAL magazine.',
  },
};

export const SPLIT_TYPO_ARCH: VisualArchitecture = {
  name: 'Split Typo',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Minimalist/Block',
  rules: {
    subject:
      'SUBJECT: Subject confined to one half of the layout. Sharp silhouette, high contrast.',
    background:
      'BACKGROUND: Two-tone split. Solid color block on one side, photographic on the other.',
    title:
      'TITLE: Massive Typography filling the split zone. Vertically aligned or large block letters.',
    subtitle: 'SUBTITLE: Horizontal contrast text. Small and precise.',
    infoBlock: 'INFO: Bottom aligned, strict grid. Mono-spaced font style.',
    upperZone: 'UPPER: Vertical branding lines.',
    constraints:
      'LAYOUT: Strict 50/50 split. Modernist Swiss design influence. Precision and balance.',
  },
};

export const LUXURY_SERIE_ARCH: VisualArchitecture = {
  name: 'Luxury Serie',
  layoutType: 'TYPE_MAGAZINE',
  colorPalette: 'Gold/Black/White',
  rules: {
    subject:
      'SUBJECT: Floating product or macro detail. Extreme sharp focus, macro photography. Gold/Silver reflections.',
    background:
      'BACKGROUND: Dark textured marble, silk, or premium paper texture. Low key lighting, dramatic spotlight.',
    title:
      'TITLE: Luxury Serif with extremely thin accents. Gold or Metallic finish appearance.',
    subtitle:
      'SUBTITLE: "LIMITED EDITION" or "PREMIUM" label. Centered and small.',
    infoBlock: 'INFO: Golden ratio placement. Discreet but premium typography.',
    upperZone: 'UPPER: Thin ornamental borders or corners.',
    constraints:
      'LAYOUT: Golden ratio composition. Maximalist quality, minimalist content. Reference: Rolex/Patek Philippe ads.',
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
  const normalized = modelName?.toUpperCase()?.replace(/\s+/g, '_');
  return (
    VISUAL_ARCHITECTURES_MAP[normalized] ||
    VISUAL_ARCHITECTURES_MAP[modelName?.toUpperCase()]
  );
}
