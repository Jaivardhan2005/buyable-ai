import { GoogleGenAI, Type } from "@google/genai";
import { PreferenceWeights, normalizeCategory } from "./ranking";
import { DemoAttribute } from "./demo-catalog";

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type ExtractedPreferences = {
  budgetPaise: bigint | null;
  category: string | null;
  weights: PreferenceWeights;
  useCases?: string[];
  requestedFeatures?: string[];
  pricePreference?: "budget" | "premium" | "value" | null;
};

export function extractPreferencesRuleBased(text: string): ExtractedPreferences {
  const lower = text.toLowerCase();

  // 1. Category extraction
  let category: string | null = null;
  if (
    lower.includes("speaker") ||
    lower.includes("speakers") ||
    lower.includes("soundbar") ||
    lower.includes("boombox")
  ) {
    category = "speakers";
  } else if (
    lower.includes("earbud") ||
    lower.includes("earbuds") ||
    lower.includes("tws") ||
    lower.includes("in-ear") ||
    lower.includes("airpod") ||
    lower.includes("earphone")
  ) {
    category = "earbuds";
  } else if (
    lower.includes("headphone") ||
    lower.includes("headphones") ||
    lower.includes("over-ear") ||
    lower.includes("headset") ||
    lower.includes("on-ear")
  ) {
    category = "headphones";
  }

  // 2. Budget extraction (e.g. "under ₹4,000", "under 4000", "under 5k", "below 18000")
  let budgetPaise: bigint | null = null;
  const budgetMatch =
    lower.match(/(?:under|below|budget|within|upto|up to|max|around)\s*(?:₹|rs\.?|inr)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(k|thousand)?/i) ||
    lower.match(/(?:₹|rs\.?|inr)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(k|thousand)?/i);

  if (budgetMatch) {
    const rawNumStr = budgetMatch[1].replace(/,/g, "");
    let amount = parseFloat(rawNumStr);
    if (budgetMatch[2]?.toLowerCase() === "k" || budgetMatch[2]?.toLowerCase() === "thousand") {
      amount *= 1000;
    }
    if (!isNaN(amount) && amount > 0) {
      budgetPaise = BigInt(Math.round(amount * 100));
    }
  }

  // 3. Attribute weights extraction
  const weights: PreferenceWeights = {};

  if (lower.includes("bass") || lower.includes("low end") || lower.includes("subwoofer") || lower.includes("party")) {
    weights.BASS = 95;
  }
  if (
    lower.includes("anc") ||
    lower.includes("noise cancel") ||
    lower.includes("quiet") ||
    lower.includes("flight") ||
    lower.includes("travel")
  ) {
    weights.ANC_LEVEL = 95;
  }
  if (
    lower.includes("battery") ||
    lower.includes("playtime") ||
    lower.includes("hours") ||
    lower.includes("long flight") ||
    lower.includes("camping")
  ) {
    weights.BATTERY_HOURS = 90;
  }
  if (
    lower.includes("mic") ||
    lower.includes("microphone") ||
    lower.includes("call") ||
    lower.includes("calling") ||
    lower.includes("meeting") ||
    lower.includes("zoom")
  ) {
    weights.MICROPHONE = 95;
  }
  if (
    lower.includes("comfort") ||
    lower.includes("comfortable") ||
    lower.includes("lightweight") ||
    lower.includes("all day") ||
    lower.includes("sleep") ||
    lower.includes("bedtime")
  ) {
    weights.COMFORT = 90;
  }
  if (
    lower.includes("water") ||
    lower.includes("waterproof") ||
    lower.includes("sweat") ||
    lower.includes("gym") ||
    lower.includes("workout") ||
    lower.includes("running") ||
    lower.includes("sports") ||
    lower.includes("rain") ||
    lower.includes("outdoor")
  ) {
    weights.WATER_RESISTANCE = 90;
  }

  // If no weights matched at all, provide a gentle default
  if (Object.keys(weights).length === 0) {
    if (lower.includes("cheap") || lower.includes("affordable") || lower.includes("budget")) {
      weights.BATTERY_HOURS = 60;
      weights.COMFORT = 60;
    }
  }

  // 4. Use cases
  const useCases: string[] = [];
  if (lower.includes("flight") || lower.includes("long flight")) useCases.push("long flights");
  if (lower.includes("travel")) useCases.push("travel");
  if (lower.includes("party") || lower.includes("parties")) useCases.push("parties");
  if (lower.includes("workout") || lower.includes("gym") || lower.includes("running")) useCases.push("workouts");
  if (lower.includes("call") || lower.includes("zoom") || lower.includes("meeting") || lower.includes("office")) useCases.push("calls");
  if (lower.includes("game") || lower.includes("gaming") || lower.includes("discord")) useCases.push("gaming");

  // 5. Requested features
  const requestedFeatures: string[] = [];
  if (lower.includes("anc") || lower.includes("noise cancel")) requestedFeatures.push("anc");
  if (lower.includes("waterproof") || lower.includes("water resistance") || lower.includes("ipx")) requestedFeatures.push("waterproof");
  if (lower.includes("long battery") || lower.includes("battery life")) requestedFeatures.push("long battery");
  if (lower.includes("good bass") || lower.includes("strong bass") || lower.includes("deep bass")) requestedFeatures.push("strong bass");
  if (lower.includes("good mic") || lower.includes("clear mic") || lower.includes("microphone")) requestedFeatures.push("mic");
  if (lower.includes("wireless") || lower.includes("bluetooth")) requestedFeatures.push("wireless");
  if (lower.includes("portable") || lower.includes("pocket")) requestedFeatures.push("portable");

  // 6. Price preference
  let pricePreference: "budget" | "premium" | "value" | null = null;
  if (lower.includes("cheap") || lower.includes("budget") || lower.includes("affordable")) {
    pricePreference = "budget";
  } else if (lower.includes("premium") || lower.includes("luxury") || lower.includes("high end") || lower.includes("flagship")) {
    pricePreference = "premium";
  }

  return {
    budgetPaise,
    category,
    weights,
    useCases: useCases.length > 0 ? useCases : undefined,
    requestedFeatures: requestedFeatures.length > 0 ? requestedFeatures : undefined,
    pricePreference,
  };
}

export function validateExtraction(text: string): ExtractedPreferences {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ExtractionError("LLM returned malformed JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ExtractionError("LLM output is not an object.");
  }
  if (!parsed.weights || typeof parsed.weights !== "object") {
    throw new ExtractionError("LLM output is missing the weights object.");
  }

  // Validate budget
  let budgetPaise: bigint | null = null;
  if (parsed.budgetPaise !== undefined && parsed.budgetPaise !== null) {
    if (typeof parsed.budgetPaise !== "number" || parsed.budgetPaise <= 0 || !Number.isInteger(parsed.budgetPaise)) {
      throw new ExtractionError("Invalid budgetPaise: must be a positive integer.");
    }
    budgetPaise = BigInt(parsed.budgetPaise);
  }

  // Validate and clamp weights
  const rawWeights = parsed.weights as Record<string, unknown>;
  const weights: PreferenceWeights = {};
  const validKeys: DemoAttribute[] = ["ANC_LEVEL", "BASS", "BATTERY_HOURS", "COMFORT", "MICROPHONE", "WATER_RESISTANCE"];

  for (const key of validKeys) {
    if (key in rawWeights) {
      const val = rawWeights[key];
      if (typeof val !== "number") {
        throw new ExtractionError(`Invalid weight for ${key}: must be a number.`);
      }
      weights[key] = Math.max(0, Math.min(100, Math.round(val)));
    }
  }

  // Validate category
  let category: string | null = null;
  if (parsed.category !== undefined && parsed.category !== null) {
    if (typeof parsed.category !== "string") {
      throw new ExtractionError("Invalid category: must be a string.");
    }
    category = normalizeCategory(parsed.category.trim()) || null;
  }

  // Validate useCases
  let useCases: string[] | undefined;
  if (Array.isArray(parsed.useCases)) {
    useCases = parsed.useCases.filter((u: unknown): u is string => typeof u === "string");
  }

  // Validate requestedFeatures
  let requestedFeatures: string[] | undefined;
  if (Array.isArray(parsed.requestedFeatures)) {
    requestedFeatures = parsed.requestedFeatures.filter((f: unknown): f is string => typeof f === "string");
  }

  // Validate pricePreference
  let pricePreference: "budget" | "premium" | "value" | null = null;
  if (parsed.pricePreference === "budget" || parsed.pricePreference === "premium" || parsed.pricePreference === "value") {
    pricePreference = parsed.pricePreference;
  }

  return {
    budgetPaise,
    category,
    weights,
    useCases,
    requestedFeatures,
    pricePreference,
  };
}

export async function extractPreferences(requestText: string): Promise<ExtractedPreferences> {
  const ruleExtraction = extractPreferencesRuleBased(requestText);

  if (!ai) {
    return ruleExtraction;
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      budgetPaise: {
        type: Type.INTEGER,
        description: "The buyer's budget in Indian paise (e.g., ₹4,000 becomes 400000, ₹18,000 becomes 1800000). Return null if no numeric budget is stated.",
        nullable: true,
      },
      category: {
        type: Type.STRING,
        description: "The core product category requested: 'earbuds', 'headphones', or 'speakers'. Return null if none is specified.",
        nullable: true,
      },
      weights: {
        type: Type.OBJECT,
        description: "The buyer's preference priorities, weighted 0 to 100.",
        properties: {
          ANC_LEVEL: { type: Type.INTEGER, description: "Active Noise Cancellation priority (0-100)" },
          BASS: { type: Type.INTEGER, description: "Bass and low-end priority (0-100)" },
          BATTERY_HOURS: { type: Type.INTEGER, description: "Battery life / playtime priority (0-100)" },
          COMFORT: { type: Type.INTEGER, description: "Comfort, fit and lightweight priority (0-100)" },
          MICROPHONE: { type: Type.INTEGER, description: "Microphone and calling priority (0-100)" },
          WATER_RESISTANCE: { type: Type.INTEGER, description: "Water/sweat resistance priority (0-100)" },
        },
      },
      useCases: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Target use cases extracted from query, e.g., 'travel', 'long flights', 'workouts', 'parties', 'calls', 'gaming'.",
      },
      requestedFeatures: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Specific features or qualities requested, e.g., 'anc', 'waterproof', 'strong bass', 'long battery', 'mic'.",
      },
      pricePreference: {
        type: Type.STRING,
        description: "Price sensitivity: 'budget', 'premium', 'value', or null.",
        nullable: true,
      },
    },
    required: ["weights"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `You are an expert shopping preference extractor for an audio electronics store. Extract precise structured preferences from the user's shopping request.\n\nUser request: "${requestText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (text) {
      const validated = validateExtraction(text);

      // Post-process with rule-based extraction to ensure keywords & categories are never dropped
      const finalCategory = validated.category || ruleExtraction.category;
      const finalBudget = validated.budgetPaise || ruleExtraction.budgetPaise;
      const mergedWeights = { ...ruleExtraction.weights, ...validated.weights };

      // Ensure at least one positive weight if rule had one
      for (const [k, v] of Object.entries(ruleExtraction.weights)) {
        if ((v ?? 0) > (mergedWeights[k as DemoAttribute] ?? 0)) {
          mergedWeights[k as DemoAttribute] = v;
        }
      }

      return {
        budgetPaise: finalBudget,
        category: finalCategory,
        weights: mergedWeights,
        useCases: validated.useCases?.length ? validated.useCases : ruleExtraction.useCases,
        requestedFeatures: validated.requestedFeatures?.length ? validated.requestedFeatures : ruleExtraction.requestedFeatures,
        pricePreference: validated.pricePreference || ruleExtraction.pricePreference,
      };
    }
  } catch (err) {
    console.warn("LLM preference extraction encountered an error, using rule-based extraction fallback:", err);
  }

  return ruleExtraction;
}
