export interface VisualArchitecture {
    name: string;
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

/* ---------------- 1. MODERNE (9 Styles) ---------------- */

export const MODERN_DEFAULT_ARCH: VisualArchitecture = {
    name: 'Moderne Standard',
    rules: {
        subject: 'SUBJECT: Centered portrait. Sharp professional focus. Occupies 50% vertical space.',
        background: 'BACKGROUND: Minimalist studio background with subtle depth-of-field. Neutral grey tones.',
        title: 'TITLE: Clean sans-serif. Centered in lower third. Dark grey color.',
        subtitle: 'SUBTITLE: Thin minimalist tagline exactly 20px below title.',
        infoBlock: 'INFO: Single horizontal line at bottom. Date | Time | Location separated by bullets.',
        upperZone: 'UPPER: Empty. Fixed 10% top margin.',
        constraints: 'CLARITY: High contrast. No gradients. Swiss-style grid alignment.',
    },
};

export const MODERN_FLAT_ARCH: VisualArchitecture = {
    name: 'Moderne Flat Design',
    rules: {
        subject: 'SUBJECT: 2D stylized vector illustration. Bold outlines. No shading.',
        background: 'BACKGROUND: Solid vibrant color. Abstract geometric vector patterns (circles, triangles).',
        title: 'TITLE: Thick rounded sans-serif. No depth or shadows. High contrast.',
        subtitle: 'SUBTITLE: Simple text block in white. Left-aligned.',
        infoBlock: 'INFO: Flat colored rectangular badges for Date/Time. Fixed positions.',
        upperZone: 'UPPER: Flat 2D vector logo.',
        constraints: 'FLATNESS: No gradients, no shadows, no textures. Pure 2D aesthetic.',
    },
};

export const MODERN_GLASS_ARCH: VisualArchitecture = {
    name: 'Moderne Glassmorphism',
    rules: {
        subject: 'SUBJECT: Slight off-center placement (45% left). Soft studio lighting.',
        background: 'BACKGROUND: Vibrant abstract blur behind frosted glass panels. Translucent layers.',
        title: 'TITLE: White sans-serif on a frosted glass floating panel. Centered.',
        subtitle: 'SUBTITLE: Text with 70% opacity inside the same glass panel.',
        infoBlock: 'INFO: Glass pills at the bottom corners. Semi-transparent borders.',
        upperZone: 'UPPER: Floating glass logo holder at top-right.',
        constraints: 'DEPTH: Layered frosted surfaces. Soft shadows. Pastel color palette.',
    },
};

export const MODERN_NEON_ARCH: VisualArchitecture = {
    name: 'Moderne Néon',
    rules: {
        subject: 'SUBJECT: Rim-lit with blue and pink neon lights. High contrast.',
        background: 'BACKGROUND: Dark obsidian. Glowing neon tubes and electric grids. Cyberpunk vibe.',
        title: 'TITLE: Neon glow text effect. Vibrant cyan or magenta.',
        subtitle: 'SUBTITLE: Small glowing tag below the title.',
        infoBlock: 'INFO: Horizontal glowing neon bars as separators for event details.',
        upperZone: 'UPPER: Glowing electric glyph at top-center.',
        constraints: 'GLOW: High contrast darks. Saturated electric colors. Soft neon bloom.',
    },
};

export const MODERN_GEOMETRIC_ARCH: VisualArchitecture = {
    name: 'Moderne Géométrique',
    rules: {
        subject: 'SUBJECT: Centered. Framed by sharp 45-degree geometric vector shapes.',
        background: 'BACKGROUND: Grid of triangles and polygons. High-contrast monochromatic colors.',
        title: 'TITLE: Hard-edge square-slab font. Placed inside a solid rectangle.',
        subtitle: 'SUBTITLE: Vertical text alignment on the left edge.',
        infoBlock: 'INFO: Angular block containers for event data. Technical look.',
        upperZone: 'UPPER: Small triangle glyph at top-center.',
        constraints: 'SHARPNESS: Zero curves. Strict isometric or 45-degree angles.',
    },
};

export const MODERN_DARK_ARCH: VisualArchitecture = {
    name: 'Fond Sombre Premium',
    rules: {
        subject: 'SUBJECT: Low-key lighting. Heroic rim-light highlighting the silhouette.',
        background: 'BACKGROUND: Pure obsidian black. Subtle carbon fiber or dark slate texture.',
        title: 'TITLE: Bright white or glowing accent font. Centered horizontally.',
        subtitle: 'SUBTITLE: Muted grey text directly above the title.',
        infoBlock: 'INFO: Thin neon line separating details. High-end night-mode aesthetic.',
        upperZone: 'UPPER: Small glowing brand emblem.',
        constraints: 'CONTRAST: Deep blacks. High-specular highlights. No ambient light.',
    },
};

export const MODERN_GRADIENT_ARCH: VisualArchitecture = {
    name: 'Moderne Dégradé',
    rules: {
        subject: 'SUBJECT: Centered. Soft lighting blending with background colors.',
        background: 'BACKGROUND: Smooth linear gradient (45deg) between two vibrant brand colors.',
        title: 'TITLE: White bold sans-serif with subtle drop shadow.',
        subtitle: 'SUBTITLE: Clean white text in all-caps.',
        infoBlock: 'INFO: White minimalist icons for Date/Location. Fixed bottom row.',
        upperZone: 'UPPER: Gradient-tints on a small top-center logo.',
        constraints: 'VIBRANCY: Use only the two primary accent colors. Liquid smooth transitions.',
    },
};

/* ---------------- 2. FUN / COLORÉ (8 Styles) ---------------- */

export const PLAYFUL_VIBRANT_ARCH: VisualArchitecture = {
    name: 'Coloré Vibrant',
    rules: {
        subject: 'SUBJECT: Dynamic energetic pose. Centered. Surrounded by floating confetti.',
        background: 'BACKGROUND: Explosion of primary colors. Dynamic organic paint splashes.',
        title: 'TITLE: Bouncy, thick typography with multiple colors. Tilted 10 degrees.',
        subtitle: 'SUBTITLE: Energetic tagline in a star-shaped bubble.',
        infoBlock: 'INFO: Scattered colorful circles containing event details at the bottom.',
        upperZone: 'UPPER: Smile icon or party popper silhouette.',
        constraints: 'ENERGY: High saturation. No neutral colors. Maximalist joy.',
    },
};

export const PLAYFUL_PASTEL_ARCH: VisualArchitecture = {
    name: 'Pastel Doux',
    rules: {
        subject: 'SUBJECT: Soft lighting. Dreamy atmosphere. Posed gently.',
        background: 'BACKGROUND: Soft mint, lavender, and peach gradients. Fluffy cloud shapes.',
        title: 'TITLE: Elegant rounded font in white. Centered.',
        subtitle: 'SUBTITLE: Delicate cursive tagline below the title.',
        infoBlock: 'INFO: Semi-transparent white rounded panels for date and location.',
        upperZone: 'UPPER: Soft heart or star icon.',
        constraints: 'SOFTNESS: Desaturated tones. Gentle transitions. Peaceful vibe.',
    },
};

export const PLAYFUL_CARTOON_ARCH: VisualArchitecture = {
    name: 'Cartoon 3D Style',
    rules: {
        subject: 'SUBJECT: Stylized 3D character with exaggerated proportions. Vibrant eyes.',
        background: 'BACKGROUND: 3D toy-world environment. Oversized props and soft plastic lighting.',
        title: 'TITLE: Thick bubbly 3D typography with high-specular highlights.',
        subtitle: 'SUBTITLE: Cartoonish tag in a speech bubble.',
        infoBlock: 'INFO: Rounded colorful buttons at the bottom. Playful toy-like font.',
        upperZone: 'UPPER: Small mascot head silhouette.',
        constraints: 'CARTOON: Soft shadows, bright primary colors, bouncy composition.',
    },
};

export const PLAYFUL_POP_ART_ARCH: VisualArchitecture = {
    name: 'Pop Art Andy Warhol',
    rules: {
        subject: 'SUBJECT: Multi-color screenprint style (4 quadrants). High contrast halftone dots.',
        background: 'BACKGROUND: Vibrant split background (Cyan, Yellow, Magenta). Ben-Day dots.',
        title: 'TITLE: Comic-book block letters with thick black outlines.',
        subtitle: 'SUBTITLE: Slanted text box with "WHAM!" style energy.',
        infoBlock: 'INFO: High-contrast black and white newsprint style info chunks.',
        upperZone: 'UPPER: Stylized star with "Special" text.',
        constraints: 'RETRO POP: Flat colors, thick outlines, zero gradients.',
    },
};

export const PLAYFUL_KIDS_ARCH: VisualArchitecture = {
    name: 'Fun Enfants',
    rules: {
        subject: 'SUBJECT: Centered. Surrounded by floating toy-like 3D icons (blocks, stars).',
        background: 'BACKGROUND: Soft sky blue or sunny yellow with hand-drawn crayon patterns.',
        title: 'TITLE: Bubbly rainbow-colored font. Slightly tilted (5 degrees).',
        subtitle: 'SUBTITLE: Placed in a white cloud-shaped bubble.',
        infoBlock: 'INFO: Colorful rounded badges with "Doodle" style borders.',
        upperZone: 'UPPER: Flying kite or sun icon at the corner.',
        constraints: 'JOY: Primary colors. Soft rounded corners. High saturation.',
    },
};

export const PLAYFUL_CONFETTI_ARCH: VisualArchitecture = {
    name: 'Style Confettis',
    rules: {
        subject: 'SUBJECT: Dynamic action pose. Centered. Overlaid with falling 3D confetti.',
        background: 'BACKGROUND: White studio with multi-colored paper streamers hanging.',
        title: 'TITLE: Festive thick typography with glitter texture.',
        subtitle: 'SUBTITLE: Diagonal text banner crossing the lower third.',
        infoBlock: 'INFO: Confetti-patterned footer bar. High energy.',
        upperZone: 'UPPER: A single large party popper vector.',
        constraints: 'CELEBRATION: High particle count. Vibrant chaotic but balanced color.',
    },
};

export const PLAYFUL_ABSTRACT_ARCH: VisualArchitecture = {
    name: 'Abstrait Artistique',
    rules: {
        subject: 'SUBJECT: Asymmetrical (Left side). Partially masked by fluid paint drips.',
        background: 'BACKGROUND: Large organic fluid shapes in clashing vibrant colors.',
        title: 'TITLE: Avant-garde typography. Varied scale for each letter.',
        subtitle: 'SUBTITLE: Vertical alignment on the right edge.',
        infoBlock: 'INFO: Scattered artistic blocks with ink-splatter borders.',
        upperZone: 'UPPER: One large abstract circle at the top-left corner.',
        constraints: 'ART: Free-form composition. No straight lines. High-end gallery vibe.',
    },
};

/* ---------------- 3. LUXE (10 Styles) ---------------- */

export const LUXURY_WHITE_GOLD_ARCH: VisualArchitecture = {
    name: 'Blanc & Or Deluxe',
    rules: {
        subject: 'SUBJECT: Pure white angelic lighting. High-key portrait. Centered.',
        background: 'BACKGROUND: White marble with thin gold veins. Soft white silk textures.',
        title: 'TITLE: Delicate thin-line gold foil typography. Extremely elegant.',
        subtitle: 'SUBTITLE: Minimalist name in soft grey cursive.',
        infoBlock: 'INFO: Clean white dividers. Minimalist gold icons for date/time.',
        upperZone: 'UPPER: Embossed white brand logo.',
        constraints: 'PURITY: Bright, airy, and expensive feeling. Symmetrical.',
    },
};

export const LUXURY_NOIR_OR_ARCH: VisualArchitecture = {
    name: 'Noir & Or Premium',
    rules: {
        subject: 'SUBJECT: Silhouette or rim-lit portrait. High class evening wear.',
        background: 'BACKGROUND: Solid matte black obsidian. Deep gold geometric accents.',
        title: 'TITLE: Polished 24k gold leaf typography. High-end serif.',
        subtitle: 'SUBTITLE: Elegant cursive name below.',
        infoBlock: 'INFO: Gold foil thin lines separating the details.',
        upperZone: 'UPPER: Small gold crown or crest.',
        constraints: 'PRESTIGE: Absolute premium lighting. Minimalist but expensive textures.',
    },
};

export const LUXURY_ROYAL_ARCH: VisualArchitecture = {
    name: 'Royal Purple & Gold',
    rules: {
        subject: 'SUBJECT: Subject on a velvet throne or with ornate royal attire.',
        background: 'BACKGROUND: Deep royal purple velvet curtains. Ornate golden flourishes.',
        title: 'TITLE: Gothic or Ornate Serif font in 24k gold leaf texture.',
        subtitle: 'SUBTITLE: "By Royal Appointment" style subtitle.',
        infoBlock: 'INFO: Wax seal icons for the event details. Ornate golden scrolls.',
        upperZone: 'UPPER: Golden crown crest.',
        constraints: 'MAJESTY: Deep jewel tones. Rich textures. Extreme symmetry.',
    },
};

export const LUXURY_BASE_ARCH: VisualArchitecture = {
    name: 'Luxe Premium Base',
    rules: {
        subject: 'SUBJECT: Symmetrical high-fashion portrait. Centered and breathable.',
        background: 'BACKGROUND: Matte textures, silk, or marble. Premium rim lighting.',
        title: 'TITLE: Thin elegant serif. Golden or silver foil texture.',
        subtitle: 'SUBTITLE: Minimalist "presents" in small refined font.',
        infoBlock: 'INFO: Elegant horizontal silk or gold ribbons. Symmetrical footer.',
        upperZone: 'UPPER: Luxury brand crest or minimalist logo.',
        constraints: 'BREATHING ROOM: Wide margins. Extremely high production value.',
    },
};

export const ANNIVERSARY_CHIC_ARCH: VisualArchitecture = {
    name: 'Anniversaire Chic & Glam',
    rules: {
        subject: 'SUBJECT: Centered professional portrait. Elegant attire. Occupies middle 50% vertical space.',
        background: 'BACKGROUND: Deep luxury black. Golden metallic curves and frames. Clusters of glossy golden 3D balloons on sides.',
        title: 'TITLE: "HAPPY BIRTHDAY" in bold premium font. Red and white contrast. Centered below subject.',
        subtitle: 'SUBTITLE: Person name in a glowing neon-bordered rectangular tag below the title.',
        infoBlock: 'INFO: Date in golden round badges at the bottom-left and bottom-right corners. Time centered at the very bottom.',
        upperZone: 'UPPER: Small golden "PRESENTS" banner at the top center.',
        constraints: 'VIP VIBE: Gold and Black palette. High-shine textures. Symmetrical elegance.',
    },
};

export const LUXURY_GOLD_BRIGHT_ARCH: VisualArchitecture = {
    name: 'Doré Brillant Luxe',
    rules: {
        subject: 'SUBJECT: Centered. Golden reflective highlights on skin/clothing.',
        background: 'BACKGROUND: Liquid gold texture. Exploding golden dust particles.',
        title: 'TITLE: Massive 3D extruded gold typography. High-gloss.',
        subtitle: 'SUBTITLE: Slanted gold ribbon below the title.',
        infoBlock: 'INFO: Golden embossed text on a semi-transparent black bar.',
        upperZone: 'UPPER: Floating golden diamond icon.',
        constraints: 'GLAMOUR: High specularity. Everything must shine. Warm yellow-gold palette.',
    },
};

/* ---------------- 4. FESTIF (13 Styles) ---------------- */

export const FESTIVE_DJ_ARCH: VisualArchitecture = {
    name: 'DJ Party Night',
    rules: {
        subject: 'SUBJECT: DJ behind decks, low angle shot. Hands on mixers.',
        background: 'BACKGROUND: Blurry dance floor, laser beams, and speaker stacks. High energy.',
        title: 'TITLE: Giant distressed sans-serif. Overlapping the subject hands.',
        subtitle: 'SUBTITLE: Support act names in vertical blocks.',
        infoBlock: 'INFO: Sharp neon-colored rectangles for time and venue details.',
        upperZone: 'UPPER: Brand logo with radial light rays.',
        constraints: 'VIBRANCY: Intense saturated blues and purples. Cinematic club vibe.',
    },
};

export const FESTIVE_NEON_NIGHT_ARCH: VisualArchitecture = {
    name: 'Neon Night Club',
    rules: {
        subject: 'SUBJECT: Medium shot. Rim-lit with intense pink and azure neon.',
        background: 'BACKGROUND: Dark club interior. Glowing geometric neon ceiling.',
        title: 'TITLE: Custom neon-tube font. Flickering light effect.',
        subtitle: 'SUBTITLE: Piled-up neon tags in various colors.',
        infoBlock: 'INFO: Vertical blue neon bars as column separators.',
        upperZone: 'UPPER: Glowing "LIVE" neon sign at top-right.',
        constraints: 'ATMOSPHERE: High fog/haze. Deep saturated blacks. Electric vibrations.',
    },
};

export const FESTIVE_GLOW_ARCH: VisualArchitecture = {
    name: 'Glow Party',
    rules: {
        subject: 'SUBJECT: Subject covered in UV-reactive neon paint. Glowing accessories.',
        background: 'BACKGROUND: Pitch black room under specialized UV blacklight. Glowing paint splatters.',
        title: 'TITLE: Electric white font with multi-color outer glow.',
        subtitle: 'SUBTITLE: Glowing handwritten script below.',
        infoBlock: 'INFO: Fluorescent green and orange text blocks.',
        upperZone: 'UPPER: Glowing atomic or spiral icon.',
        constraints: 'UV VIBE: Extreme contrast. Bioluminescent colors. Dark atmosphere.',
    },
};

export const FESTIVE_URBAN_ARCH: VisualArchitecture = {
    name: 'Urban Street Style',
    rules: {
        subject: 'SUBJECT: Subject in high-end streetwear. Posed against a concrete wall.',
        background: 'BACKGROUND: Graffiti-covered alleyway. Industrial textures (brick, metal).',
        title: 'TITLE: Stencil or spray-paint font. Overlapping background elements.',
        subtitle: 'SUBTITLE: Text on a "Do Not Cross" yellow tape banner.',
        infoBlock: 'INFO: Rugged cardboard-textured blocks for info.',
        upperZone: 'UPPER: Small stylized spray can silhouette.',
        constraints: 'RAW: Gritty textures. Desaturated urban colors with occasional neon pops.',
    },
};

export const FESTIVE_AFRO_VIBE_ARCH: VisualArchitecture = {
    name: 'Afro Vibe Party',
    rules: {
        subject: 'SUBJECT: Centered. Vibrant traditional or modern afro-fusion attire.',
        background: 'BACKGROUND: Warm earth tones coupled with vibrant traditional pattern overlays.',
        title: 'TITLE: Bold tribal-inspired typography. Warm oranges and yellows.',
        subtitle: 'SUBTITLE: Handwritten script with wooden texture.',
        infoBlock: 'INFO: Patterned footer bar with geometric tribal frames.',
        upperZone: 'UPPER: Stylized sun or traditional mask silhouette.',
        constraints: 'WARMTH: High saturation. Rich cultural textures. Energetic drum patterns in background.',
    },
};

export const FESTIVE_BEACH_ARCH: VisualArchitecture = {
    name: 'Beach Party Sunset',
    rules: {
        subject: 'SUBJECT: Relaxed pose. Summer attire. Warm golden-hour lighting.',
        background: 'BACKGROUND: Tropical beach, calm turquoise water, and a purple sunset sky.',
        title: 'TITLE: Brush-script font in coral or teal colors.',
        subtitle: 'SUBTITLE: Text inside a wooden surfboard silhouette.',
        infoBlock: 'INFO: "Boarding at..." instead of "Time". Placed on a sand-textured footer.',
        upperZone: 'UPPER: Floating orange sunset sun icon.',
        constraints: 'SUMMER: Soft warm lighting. High-key colors. Vacation vibe.',
    },
};

export const ANNIVERSARY_ROCK_ARCH: VisualArchitecture = {
    name: 'Anniversaire Rock & Roll',
    rules: {
        subject: 'SUBJECT: Centered with electric guitars on shoulders. High energy pose.',
        background: 'BACKGROUND: Dark textured wall with purple/magenta neon glow. Flying musical notes.',
        title: 'TITLE: "ROCK BIRTHDAY" in aggressive distressed font with metallic chrome texture.',
        subtitle: 'SUBTITLE: Band name or person name in a sticker-style font.',
        infoBlock: 'INFO: Concert-style footer bar with ticket price and venue. Heavy grunge textures.',
        upperZone: 'UPPER: Logo of a stylized skull with a party hat.',
        constraints: 'EDGY: High contrast blacks and electric purples. Gritty concert poster vibes.',
    },
};

export const ANNIVERSARY_TROPICAL_ARCH: VisualArchitecture = {
    name: 'Anniversaire Tropical',
    rules: {
        subject: 'SUBJECT: Middle shot, relaxed vibe. Palm leaf shadows across the face.',
        background: 'BACKGROUND: Beach sunset with lush monstera leaves and hibiscus flowers in the corners.',
        title: 'TITLE: "ISLAND BIRTHDAY" in bamboo or handwritten cursive teal font.',
        subtitle: 'SUBTITLE: Person name in a sand-textured soft beige label.',
        infoBlock: 'INFO: "BOARDING TIME" instead of just time. Placed in a wooden surfboard shaped footer.',
        upperZone: 'UPPER: Tropical sun icon or parrot silhouette.',
        constraints: 'VACATION: Warm oranges, teals, and vibrant leafy greens. Summer sunset lighting.',
    },
};

export const ANNIVERSARY_CLASSIQUE_ARCH: VisualArchitecture = {
    name: 'Anniversaire Classique',
    rules: {
        subject: 'SUBJECT: Happy centered person holding a cake or gifts. Warm friendly smile.',
        background: 'BACKGROUND: Clean studio background with floating colorful balloons and hanging streamers.',
        title: 'TITLE: "Joyeux Anniversaire" in friendly rounded font. Vibrant primary colors.',
        subtitle: 'SUBTITLE: Person name in a simple white label with a colorful border.',
        infoBlock: 'INFO: Clear text block at bottom center. High readability.',
        upperZone: 'UPPER: A single falling piece of cake icon or a party blower.',
        constraints: 'FAMILY: Bright, welcoming lighting. High saturation. Cheerful atmosphere.',
    },
};

export const FESTIVE_BASE_ARCH: VisualArchitecture = {
    name: 'Festive General',
    rules: {
        subject: 'SUBJECT: Low angle power shot. Subject appears heroic and energetic.',
        background: 'BACKGROUND: Dynamic lasers, smoke, or pulsing club lights. High energy.',
        title: 'TITLE: Aggressive, high-contrast diagonal banners. High impact typography.',
        subtitle: 'SUBTITLE: Slanted text blocks, glowing or neon effects.',
        infoBlock: 'INFO: Rough textured blocks or neon bars for event details.',
        upperZone: 'UPPER: Dynamic lighting rays or brand logo.',
        constraints: 'ENERGY: Composition must feel cinematic and fast-paced.',
    },
};

/* ---------------- 5. PRO / CORPORATE (8 Styles) ---------------- */

export const CORPORATE_BASE_ARCH: VisualArchitecture = {
    name: 'Corporate General',
    rules: {
        subject: 'SUBJECT: Professional portrait. One-third placement (Left or Right).',
        background: 'BACKGROUND: Modern office or abstract professional texture.',
        title: 'TITLE: Strict sans-serif. Placed in negative space.',
        subtitle: 'SUBTITLE: Small structured business tagline below title.',
        infoBlock: 'INFO: Clean vertical sidebar or structured footer block.',
        upperZone: 'UPPER: Small company logo or webinar hashtag.',
        constraints: 'PRECISION: Grid-based alignment. Trustworthy tones.',
    },
};

export const CORPORATE_TECH_ARCH: VisualArchitecture = {
    name: 'Corporate Tech Digital',
    rules: {
        subject: 'SUBJECT: Person using a tablet or holographic interface. Scientific look.',
        background: 'BACKGROUND: Blue-tinted tech laboratory. Data visualizations floating in background.',
        title: 'TITLE: Modern square-slab typography. Left-aligned.',
        subtitle: 'SUBTITLE: "Innovation series" tagline in small geometric font.',
        infoBlock: 'INFO: Data clusters and icons instead of simple text blocks.',
        upperZone: 'UPPER: Digital tech glyph.',
        constraints: 'PRECISION: Grid-based, high-tech, clean digital aesthetic.',
    },
};

export const CORPORATE_STARTUP_ARCH: VisualArchitecture = {
    name: 'Startup Moderne',
    rules: {
        subject: 'SUBJECT: Friendly semi-casual portrait. Holding a laptop or coffee.',
        background: 'BACKGROUND: Minimalist co-working space with blurred greenery.',
        title: 'TITLE: Rounded friendly sans-serif. Pastel accent colors.',
        subtitle: 'SUBTITLE: "Join the future" tagline in a small pill button.',
        infoBlock: 'INFO: Modern grid icons for date/time. High whitespace.',
        upperZone: 'UPPER: Small abstract geometric logo.',
        constraints: 'ACCESSIBILITY: Bright, welcoming tones. Clean and fast-paced feeling.',
    },
};

/* ---------------- 6. SPORT (7 Styles) ---------------- */

export const SPORT_COMP_ARCH: VisualArchitecture = {
    name: 'Sport Compétition',
    rules: {
        subject: 'SUBJECT: Centered intense action shot. Eyes focused on camera.',
        background: 'BACKGROUND: High-contrast stadium lighting. Motion blur on edges.',
        title: 'TITLE: Bold italic sans-serif. Lower third alignment.',
        subtitle: 'SUBTITLE: Championship name in a metallic badge.',
        infoBlock: 'INFO: High-visibility yellow or white text on a black bar.',
        upperZone: 'UPPER: League logo on the top-right.',
        constraints: 'POWER: High contrast. Aggressive but clean composition.',
    },
};

export const SPORT_FITNESS_ARCH: VisualArchitecture = {
    name: 'Fitness Impact',
    rules: {
        subject: 'SUBJECT: Dynamic action shot (lifting or running). Sweat texture visible.',
        background: 'BACKGROUND: Gritty gym environment. High-contrast spotlights.',
        title: 'TITLE: Tall, heavy impact font. Distressed metal texture.',
        subtitle: 'SUBTITLE: Gym name in a sharp-angled banner.',
        infoBlock: 'INFO: "SESSION START" instead of Time. Lower third alignment.',
        upperZone: 'UPPER: Fitness club emblem.',
        constraints: 'RAW POWER: High contrast shadows. Gritty textures. Epic scale.',
    },
};

export const SPORT_BASE_ARCH: VisualArchitecture = {
    name: 'Sport General',
    rules: {
        subject: 'SUBJECT: Extreme motion. Crossing the frame diagonally. Epic scale.',
        background: 'BACKGROUND: Dust, debris, or motion blur trails. High contrast.',
        title: 'TITLE: Italic bold typography. Follows the diagonal tension of the subject.',
        subtitle: 'SUBTITLE: Small secondary text with sharp speed lines.',
        infoBlock: 'INFO: Aggressive sharp-edged banners. Metal or carbon fiber textures.',
        upperZone: 'UPPER: Event sponsor or league logo.',
        constraints: 'MOTION: Every element must contribute to the sense of speed and power.',
    },
};

/* ---------------- 7. CLASSIQUE / RETRO (7 Styles) ---------------- */

export const RETRO_BASE_ARCH: VisualArchitecture = {
    name: 'Retro General',
    rules: {
        subject: 'SUBJECT: Centered within a physical ornamental frame or "TV screen" border.',
        background: 'BACKGROUND: Aged paper, 80s synthwave grid, or grainy 90s film texture.',
        title: 'TITLE: Nostalgic typography (Serif for vintage, Chrome for 80s). Centered.',
        subtitle: 'SUBTITLE: Stamped badge or retro ribbon overlay.',
        infoBlock: 'INFO: Physical "ticket stub" style or typewriter font in a box at the bottom.',
        upperZone: 'UPPER: Vintage crest or "Original Quality" stamp.',
        constraints: 'NOSTALGIA: Use ink-bleed effects or chromatic aberration on edges.',
    },
};

export const RETRO_80S_ARCH: VisualArchitecture = {
    name: 'Rétro Années 80',
    rules: {
        subject: 'SUBJECT: Posed with stylized 80s props (Boombox, VHS). High saturation.',
        background: 'BACKGROUND: TRON-style purple grid. Glowing wireframe mountains. Tropical sunset.',
        title: 'TITLE: Chrome-textured 3D fonts with intense pink/blue neon glow.',
        subtitle: 'SUBTITLE: "Vaporwave" script font at the bottom edge.',
        infoBlock: 'INFO: Digital dot-matrix display style for event details.',
        upperZone: 'UPPER: Stylized palm tree or grid sun icon.',
        constraints: 'SYNTH: Intense neon colors. Chromatic aberration. Zero realistic textures.',
    },
};

/* ---------------- 8. NATURE (7 Styles) ---------------- */

export const NATURE_JUNGLE_ARCH: VisualArchitecture = {
    name: 'Tropical Jungle',
    rules: {
        subject: 'SUBJECT: Asymmetrical placement. Overlapping with large tropical leaves.',
        background: 'BACKGROUND: Dense jungle foliage. Deep greens and vibrant flower pops.',
        title: 'TITLE: Exotic serif typography. Integrated into the greenery.',
        subtitle: 'SUBTITLE: Nature-themed badge with gold accents.',
        infoBlock: 'INFO: Earthy tones. Wood-textured separators for date/time.',
        upperZone: 'UPPER: Small parrot silhouette at the top edge.',
        constraints: 'DEPTH: Heavy multi-layering of foreground and background leaves.',
    },
};

export const NATURE_BOHEME_ARCH: VisualArchitecture = {
    name: 'Bohème & Nature',
    rules: {
        subject: 'SUBJECT: Person in floral attire. Three-quarter view, gentle pose.',
        background: 'BACKGROUND: Soft sunset field with pampas grass and dried flowers. Warm golden hour.',
        title: 'TITLE: Elegant vintage serif. Soft warm colors (rust, beige).',
        subtitle: 'SUBTITLE: Handwritten cursive name. Centered.',
        infoBlock: 'INFO: Subtle botanical illustrations as separators.',
        upperZone: 'UPPER: Delicate sun or moon icon.',
        constraints: 'ORGANIC: Warm desaturated tones. Soft focus. Earthy vibe.',
    },
};

export const NATURE_BASE_ARCH: VisualArchitecture = {
    name: 'Nature General',
    rules: {
        subject: 'SUBJECT: Integrated into environment (layered with leaves or branches). Asymmetrical.',
        background: 'BACKGROUND: Lush greenery, botanical arrangements, or raw wood textures.',
        title: 'TITLE: Elegant organic font. Blended with atmospheric lighting.',
        subtitle: 'SUBTITLE: Small leaf-wrapped tagline or eco-friendly badge.',
        infoBlock: 'INFO: Discreet semi-transparent panels with subtle herbal patterns.',
        upperZone: 'UPPER: Eco logo or "Natural" seal.',
        constraints: 'BALANCE: Soft focus transitions. Composition should feel like a breathing forest.',
    },
};

/* ---------------- 9. IMPACT / CINEMA (8 Styles) ---------------- */

export const CINEMA_POSTER_ARCH: VisualArchitecture = {
    name: 'Poster Cinéma',
    rules: {
        subject: 'MAIN SUBJECT: Strictly centered. Height: 40-60% of the frame. Vertical alignment: Middle.',
        background: 'BACKGROUND: 100% coverage. Always behind the subject. Zero overlap on the subject.',
        title: 'MAIN TITLE: Located at the bottom. Centered horizontally. Width: 70-90% of the flyer.',
        subtitle: 'SUBTITLE: Positioned directly above the main title. Centered alignment. Smaller than main title.',
        infoBlock: 'INFO BLOCK: Lower bar divided into 3 zones. Left: DATE. Center: TIME. Right: LOCATION. Fixed positioning.',
        upperZone: 'UPPER ZONE: Top 5-10% area. Centered alignment. Purpose: "Presented by..." or Logo.',
        constraints: 'MARGINS: Identical external margins. Zero clipping. Strict boundary box for all elements.',
    },
};

export const CINEMA_DRAMATIC_ARCH: VisualArchitecture = {
    name: 'Affiche Dramatique',
    rules: {
        subject: 'SUBJECT: Full height portrait, looking away from camera. Emotional lighting.',
        background: 'BACKGROUND: Dark moody landscape or abstract emotional textures. High grain.',
        title: 'TITLE: Extremely spaced-out serif font (Wide kerning). Top 30% area.',
        subtitle: 'SUBTITLE: "A Film By..." style credit list.',
        infoBlock: 'INFO: Classic movie billing block at the very bottom (small condensed text).',
        upperZone: 'UPPER: Festival winner laurels icon.',
        constraints: 'DRAMA: Heavy shadows (Chiaroscuro). Film grain. Cinematic scale.',
    },
};

/* ---------------- 10. CRÉATIF / ÉDITORIAL (8 Styles) ---------------- */

export const EDITORIAL_MAGAZINE_ARCH: VisualArchitecture = {
    name: 'Style Magazine Editorial',
    rules: {
        subject: 'SUBJECT: Full height portrait. Head overlaps the masthead.',
        background: 'BACKGROUND: Solid studio color (Beige or Grey). High-end editorial lighting.',
        title: 'TITLE: Large magazine masthead (e.g., Vogue/GQ style). Occupies top edge.',
        subtitle: 'SUBTITLE: Left-aligned feature list (Article titles style).',
        infoBlock: 'INFO: Barcode and issue date at the bottom corner.',
        upperZone: 'UPPER: "Volume One" or seasonal tag.',
        constraints: 'FASHION: High-end production. Overlapping text layers.',
    },
};

export const EDITORIAL_BASE_ARCH: VisualArchitecture = {
    name: 'Editorial General',
    rules: {
        subject: 'SUBJECT: Full-height centered portrait. Subject overlaps the masthead (title).',
        background: 'BACKGROUND: Studio lighting with high-end editorial color grading.',
        title: 'TITLE: Giant masthead (Magazine style). Occupies top 30% of the frame.',
        subtitle: 'SUBTITLE: "Feature" text aligned to the left of the subject.',
        infoBlock: 'INFO: Columnar structure (2 or 3 columns) for event details on the side.',
        upperZone: 'UPPER: Issue date or "Exclusive" tag above the masthead.',
        constraints: 'OVERLAP: Create depth by layering text behind and in front of the subject.',
    },
};

export const MINIMAL_STUDIO_ARCH: VisualArchitecture = {
    name: 'Minimal Studio',
    rules: {
        subject: 'SUBJECT: Centered or Rule of Thirds. Large negative space around.',
        background: 'BACKGROUND: Solid neutral color or very soft texture. Minimalist.',
        title: 'TITLE: Clean sans-serif. Floating in negative space.',
        subtitle: 'SUBTITLE: Minimalist tagline near title.',
        infoBlock: 'INFO: Small structured text at the very bottom.',
        upperZone: 'UPPER: Empty for maximum breathing room.',
        constraints: 'WHITE SPACE: 50% of the frame must remain empty.',
    },
};

/* ---------------- FINAL REGISTRY (85 KEYS) ---------------- */

export const VISUAL_ARCHITECTURES: Record<string, VisualArchitecture> = {
    // 1. MODERNE
    'moderne': MODERN_DEFAULT_ARCH,
    'moderne flat design': MODERN_FLAT_ARCH,
    'moderne glassmorphism': MODERN_GLASS_ARCH,
    'moderne néon': MODERN_NEON_ARCH,
    'moderne géométrique': MODERN_GEOMETRIC_ARCH,
    'fond sombre': MODERN_DARK_ARCH,
    'dégradé': MODERN_GRADIENT_ARCH,
    'gradient': MODERN_GRADIENT_ARCH,
    'moderne modernormodsip': MODERN_DEFAULT_ARCH,

    // 2. FUN / COLORÉ
    'coloré vibrant': PLAYFUL_VIBRANT_ARCH,
    'pastel doux': PLAYFUL_PASTEL_ARCH,
    'cartoon': PLAYFUL_CARTOON_ARCH,
    'pop art': PLAYFUL_POP_ART_ARCH,
    'fun enfants': PLAYFUL_KIDS_ARCH,
    'confettis': PLAYFUL_CONFETTI_ARCH,
    'festival couleurs': PLAYFUL_VIBRANT_ARCH,
    'abstrait artistique': PLAYFUL_ABSTRACT_ARCH,

    // 3. LUXE
    'noir & or': LUXURY_NOIR_OR_ARCH,
    'blanc & or': LUXURY_WHITE_GOLD_ARCH,
    'élégant minimal': LUXURY_BASE_ARCH,
    'luxe premium': LUXURY_BASE_ARCH,
    'classique chic': LUXURY_BASE_ARCH,
    'royal': LUXURY_ROYAL_ARCH,
    'royal (violet/or)': LUXURY_ROYAL_ARCH,
    'doré brillant': LUXURY_GOLD_BRIGHT_ARCH,
    'soirée glamour': LUXURY_BASE_ARCH,
    'chic & glam': ANNIVERSARY_CHIC_ARCH,

    // 4. FESTIF
    'dj party': FESTIVE_DJ_ARCH,
    'clubbing': FESTIVE_BASE_ARCH,
    'neon night': FESTIVE_NEON_NIGHT_ARCH,
    'glow party': FESTIVE_GLOW_ARCH,
    'urban street': FESTIVE_URBAN_ARCH,
    'hip-hop': FESTIVE_BASE_ARCH,
    'afro vibe': FESTIVE_AFRO_VIBE_ARCH,
    'tropical party': FESTIVE_BASE_ARCH,
    'beach party': FESTIVE_BEACH_ARCH,
    'sunset vibe': FESTIVE_BASE_ARCH,
    'anniversaire rock & roll': ANNIVERSARY_ROCK_ARCH,
    'anniversaire tropical': ANNIVERSARY_TROPICAL_ARCH,
    'anniversaire classique': ANNIVERSARY_CLASSIQUE_ARCH,

    // 5. PRO / CORPORATE
    'corporate clean': CORPORATE_BASE_ARCH,
    'conférence pro': CORPORATE_BASE_ARCH,
    'business formel': CORPORATE_BASE_ARCH,
    'tech digital': CORPORATE_TECH_ARCH,
    'startup moderne': CORPORATE_STARTUP_ARCH,
    'minimal corporate': CORPORATE_BASE_ARCH,
    'linkedin style': CORPORATE_BASE_ARCH,
    'webinaire professionnel': CORPORATE_BASE_ARCH,

    // 6. SPORT
    'dynamique rouge/noir': SPORT_BASE_ARCH,
    'explosion énergie': SPORT_BASE_ARCH,
    'fitness impact': SPORT_FITNESS_ARCH,
    'sport compétition': SPORT_COMP_ARCH,
    'tournoi officiel': SPORT_BASE_ARCH,
    'street sport': SPORT_BASE_ARCH,
    'performance extrême': SPORT_BASE_ARCH,

    // 7. CLASSIQUE / RETRO
    'classique traditionnel': RETRO_BASE_ARCH,
    'vintage': RETRO_BASE_ARCH,
    'rétro années 80': RETRO_80S_ARCH,
    'rétro années 90': RETRO_BASE_ARCH,
    'old school': RETRO_BASE_ARCH,
    'papier texturé': RETRO_BASE_ARCH,
    'style affiche ancienne': RETRO_BASE_ARCH,

    // 8. NATURE
    'nature verte': NATURE_BASE_ARCH,
    'floral élégant': NATURE_BASE_ARCH,
    'tropical jungle': NATURE_JUNGLE_ARCH,
    'éco / bio': NATURE_BASE_ARCH,
    'bohème': NATURE_BOHEME_ARCH,
    'minimal naturel': NATURE_BASE_ARCH,
    'rustique bois': NATURE_BASE_ARCH,

    // 9. IMPACT / CINEMA
    'poster cinéma': CINEMA_POSTER_ARCH,
    'cinema poster': CINEMA_POSTER_ARCH,
    'photo centrale dominante': CINEMA_POSTER_ARCH,
    'image plein écran': CINEMA_POSTER_ARCH,
    'affiche dramatique': CINEMA_DRAMATIC_ARCH,
    'fond flou artistique': CINEMA_POSTER_ARCH,
    'double exposition': CINEMA_POSTER_ARCH,
    'collage moderne': CINEMA_POSTER_ARCH,

    // 10. CRÉATIF / ÉDITORIAL
    'asymétrique': EDITORIAL_BASE_ARCH,
    'layout split': EDITORIAL_BASE_ARCH,
    'typographie géante': EDITORIAL_BASE_ARCH,
    'encadré central': EDITORIAL_BASE_ARCH,
    'cercle dominant': EDITORIAL_BASE_ARCH,
    'diagonal dynamique': EDITORIAL_BASE_ARCH,
    'bloc moderne': EDITORIAL_BASE_ARCH,
    'style magazine': EDITORIAL_MAGAZINE_ARCH,

    // FALLBACK
    'minimal studio': MINIMAL_STUDIO_ARCH,
};
