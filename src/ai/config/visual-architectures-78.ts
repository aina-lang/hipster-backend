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
  colorPalette: 'Primary/Overlaid',
  rules: {
    subject:
      'RICHE MONOCHROMATIC SUBJECT: Primary subject positioned in the TOP-RIGHT quadrant. Subject must be cropped/cut at the horizontal center line. Rich monochromatic styling in shades of the PRIMARY COLOR.',
    background:
      'HORIZONTAL SPLIT: Layout divided into two equal horizontal halves. Entire scene follows a rich monochromatic atmosphere with cinematic lighting.',
    title:
      'MAIN TITLE: Large bold sans-serif perfectly centered in the BOTTOM half. Color: White or high contrast.',
    subtitle:
      'SUBTITLE: Modern sans-serif positioned in the bottom half near the main title.',
    infoBlock:
      'TAG/BADGE: Small title/job in a dark rectangular box in the top-left corner.',
    upperZone: 'None.',
    constraints:
      'LAYOUT: Two-part horizontal split with vertical center line. Subject in top-right. NO circular crops by AI (applied in post-processing). High-end editorial aesthetic.',
  },
};

export const DIAGONAL_SPLIT_ARCH: VisualArchitecture = {
  name: 'Diagonal Split',
  layoutType: 'TYPE_DIAGONAL_SPLIT',
  colorPalette: 'Clean/Modern',
  rules: {
    subject:
      'SUBJECT: [SUBJECT] placed slightly off-center with strong lighting and professional photography style. Partially overlaid by the diagonal band.',
    background:
      'BACKGROUND: Clean white studio background. Minimalist advertising poster look.',
    title:
      'RENDER TEXT - MAIN TITLE: Large bold headline in modern sans-serif typography: "[MAIN TITLE]".',
    subtitle:
      'RENDER TEXT - SUBTITLE: Smaller subtitle underneath: "[SUBTITLE]".',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'LAYOUT: A large semi-transparent diagonal geometric band crosses the composition from top-left to bottom-right with the color [COLOR]. Geometric composition, modern branding poster, minimalist layout, professional studio lighting, ultra sharp.',
  },
};

export const DIAGONAL_SPLIT_DESIGN_ARCH: VisualArchitecture = {
  name: 'Diagonal Split Design',
  layoutType: 'TYPE_DIAGONAL_SPLIT_DESIGN',
  colorPalette: 'Monochromatic',
  rules: {
    subject:
      'RICHE MONOCHROMATIC SUBJECT: Primary subject positioned in the TOP-RIGHT quadrant. Subject must be cropped/cut at the horizontal center line. Rich monochromatic styling in shades of the PRIMARY COLOR. Cinematic lighting with deep shadows.',
    background:
      'HORIZONTAL SPLIT: Layout divided into two equal horizontal halves with subtle shade variation. Entire scene follows a rich monochromatic atmosphere with cinematic lighting. Circular lens overlay area positioned in TOP-LEFT quadrant (35-40% from left edge).',
    title:
      'MAIN TITLE: Large bold sans-serif centered in the BOTTOM half. Color: Secondary color. No underlines or decorations.',
    subtitle:
      'SUBTITLE: Modern sans-serif positioned in the bottom half. Color: Secondary color at 85% opacity.',
    infoBlock:
      'INFO LINE: Small minimalist sans-serif at the very bottom. Color: Secondary color at 75% opacity.',
    upperZone: 'Circular lens overlay in TOP-LEFT area.',
    constraints:
      'LAYOUT: Two-part horizontal split with vertical center line running from top to 80-85% height. Subject in top-right. Circular lens overlay in top-left. Vertical line breaks around all typography elements. High-end editorial aesthetic with Swiss design influence.',
  },
};

export const STUDIO_POSTER_ARCH: VisualArchitecture = {
  name: 'Studio Poster',
  layoutType: 'TYPE_STUDIO_POSTER',
  colorPalette: 'Minimal/Geometric',
  rules: {
    subject:
      'Clean cut-out subject centered in composition, slightly overlapping geometric shapes behind.',
    background:
      'Clean white or very light grey studio background. No gradients, no textures, no colored backgrounds.',
    title:
      'Optional title element using typography or minimal text (user-defined).',
    subtitle: 'Optional subtitle or supporting text (minimal, elegant).',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'LAYOUT: Minimal graphic design poster. Two geometric shapes (circle + vertical rounded rectangle) using primary color as flat elements behind the centered subject. Subject slightly overlaps shapes. Professional minimal poster aesthetic.',
  },
};

export const EDITORIAL_REVEAL_ARCH: VisualArchitecture = {
  name: 'Editorial Reveal',
  layoutType: 'TYPE_EDITORIAL_REVEAL',
  colorPalette: 'Monochromatic/Reveal',
  rules: {
    subject:
      'SUBJECT: One single subject (person, object, product, etc.). Centered and dominant.',
    background:
      'BACKGROUND: Full color, sharp, high detail, high contrast. One continuous professional studio background. NO blur, NO black and white, NO split.',
    title: 'None.',
    subtitle: 'None.',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'STYLE: Modern editorial poster, minimal graphic design. Background must be SHARP and FULL COLOR. The blurred B&W effect will be added in post-production. DO NOT generate the rectangle or desaturation yourself.',
  },
};

export const MONO_ACCENT_ARCH: VisualArchitecture = {
  name: 'Mono Accent',
  layoutType: 'TYPE_MONO_ACCENT',
  colorPalette: 'B&W / Single Accent',
  rules: {
    subject:
      'SUBJECT: Centered and large in the composition. High contrast professional photography. Mostly black and white. Only ONE color must remain: use [COLOR_SECONDAIRE] for the main clothing or an important object.',
    background:
      'BACKGROUND: Clean white or light grey textured background. Minimalist and professional.',
    title:
      'RENDER TEXT - TOP TITLE: Large bold title at the top. modern sans-serif. Color: Black.',
    subtitle:
      'RENDER TEXT - SUBTITLE: Placed under the title. smaller modern sans-serif. Color: [COLOR_SECONDAIRE].',
    infoBlock: 'None.',
    upperZone: 'None.',
    constraints:
      'LAYOUT: Minimalist editorial advertising poster. Only title and subtitle at the top. No text at the bottom. No logos. No extra information. High resolution commercial advertising style.',
  },
};

export const EPIC_BRAND_ARCH: VisualArchitecture = {
  name: 'Epic Brand',
  layoutType: 'TYPE_EPIC_BRAND',
  colorPalette: 'B&W / Accent Color',
  rules: {
    subject:
      'SUBJECT: Cinematic promotional poster with powerful double-exposure composition. Main subject in foreground with semi-transparent duplicate behind for depth effect.',
    background:
      'BACKGROUND: Partially white or very light for clean premium look. Behind subject create dramatic lighting effect using accent color.',
    title:
      'RENDER TEXT - MAIN TITLE: Bold modern typography. High contrast positioning.',
    subtitle:
      'RENDER TEXT - SUBTITLE: Supporting text below main title. Elegant and refined.',
    infoBlock: 'None.',
    upperZone: 'Color gradient overlay using accent color.',
    constraints:
      'LAYOUT: Cinematic double-exposure editorial poster. Mostly black and white with ONE strong accent color as dramatic lighting/glow. No logos. Ultra realistic photography. Strong contrast cinematic lighting.',
  },
};

export const NEON_EDITORIAL_ARCH: VisualArchitecture = {
  name: 'Neon Editorial',
  layoutType: 'TYPE_NEON_EDITORIAL',
  colorPalette: 'Dark / Neon Glow',
  rules: {
    subject:
      'SUBJECT: High contrast portrait photography. Subject appears mostly dark, almost black silhouette, with subtle light edges.',
    background:
      'BACKGROUND: Vibrant glowing gradient background using the accent color. Should feel luminous and atmospheric.',
    title:
      'RENDER TEXT - BACKGROUND TITLE: Very large typography, bold, partially hidden behind subject with 20-30% opacity.',
    subtitle:
      'RENDER TEXT - FOREGROUND TEXT: Clean modern typography, white text, centered or slightly above lower third, minimal and elegant.',
    infoBlock:
      'GRAPHIC DESIGN: Subtle futuristic UI elements including thin white graphic lines, micro typography, minimal tech interface elements, and abstract geometric overlays.',
    upperZone: 'Futuristic UI elements and abstract geometric overlays.',
    constraints:
      'LAYOUT: Modern editorial poster with startup visual aesthetic. High contrast, premium digital design, futuristic and minimal. No logos. Ultra realistic photography.',
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
  DIAGONAL_SPLIT: DIAGONAL_SPLIT_ARCH,
  DIAGONAL_SPLIT_DESIGN: DIAGONAL_SPLIT_DESIGN_ARCH,
  STUDIO_POSTER: STUDIO_POSTER_ARCH,
  EDITORIAL_REVEAL: EDITORIAL_REVEAL_ARCH,
  EPIC_BRAND: EPIC_BRAND_ARCH,
  NEON_EDITORIAL: NEON_EDITORIAL_ARCH,
  MONO_ACCENT: MONO_ACCENT_ARCH,
};

export function getVisualArchitecture(
  modelName: string,
): VisualArchitecture | undefined {
  const normalized = modelName?.toUpperCase()?.replace(/[\s-]+/g, '_');
  return VISUAL_ARCHITECTURES_MAP[normalized];
}
