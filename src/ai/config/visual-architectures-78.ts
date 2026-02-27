export interface VisualArchitecture {
  name: string;
  layoutType: 'TYPE_FASHION_VERTICAL';
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

export const VISUAL_ARCHITECTURES_MAP: Record<string, VisualArchitecture> = {
  FASHION_VERTICAL_IMPACT: FASHION_VERTICAL_IMPACT_ARCH,
};

export function getVisualArchitecture(
  modelName: string,
): VisualArchitecture | undefined {
  return (
    VISUAL_ARCHITECTURES_MAP[modelName?.toUpperCase()?.replace(/\s+/g, '_')] ||
    VISUAL_ARCHITECTURES_MAP[modelName?.toUpperCase()]
  );
}
