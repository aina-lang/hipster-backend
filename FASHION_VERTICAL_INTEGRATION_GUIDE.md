# FASHION VERTICAL - API DOCUMENTATION & FRONTEND INTEGRATION

## 📋 Architecture Overview

**Type**: `TYPE_FASHION_VERTICAL`  
**Style**: `Premium` (Vogue/Numéro Editorial Quality)  
**Purpose**: Premium fashion/event posters with vertical typography composition

---

## 🎨 User Parameters (What the Frontend Collects)

The user fills 4 parameters:

| Parameter | Type | Required | Example | Description |
|-----------|------|----------|---------|-------------|
| **mainWord** | string | ✅ YES | "FASHION" | Ultra-bold vertical text on left (80-90% height) |
| **scriptPhrase** | string | ✅ YES | "Save the Date" | Elegant script signature at center-bottom |
| **infoLine** | string | ✅ YES | "RDV • Adresse • Tél" | Small-caps baseline info bottom-center |
| **accentColor** | hex color | ❌ OPTIONAL | "#00B8D4" | Accent color for title + glow (default: teal) |

---

## 🚀 API ENDPOINT

### POST `/ai/flyer`

Generate a Fashion Vertical poster.

#### Request Headers
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

#### Request Body (COMPLETE EXAMPLE)

```json
{
  "params": {
    "model": "Fashion Vertical – Magazine",
    "job": "fashion",
    "style": "Premium",
    "mainWord": "FASHION",
    "scriptPhrase": "Save the Date",
    "infoLine": "MEN AND WOMEN ARE INVITED IN COMPETITION SHOW",
    "accentColor": "#00B8D4",
    "userQuery": "femme élégante avec lunettes teintées teal, portrait studio cinematique",
    "language": "fr"
  }
}
```

#### Response
```json
{
  "id": 12345,
  "generationId": 12345,
  "url": "https://hipster-api.fr/uploads/ai-generations/flyer_final_12345_1708964523.jpg",
  "isAsync": false,
  "status": "COMPLETED",
  "prompt": "..."
}
```

---

## 💻 FRONTEND INTEGRATION EXAMPLES

### TypeScript/React Example

```typescript
import {
  FashionVerticalFormInput,
  transformFormToAPIPayload,
  AccentColorPreset,
  MAIN_WORD_SUGGESTIONS,
  SCRIPT_PHRASE_SUGGESTIONS,
  INFO_LINE_SUGGESTIONS,
} from '@/config/fashion-vertical.config';

// User form data
const formInput: FashionVerticalFormInput = {
  mainWord: 'FASHION',
  scriptPhrase: 'Save the Date',
  infoLine: 'Men and Women Are Invited',
  accentColor: AccentColorPreset.TEAL, // or "#00B8D4"
  jobType: 'fashion',
  userDescription: 'femme élégante avec lunettes teintées',
};

// Transform to API payload
const apiPayload = transformFormToAPIPayload(formInput);

// Call API
const response = await fetch('https://api.hipster-api.fr/ai/flyer', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(apiPayload),
});

const result = await response.json();
console.log('Generated poster:', result.url);
```

### Form Component (React)

```tsx
import React, { useState } from 'react';
import {
  FashionVerticalFormInput,
  transformFormToAPIPayload,
  AccentColorPreset,
  MAIN_WORD_SUGGESTIONS,
  SCRIPT_PHRASE_SUGGESTIONS,
} from '@/config/fashion-vertical.config';

export function FashionVerticalEditor() {
  const [form, setForm] = useState<FashionVerticalFormInput>({
    mainWord: '',
    scriptPhrase: '',
    infoLine: '',
    accentColor: AccentColorPreset.TEAL,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const payload = transformFormToAPIPayload(form);
      const response = await fetch('/ai/flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setResult(data.url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fashion-vertical-editor">
      <h2>Fashion Vertical Poster</h2>
      
      {/* Main Word Input */}
      <div>
        <label>Mot Principal *</label>
        <input
          type="text"
          placeholder="ex: FASHION, ZINFO..."
          value={form.mainWord}
          onChange={(e) => setForm({ ...form, mainWord: e.target.value })}
          maxLength={30}
        />
        <datalist>
          {MAIN_WORD_SUGGESTIONS.map((word) => (
            <option key={word} value={word} />
          ))}
        </datalist>
      </div>

      {/* Script Phrase Input */}
      <div>
        <label>Phrase Signature *</label>
        <input
          type="text"
          placeholder="ex: Save the Date..."
          value={form.scriptPhrase}
          onChange={(e) => setForm({ ...form, scriptPhrase: e.target.value })}
          maxLength={50}
        />
        <datalist>
          {SCRIPT_PHRASE_SUGGESTIONS.map((phrase) => (
            <option key={phrase} value={phrase} />
          ))}
        </datalist>
      </div>

      {/* Info Line Input */}
      <div>
        <label>Infos Pratiques *</label>
        <input
          type="text"
          placeholder="ex: RDV • Adresse • Tél..."
          value={form.infoLine}
          onChange={(e) => setForm({ ...form, infoLine: e.target.value })}
          maxLength={80}
        />
      </div>

      {/* Accent Color Picker */}
      <div>
        <label>Couleur Accent</label>
        <select
          value={form.accentColor}
          onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
        >
          <option value={AccentColorPreset.TEAL}>Teal (Default)</option>
          <option value={AccentColorPreset.CYAN}>Cyan</option>
          <option value={AccentColorPreset.ORANGE}>Orange</option>
          <option value={AccentColorPreset.RED}>Red</option>
          <option value={AccentColorPreset.GOLD}>Gold</option>
        </select>
        <input
          type="color"
          value={form.accentColor}
          onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
        />
      </div>

      {/* Generate Button */}
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Génération en cours...' : 'Générer le Poster'}
      </button>

      {/* Result */}
      {result && (
        <div>
          <h3>Résultat:</h3>
          <img src={result} alt="Generated poster" style={{ maxWidth: '100%' }} />
          <a href={result} download>Télécharger</a>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 Backend Rules (Locked)

These rules are **FIXED** and never change:

### Layout Rules
- ✅ Portrait orientation (1024 x 1536)
- ✅ Full-frame photo with tight crop
- ✅ Cinematic depth of field (f/1.8)
- ✅ Dark gradient overlay (top-right)

### Typography Rules
- ✅ **Title**: Ultra-bold vertical (80-90% height), rotation 90°, left side
- ✅ **Script**: Fine script font, center-bottom, white 85-95% opacity
- ✅ **Baseline**: Small-caps, bottom-center, white, wide letter-spacing

### Constraints
- ✅ Max 1 accent color (user's accentColor)
- ✅ Max 3 text blocks (title, script, baseline)
- ✅ NO icons, NO stickers, NO multi-colors
- ✅ 8K photorealistic quality
- ✅ Vogue/Numéro/Harper's Bazaar editorial reference

---

## 📐 Curl Example

```bash
curl -X POST https://api.hipster-api.fr/ai/flyer \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "model": "Fashion Vertical – Magazine",
      "job": "fashion",
      "style": "Premium",
      "mainWord": "FASHION",
      "scriptPhrase": "Save the Date",
      "infoLine": "MEN AND WOMEN ARE INVITED",
      "accentColor": "#00B8D4",
      "userQuery": "femme élégante portrait",
      "language": "fr"
    }
  }'
```

---

## ✅ Validation Rules

Frontend should validate:

```typescript
function validateFashionVerticalInput(form: FashionVerticalFormInput): string[] {
  const errors: string[] = [];

  if (!form.mainWord || form.mainWord.trim().length === 0) {
    errors.push('Mot principal requis');
  } else if (form.mainWord.length > 30) {
    errors.push('Mot principal max 30 caractères');
  }

  if (!form.scriptPhrase || form.scriptPhrase.trim().length === 0) {
    errors.push('Phrase signature requise');
  } else if (form.scriptPhrase.length > 50) {
    errors.push('Phrase signature max 50 caractères');
  }

  if (!form.infoLine || form.infoLine.trim().length === 0) {
    errors.push('Infos pratiques requises');
  } else if (form.infoLine.length > 80) {
    errors.push('Infos pratiques max 80 caractères');
  }

  // Validate accent color hex format
  if (form.accentColor && !/#[0-9A-Fa-f]{6}/.test(form.accentColor)) {
    errors.push('Format de couleur invalide (#RRGGBB)');
  }

  return errors;
}
```

---

## 🌍 Supported Languages

- `fr` - French (default)
- `en` - English

Change via `language` parameter in `params`.

---

## 📦 Job/Category Types

```typescript
enum FashionVerticalJobType {
  FASHION = 'fashion',
  MODE = 'mode',
  EVENT = 'event',
  PRESENTATION = 'présentation',
  COLLECTION = 'collection',
  EDITORIAL = 'éditoriel',
}
```

---

## 🎨 Color Presets

| Preset | Hex | Use Case |
|--------|-----|----------|
| **TEAL** | `#17A2B8` | Fashion, Modern (default) |
| **CYAN** | `#00B8D4` | Event, Happy, Tech |
| **ORANGE** | `#FF6B35` | Energy, Luxury, Warm |
| **RED** | `#E74C3C` | Bold, Premium, Attention |
| **GOLD** | `#FFD60A` | Luxury, Premium, Elegant |
| **NAVY** | `#003D5B` | Corporate, Elegant, Formal |
| **PURPLE** | `#7B2CBF` | Creative, Premium, Tech |
| **WHITE** | `#FFFFFF` | Clean, Minimal, Contrast |

---

## 🔄 Response Time

- **First generation**: 8-12 seconds (DALL-E + SVG rendering)
- **Async flag**: `isAsync: true` if generation in progress
- **Status polling**: Check `status` field

---

## 💡 Best Practices

1. **Validate input** before sending to API
2. **Use suggestions** for better UX
3. **Limit character count** as shown in validation
4. **Show loading state** while generating
5. **Handle async responses** with polling or webhooks
6. **Cache color presets** for faster UI rendering

---

##❓ FAQ

**Q: Can I use different fonts?**  
A: No, fonts are locked in the architecture (Montserrat, Allura). Only size/color/opacity can change per user input.

**Q: Can I add more accent colors?**  
A: No, max 1 accent color enforced by constraints.

**Q: Can I customize the background?**  
A: No, background generation is controlled by `userQuery` + DALL-E prompt only.

**Q: What if generation fails?**  
A: Return `status: 'ERROR'` with message. User can retry or adjust parameters.

---

## 📞 Support

For issues or questions, contact: support@hipster-api.fr
