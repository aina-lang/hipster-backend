export type SubjectPos =
  | 'center' // centré au milieu
  | 'center-bottom' // centré, ancré en bas
  | 'bleed-left' // déborde sur la gauche
  | 'bleed-right' // déborde sur la droite
  | 'full-bleed' // remplit toute la surface
  | 'top-center' // centré en haut
  | 'bottom-left' // coin bas gauche
  | 'bottom-right' // coin bas droit
  | 'none'; // pas de sujet

export type TitlePos =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'over-subject'
  | 'split-vertical';

export type BannerStyle =
  | 'strip-top' // bande pleine en haut
  | 'strip-bottom' // bande pleine en bas
  | 'strip-left' // bande verticale gauche
  | 'strip-right' // bande verticale droite
  | 'badge-circle' // badge rond
  | 'badge-pill' // badge arrondi horizontal
  | 'tag-corner' // étiquette coin haut-gauche
  | 'block-solid' // bloc rectangulaire
  | 'diagonal-cut' // découpe diagonale
  | 'none';

export type Particle =
  | 'confetti' // confettis colorés
  | 'stars' // étoiles / paillettes
  | 'sparks' // étincelles dorées
  | 'bokeh' // points lumineux flous
  | 'dust' // poussière / grains
  | 'geometric-shapes' // formes géométriques flottantes
  | 'dots-grid' // grille de points
  | 'lines-diagonal' // lignes diagonales
  | 'petals' // pétales de fleurs
  | 'bubbles' // bulles
  | 'snowflakes' // flocons
  | 'glitch-lines' // lignes de glitch
  | 'noise-grain' // grain photographique
  | 'none';

export type Decoration =
  | 'white-city-silhouette' // silhouette de ville blanche en bas
  | 'corner-marks' // marques de coin (repères imprimerie)
  | 'diagonal-stripe' // bande diagonale décorative
  | 'halftone-overlay' // trame demi-teinte
  | 'scanlines' // lignes de scan
  | 'ink-splatter' // éclaboussure d'encre
  | 'geometric-border' // bordure géométrique intérieure
  | 'floral-ornament' // ornement floral
  | 'grid-overlay' // grille superposée
  | 'wave-bottom' // vague en bas
  | 'arch-frame' // arche encadrante
  | 'torn-edge' // bord déchiré
  | 'foil-texture' // texture dorée / métallisée
  | 'neon-glow-outline' // contour lumineux néon
  | 'watermark-pattern' // motif en filigrane
  | 'ribbon-seal'
  | 'noise-grain'
  | 'glitch-lines' // ruban / sceau
  | 'none';

export type Background =
  | 'solid-dark' // fond uni sombre
  | 'solid-light' // fond uni clair
  | 'solid-color' // fond uni coloré
  | 'gradient-radial' // dégradé circulaire
  | 'gradient-linear' // dégradé linéaire
  | 'gradient-mesh' // dégradé maillé multicolore
  | 'texture-paper' // texture papier
  | 'texture-grain' // texture grain
  | 'texture-marble' // texture marbre
  | 'texture-fabric' // texture tissu / velours
  | 'photo-blur' // photo floutée
  | 'photo-overlay' // photo avec calque coloré
  | 'pattern-geometric' // motif géométrique répété
  | 'pattern-halftone'; // motif tramé

export type ColorFilter =
  | 'none' // aucun filtre
  | 'duotone' // bichromie
  | 'bw' // noir et blanc
  | 'sepia' // sépia
  | 'neon-wash' // lavage néon
  | 'color-pop' // couleurs ressortantes
  | 'matte' // mat / désaturé
  | 'vivid' // saturé / vif
  | 'faded'; // passé / vintage

export type Typography =
  | 'oversized-display' // énorme, déborde parfois du cadre
  | 'serif-editorial' // serif grand, élégant
  | 'sans-bold' // sans-serif gras
  | 'condensed-stack' // condensé empilé sur plusieurs lignes
  | 'script-hand' // manuscrit / cursive
  | 'mono-tech' // monospace technique
  | 'mixed-scale' // mix grandes et petites tailles
  | 'outlined' // lettres en contour uniquement
  | 'minimal-label'; // petit, très discret

export type Frame =
  | 'none'
  | 'thin-border' // fine bordure intérieure
  | 'thick-border' // bordure épaisse
  | 'double-border' // double bordure
  | 'corner-brackets' // crochets de coin
  | 'full-arch' // arche complète en haut
  | 'diagonal-split' // split diagonal
  | 'circle-crop' // recadrage circulaire
  | 'torn-edge'; // bord déchiré

export interface VariantStructure {
  subject: SubjectPos;
  subjectSize: 'hero' | 'large' | 'medium' | 'small' | 'none';
  title: TitlePos;
  banner: BannerStyle;
  particles: Particle;
  decorations: Decoration[];
  background: Background;
  colorFilter: ColorFilter;
  typography: Typography;
  frame: Frame;
}

export interface Variant {
  label: string;
  structure: VariantStructure;
}

export interface FlyerModel {
  label: string;
  image?: string; // URL string for backend
  variants: Variant[];
}

export interface FlyerCategory {
  id: string;
  label: string;
  icon: string; // Identifier for mapping in frontend
  image: string; // URL string for backend
  models: FlyerModel[];
}
