/**
 * FASHION_VERTICAL CONFIGURATION
 * 
 * Complete frontend interface for Fashion Vertical Premium posters
 * Generates exact API payload from user inputs
 * 
 * Architecture: TYPE_FASHION_VERTICAL
 * Style: Premium (Vogue/Numéro Editorial Quality)
 */

/**
 * Job/Category options for Fashion Vertical posters
 */
export enum FashionVerticalJobType {
  FASHION = 'fashion',
  MODE = 'mode',
  EVENT = 'event',
  EVENEMENT = 'événement',
  SHOW = 'show',
  PRESENTATION = 'présentation',
  LAUNCH = 'launch',
  LANCEMENT = 'lancement',
  COLLECTION = 'collection',
  EDITORIAL = 'éditoriel',
}

/**
 * Accent color presets matching design system
 */
export enum AccentColorPreset {
  TEAL = '#17A2B8',        // Default - Fashion/Modern
  CYAN = '#00B8D4',        // Event/Happy
  ORANGE = '#FF6B35',      // Energy/Luxury
  RED = '#E74C3C',         // Bold/Premium
  WHITE = '#FFFFFF',       // Clean/Minimal
  GOLD = '#FFD60A',        // Luxury/Premium
  NAVY = '#003D5B',        // Corporate/Elegant
  PURPLE = '#7B2CBF',      // Creative/Premium
}

/**
 * Main word suggestions (vertical title)
 */
export const MAIN_WORD_SUGGESTIONS = [
  'FASHION',
  'MODE',
  'ZINFO',
  'GARAGE',
  'PIZZA',
  'BEAUTÉ',
  'EVENT',
  'SHOW',
  'COLLECTION',
  'NEW',
  'SALE',
  'PROMO',
  'VOGUE',
  'NUMERO',
];

/**
 * Script phrase suggestions (signature text center-bottom)
 */
export const SCRIPT_PHRASE_SUGGESTIONS = [
  'Save the Date',
  'Offre du Week-end',
  'Limited Edition',
  'Grand Ouverture',
  'À Découvrir',
  'New Collection',
  'Exclusif',
  'Premium',
  'Édition Spéciale',
  'Réservé',
  'Coming Soon',
  'Now Available',
];

/**
 * Info line suggestions (baseline text bottom-center)
 */
export const INFO_LINE_SUGGESTIONS = [
  'RDV • Adresse • Téléphone',
  'Contact • Email • Web',
  'Date • Lieu • Horaires',
  'Réservation Requise',
  'Sur Invitation Seulement',
  'Places Limitées',
  'Inscrivez-vous Maintenant',
  'Détails en Ligne',
  'Billets Disponibles',
];

/**
 * Frontend Input Form Model
 * This is what the user fills in the UI
 */
export interface FashionVerticalFormInput {
  // Required fields
  mainWord: string;              // "FASHION", "ZINFO", etc. (vertical title)
  scriptPhrase: string;          // "Save the Date", "Offre du Week-end"
  infoLine: string;              // "RDV • Adresse • Téléphone"
  
  // Optional fields
  accentColor?: AccentColorPreset | string;  // Hex color or preset enum
  jobType?: FashionVerticalJobType | string; // 'fashion', 'event', etc.
  
  // Context
  userDescription?: string;      // "femme élégante avec lunettes..." (optional context)
}

/**
 * Backend API Payload
 * Generated from form input
 */
export interface FashionVerticalAPIPayload {
  params: {
    // Model identifier
    model: 'Fashion Vertical – Magazine';
    
    // Job/category
    job: string; // e.g., 'fashion', 'event'
    
    // Style (always Premium for this architecture)
    style: 'Premium';
    
    // User-provided text parameters
    mainWord: string;              // Vertical title
    scriptPhrase: string;          // Script signature
    infoLine: string;              // Baseline info
    
    // Visual parameters
    accentColor?: string;          // Hex color code
    
    // Context
    userQuery?: string;            // Optional user description for DALL-E
    
    // Language
    language: 'fr' | 'en';
  };
}

/**
 * Transform user form input → API payload
 */
export function transformFormToAPIPayload(
  input: FashionVerticalFormInput,
): FashionVerticalAPIPayload {
  return {
    params: {
      model: 'Fashion Vertical – Magazine',
      job: input.jobType || 'fashion',
      style: 'Premium',
      mainWord: input.mainWord.toUpperCase().trim(),
      scriptPhrase: input.scriptPhrase.trim(),
      infoLine: input.infoLine.toUpperCase().trim(),
      accentColor: input.accentColor || AccentColorPreset.TEAL,
      userQuery: input.userDescription || '',
      language: 'fr',
    },
  };
}

/**
 * Frontend component props
 */
export interface FashionVerticalEditorProps {
  onGenerate: (payload: FashionVerticalAPIPayload) => Promise<void>;
  isLoading?: boolean;
  defaultPreset?: 'fashion' | 'event' | 'luxury';
}

/**
 * Export complete DALL-E prompt rules for backend
 */
export const FASHION_VERTICAL_DALLE_RULES = {
  architecture: 'TYPE_FASHION_VERTICAL',
  objective: 'Premium poster, mode/event, highly graphic',
  
  background: {
    description: 'Full-frame photo, portrait, tight crop, cinematic depth of field',
    overlay: 'Dark gradient (black → transparent) positioned top-right',
  },
  
  title: {
    text: 'Vertical on left side',
    font: 'Ultra Bold (Montserrat ExtraBold / Anton / Bebas Negro)',
    rotation: '90 degrees',
    size: 'Very large (occupies 80–90% of height)',
    color: 'accentColor (default teal)',
    effects: 'Light outline or soft drop-shadow',
  },
  
  script: {
    text: 'Signature text center-bottom',
    font: 'Fine script (Allura / Great Vibes / SignPainter-like)',
    color: 'White',
    opacity: '85–95%',
  },
  
  baseline: {
    text: 'Bottom-centered',
    styling: 'Small-caps / wide letter-spacing',
    color: 'White',
    size: 'Small',
  },
  
  constraints: {
    maxAccentColors: 1,
    maxTextBlocks: 3,
    prohibited: ['icons', 'stickers', 'multi-colors', 'decorative elements', 'AI artifacts'],
    quality: '8K photorealistic',
    references: ['Vogue', 'Numéro', "Harper's Bazaar", 'Elle'],
  },
};

/**
 * User-filled parameters documentation
 */
export const FASHION_VERTICAL_USER_INPUTS = {
  mainWord: {
    label: 'Mot Principal',
    placeholder: 'ex: FASHION, GARAGE, PIZZA, BEAUTÉ',
    description: 'Texte vertical ultra-bold sur la gauche',
    examples: MAIN_WORD_SUGGESTIONS,
  },
  scriptPhrase: {
    label: 'Phrase Signature',
    placeholder: 'ex: Save the Date, Offre du Week-end',
    description: 'Texte script au centre-bas (signature)',
    examples: SCRIPT_PHRASE_SUGGESTIONS,
  },
  infoLine: {
    label: 'Infos Pratiques',
    placeholder: 'ex: RDV • Adresse • Téléphone',
    description: 'Texte baseline en bas (contact/infos)',
    examples: INFO_LINE_SUGGESTIONS,
  },
  accentColor: {
    label: 'Couleur Accent',
    placeholder: 'Sélectionnez ou personnalisez',
    description: 'Couleur pour titre vertical et accents',
    presets: AccentColorPreset,
    default: AccentColorPreset.TEAL,
  },
};
