
import { GoogleGenAI, Type } from "@google/genai";
import { PreferenceWeights } from "./ranking";
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
};

export function validateExtraction(text: string): ExtractedPreferences {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
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
  const weights: PreferenceWeights = {};
  const validKeys: DemoAttribute[] = ["ANC_LEVEL", "BASS", "BATTERY_HOURS", "COMFORT", "MICROPHONE", "WATER_RESISTANCE"];
  
  for (const key of validKeys) {
    if (key in parsed.weights) {
      const val = parsed.weights[key];
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
    category = parsed.category.trim() || null;
  }

  return {
    budgetPaise,
    category,
    weights,
  };
}

export async function extractPreferences(requestText: string): Promise<ExtractedPreferences> {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      budgetPaise: {
        type: Type.INTEGER,
        description: "The buyer's budget in Indian paise (e.g., ₹18,000 becomes 1800000). Return null if the buyer does not specify any budget constraint.",
        nullable: true,
      },
      category: {
        type: Type.STRING,
        description: "The core product category requested (e.g., 'earbuds', 'headphones', 'speakers'). Return null if none is specified.",
        nullable: true,
      },
      weights: {
        type: Type.OBJECT,
        description: "The buyer's preference priorities, weighted 0 to 100. Extract from natural language context.",
        properties: {
          ANC_LEVEL: { type: Type.INTEGER, description: "Active Noise Cancellation priority (0-100)" },
          BASS: { type: Type.INTEGER, description: "Bass priority (0-100)" },
          BATTERY_HOURS: { type: Type.INTEGER, description: "Battery life priority (0-100)" },
          COMFORT: { type: Type.INTEGER, description: "Comfort/fit priority (0-100)" },
          MICROPHONE: { type: Type.INTEGER, description: "Microphone/calls priority (0-100)" },
          WATER_RESISTANCE: { type: Type.INTEGER, description: "Water/sweat resistance priority (0-100)" },
        },
      },
    },
    required: ["weights"],
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Extract the shopping preferences from the following request:\n"${requestText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1,
      },
    });
  } catch (err) {
    throw new ExtractionError("Failed to communicate with LLM provider.");
  }

  const text = response.text;
  if (!text) {
    throw new ExtractionError("LLM returned empty response.");
  }

  return validateExtraction(text);
}
