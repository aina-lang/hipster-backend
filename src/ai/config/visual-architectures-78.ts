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

export const MAGAZINE_COVER_POSTER_ARCH: VisualArchitecture = {
  name: 'Magazine Cover Poster',
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

export const IMPACT_COMMERCIAL_ARCH: VisualArchitecture = {
  name: 'Impact Commercial',
  layoutType: 'TYPE_IMPACT_COMMERCIAL',
  colorPalette: 'Monochromatic/Single',
  rules: {
    subject:
      'SUBJECT: Centered, slightly levitating with soft drop shadow. Premium and clean.',
    background:
      'BACKGROUND: Flat solid single color. NO textures, NO patterns.',
    title:
      'RENDER TEXT - BACKGROUND WORD: Very large, tone-on-tone, partially behind subject.',
    subtitle:
      'RENDER TEXT - PROMO BADGE: Small black rectangle top-right with white text.',
    infoBlock:
      'RENDER TEXT - CTA BUTTON: Rounded black button bottom-center with white text.',
    upperZone: 'UPPER: Promo badge only.',
    constraints:
      'LAYOUT: Modern minimalist ad poster. 3 text elements only. Instagram premium aesthetic.',
  },
};
export const EDITORIAL_MOTION_ARCH: VisualArchitecture = {
  name: 'Editorial Motion',
  layoutType: 'TYPE_EDITORIAL',
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

export const PRESTIGE_ARCH: VisualArchitecture = {
  name: 'Prestige',
  layoutType: 'TYPE_PRESTIGE_BW',
  colorPalette: 'Black & White',
  rules: {
    subject: 'Centered hero shot, luxury B&W photography.',
    background: 'Deep black with mist and halo backlight.',
    title: 'Large elegant serif at the bottom.',
    subtitle: 'None.',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints: 'Black and white only. Luxury aesthetic. Minimalist.',
  },
};

export const SIGNATURE_SPLASH_ARCH: VisualArchitecture = {
  name: 'Signature Splash',
  layoutType: 'TYPE_SIGNATURE_SPLASH',
  colorPalette: 'Adaptive/Multi',
  rules: {
    subject:
      'One single centered main subject. One dynamic splash effect automatically adapted (liquid, powder, sauce, oil, water, fire, dust, petals).',
    background:
      'Solid or soft gradient background adapted to subject. Clean and minimal.',
    title: 'Top: Large bold uppercase serif headline.',
    subtitle: 'Center (over subject): Elegant italic handwritten subtitle.',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'Ultra realistic advertising poster. Studio photography aesthetic. Maximum two secondary elements. No background clutter. No logos. No badges. Professional typography. No decorative overlays.',
  },
};

export const EDITORIAL_GRID_ARCH: VisualArchitecture = {
  name: 'Editorial Grid',
  layoutType: 'TYPE_EDITORIAL_GRID',
  colorPalette: 'Luxury/Gradient',
  rules: {
    subject:
      'Same single photograph cleanly split across 3 perfectly aligned vertical panels. Equal width, equal spacing, perfect alignment.',
    background:
      'Smooth luxury gradient background. Elegant prestige gradient with very light grid texture overlay. Clean premium aesthetic.',
    title:
      'Bottom: Very large bold serif headline (Didot or Playfair Display style), uppercase.',
    subtitle:
      'Bottom: Elegant italic script font, refined, positioned below main title.',
    infoBlock:
      'Bottom: Small spaced uppercase sans-serif call to action, centered.',
    upperZone: 'None.',
    constraints:
      'Premium editorial poster with 3-panel symmetrical layout. Luxury branding. No distortion. No clutter. Professional photography. High resolution advertising ready.',
  },
};

export const FOCUS_CIRCLE_ARCH: VisualArchitecture = {
  name: 'Focus Circle',
  layoutType: 'TYPE_FOCUS_CIRCLE',
  colorPalette: 'Primary/Secondary',
  rules: {
    subject:
      'Place the main subject image in the top half of the poster. Can be a person, product, animal, building, or object.',
    background:
      'Use a textured gradient background with slight poster grain. Colors: Primary and Secondary.',
    title:
      'MAIN TITLE: Very large bold modern sans-serif in the center. Color: Secondary Color.',
    subtitle: 'None.',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'LAYOUT: Vertical flyer (A4). CENTER DIVIDER: Thin vertical line exactly in the center using PRIMARY COLOR. LEFT SIDE: Large circular graphic element overlapping subject, showing a BLACK AND WHITE crop of the subject inside.',
  },
};

export const VISUAL_ARCHITECTURES_MAP: Record<string, VisualArchitecture> = {
  FASHION_VERTICAL_IMPACT: FASHION_VERTICAL_IMPACT_ARCH,
  MAGAZINE_COVER_POSTER: MAGAZINE_COVER_POSTER_ARCH,
  IMPACT_COMMERCIAL: IMPACT_COMMERCIAL_ARCH,
  EDITORIAL_MOTION: EDITORIAL_MOTION_ARCH,
  PRESTIGE: PRESTIGE_ARCH,
  SIGNATURE_SPLASH: SIGNATURE_SPLASH_ARCH,
  EDITORIAL_GRID: EDITORIAL_GRID_ARCH,
  FOCUS_CIRCLE: FOCUS_CIRCLE_ARCH,
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
