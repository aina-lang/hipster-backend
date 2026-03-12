/**
 * 🎨 PROFESSION CONTEXT PROMPTS
 * 
 * Deuxième couche du système de génération d'images (Couche 2/3):
 * 1. Base DA (Direction Artistique) → Style visuel
 * 2. Contexte Métier → Univers profession (CE FICHIER)
 * 3. Demande Utilisateur → Ce qu'ils veulent montrer
 * 
 * Ces prompts verrouillent le champ lexical et l'univers visuel
 * pour chaque profession, même si l'utilisateur essaie de sortir du cadre.
 */

export const PROFESSION_CONTEXT_PROMPTS: Record<string, string> = {
  // Coiffure & Esthétique
  "Coiffure & Esthétique": `The visual must stay exclusively in the professional world of hairdressing, beauty salons, hair care, styling, beauty treatments, and cosmetic products. Include elements like: salon chairs, mirrors, hair styling tools, beauty products, hair textures, professional cuts, colors, and beauty services. The aesthetic should radiate professionalism, luxury, and beauty expertise.`,
  
  // Restaurant / Bar
  "Restaurant / Bar": `The visual must stay exclusively in the hospitality and food service world. Include elements like: cuisine, beverages, plated dishes, restaurant ambiance, bar settings, professional kitchen tools, dining experiences, and culinary excellence. The aesthetic should evoke appetite, sophistication, conviviality, and gastronomic expertise.`,
  
  // Commerce / Boutique
  "Commerce / Boutique": `The visual must stay exclusively in the retail and commercial business world. Include elements like: product displays, store ambiance, customer experience, shopping environments, modern retail spaces, product lines, and commercial appeal. The aesthetic should communicate trust, accessibility, quality, and commercial professionalism.`,
  
  // Artisans du bâtiment
  "Artisans du bâtiment": `The visual must stay exclusively in the construction and skilled trades world. Include elements like: building materials, construction tools, work sites, professional craftsmanship, architectural details, renovation work, and structural elements. The aesthetic should convey expertise, durability, precision, and professional mastery of the craft.`,
  
  // Service local
  "Service local": `The visual must stay exclusively in the local service and community business world. Include elements like: neighborhood environments, customer interactions, service delivery, local expertise, community presence, and accessible professionalism. The aesthetic should communicate reliability, local knowledge, and personalized service excellence.`,
  
  // Profession libérale
  "Profession libérale": `The visual must stay exclusively in the professional services and liberal professions world. Include elements like: office environments, professional tools, expertise symbols, business sophistication, and professional credentials. The aesthetic should convey competence, trustworthiness, expertise, and professional excellence.`,
  
  // Bien-être / Santé alternative
  "Bien-être / Santé alternative": `The visual must stay exclusively in the wellness, health, and alternative medicine world. Include elements like: wellness practices, natural products, healing environments, relaxation, holistic care, and wellness tools. The aesthetic should communicate serenity, natural harmony, healing power, and wellness expertise.`,
  
  // Métiers génériques (fallback)
  "Autre": `The visual must stay grounded in the professional world and business context of the selected trade or profession. Maintain professional authenticity and industry-specific aesthetic consistency.`,
};

/**
 * Récupère le contexte profession pour un métier donné
 * @param profession - Le nom du métier/profession
 * @returns Le texte de contexte profession ou un texte par défaut
 */
export function getProfessionContext(profession: string): string {
  if (!profession) return PROFESSION_CONTEXT_PROMPTS["Autre"];
  
  // Recherche exacte d'abord
  if (PROFESSION_CONTEXT_PROMPTS[profession]) {
    return PROFESSION_CONTEXT_PROMPTS[profession];
  }
  
  // Recherche partiellement intelligente (cas où l'user a écrit une variation)
  const profLower = profession.toLowerCase();
  const matchedKey = Object.keys(PROFESSION_CONTEXT_PROMPTS).find(
    key => key.toLowerCase().includes(profLower) || profLower.includes(key.toLowerCase())
  );
  
  return matchedKey 
    ? PROFESSION_CONTEXT_PROMPTS[matchedKey]
    : PROFESSION_CONTEXT_PROMPTS["Autre"];
}
