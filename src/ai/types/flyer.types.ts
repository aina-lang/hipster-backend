export type SubjectPos =
  | 'center' // centré au milieu
  | 'center-bottom' // centré, ancré en bas
  | 'bleed-left' // déborde sur la gauche
  | 'bleed-right' // déborde sur la droite
  | 'full-bleed' // remplit toute la surface
  | 'full-portrait' // portrait plein cadre (Fashion Vertical)
  | 'top-center' // centré en haut
  | 'bottom-left' // coin bas gauche
  | 'bottom-right' // coin bas droit
  | 'centered-portrait' // portrait centré
  | 'product-center' // produit au centre
  | 'half-side' // d'un seul côté
  | 'floating-product' // produit flottant
  | 'dynamic-action' // action dynamique
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
  | 'split-vertical'
  | 'vertical-left'
  | 'top-overlay'
  | 'bold-diagonal'
  | 'split-screen'
  | 'elegant-serif'
  | 'kinetic-text';

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
  | 'dynamic-ribbon' // ruban dynamique
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
  | 'subtle-dust' // poussière subtile
  | 'urban-grit' // grain urbain
  | 'motion-blur' // flou de mouvement
  | 'gold-dust' // poussière dorée
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
  | 'gradient-overlay' // calque dégradé (Fashion Vertical)
  | 'gradient-dark-overlay' // calque dégradé sombre (Fashion Vertical Magazine)
  | 'accent-frame' // cadre accent (Fashion Vertical Luxury)
  | 'magazine-grid' // grille magazine
  | 'sticker-bombed' // stickers partout
  | 'color-block' // blocs de couleur
  | 'golden-ratio-lines' // lignes nombre d'or
  | 'cinematic-bars' // bandes cinéma
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
  | 'pattern-halftone' // motif tramé
  | 'studio-atmospheric' // studio atmosphérique (Fashion Vertical)
  | 'studio-professional' // studio professionnel (Fashion Vertical Luxury)
  | 'atmospheric-cinematic' // fond atmosphérique cinématique (Fashion Vertical Magazine)
  | 'minimalist-studio' // studio minimaliste
  | 'street-urban' // urbain street
  | 'solid-flat' // aplat de couleur
  | 'black-marble' // marbre noir
  | 'abstract-gradient'; // dégradé abstrait

export type ColorFilter =
  | 'none' // aucun filtre
  | 'duotone' // bichromie
  | 'bw' // noir et blanc
  | 'sepia' // sépia
  | 'neon-wash' // lavage néon
  | 'color-pop' // couleurs ressortantes
  | 'matte' // mat / désaturé
  | 'vivid' // saturé / vif
  | 'faded' // passé / vintage
  | 'duotone-accent' // bichromie avec accent couleur (Fashion Vertical)
  | 'sophisticated' // sophistiqué haut de gamme (Fashion Vertical Luxury)
  | 'editorial' // style magazine éditorial (Fashion Vertical Magazine)
  | 'vogue' // style Vogue
  | 'high-contrast' // contraste élevé
  | 'gold-tint' // teinte dorée
  | 'soft-dreamy'; // doux et rêveur

export type Typography =
  | 'oversized-display' // énorme, déborde parfois du cadre
  | 'serif-editorial' // serif grand, élégant
  | 'sans-bold' // sans-serif gras
  | 'condensed-stack' // condensé empilé sur plusieurs lignes
  | 'script-hand' // manuscrit / cursive
  | 'mono-tech' // monospace technique
  | 'mixed-scale' // mix grandes et petites tailles
  | 'outlined' // lettres en contour uniquement
  | 'minimal-label' // petit, très discret
  | 'ultra-bold-vertical' // texte vertical ultra-gras (Fashion Vertical)
  | 'didone-serif' // serif style Didone
  | 'heavy-display' // police impact
  | 'extra-bold-condensed' // extra gras condensé
  | 'luxury-serif' // serif de luxe
  | 'modern-sans'; // sans-serif moderne

export type Frame =
  | 'none'
  | 'thin-border' // fine bordure intérieure
  | 'thick-border' // bordure épaisse
  | 'double-border' // double bordure
  | 'corner-brackets' // crochets de coin
  | 'full-arch' // arche complète en haut
  | 'diagonal-split' // split diagonal
  | 'circle-crop' // recadrage circulaire
  | 'torn-edge' // bord déchiré
  | 'borderless' // sans cadre (Fashion Vertical)
  | 'thin-white' // fine bordure blanche
  | 'rough-edge' // bord rugueux
  | 'clean-border' // bord net
  | 'gold-inner'; // bordure intérieure dorée

export interface VariantStructure {
  subject: SubjectPos;
  subjectSize: 'hero' | 'large' | 'medium' | 'small' | 'none' | 'full';
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
  structure?: VariantStructure; // direct structure without variants
  variants?: Variant[]; // optional sub-variants
}

export interface FlyerCategory {
  id: string;
  label: string;
  icon: string; // Identifier for mapping in frontend
  image: string; // URL string for backend
  models: FlyerModel[];
}
