export type DemoAttribute = "BATTERY_HOURS" | "ANC_LEVEL" | "BASS" | "COMFORT" | "MICROPHONE" | "WATER_RESISTANCE";

export type DemoProduct = {
  sku: string;
  name: string;
  brand: string;
  description: string;
  pricePaise: bigint;
  availableQty: number;
  attributes: Record<DemoAttribute, number>;
};

export const demoMerchant = { name: "SoundNest Electronics", slug: "soundnest-electronics" } as const;

export const demoCatalog: DemoProduct[] = [
  { sku: "SN-BUDS-LITE", name: "Buds Lite", brand: "SoundNest", description: "Lightweight daily earbuds with a clear mic.", pricePaise: 149900n, availableQty: 18, attributes: { BATTERY_HOURS: 65, ANC_LEVEL: 25, BASS: 60, COMFORT: 90, MICROPHONE: 72, WATER_RESISTANCE: 55 } },
  { sku: "SN-BUDS-BASS", name: "Buds Bass", brand: "SoundNest", description: "Punchy bass tuning for commuting and workouts.", pricePaise: 179900n, availableQty: 12, attributes: { BATTERY_HOURS: 74, ANC_LEVEL: 35, BASS: 94, COMFORT: 70, MICROPHONE: 68, WATER_RESISTANCE: 78 } },
  { sku: "SN-BUDS-CLEAR", name: "Buds Clear", brand: "SoundNest", description: "Call-first earbuds with focused microphone pickup.", pricePaise: 189900n, availableQty: 9, attributes: { BATTERY_HOURS: 70, ANC_LEVEL: 45, BASS: 58, COMFORT: 82, MICROPHONE: 95, WATER_RESISTANCE: 60 } },
  { sku: "SN-BUDS-QUIET", name: "Buds Quiet", brand: "SoundNest", description: "Active noise cancellation for busy journeys.", pricePaise: 199900n, availableQty: 16, attributes: { BATTERY_HOURS: 76, ANC_LEVEL: 92, BASS: 76, COMFORT: 76, MICROPHONE: 78, WATER_RESISTANCE: 65 } },
  { sku: "SN-BUDS-ENDURE", name: "Buds Endure", brand: "SoundNest", description: "Long battery life with water resistance.", pricePaise: 169900n, availableQty: 21, attributes: { BATTERY_HOURS: 96, ANC_LEVEL: 20, BASS: 68, COMFORT: 75, MICROPHONE: 66, WATER_RESISTANCE: 92 } },
  { sku: "SN-BUDS-COMFORT", name: "Buds Comfort", brand: "SoundNest", description: "Soft-fit earbuds designed for all-day listening.", pricePaise: 159900n, availableQty: 14, attributes: { BATTERY_HOURS: 62, ANC_LEVEL: 30, BASS: 64, COMFORT: 98, MICROPHONE: 74, WATER_RESISTANCE: 50 } },
  { sku: "SN-BUDS-PRO", name: "Buds Pro", brand: "SoundNest", description: "Balanced premium features within the demo range.", pricePaise: 199000n, availableQty: 11, attributes: { BATTERY_HOURS: 84, ANC_LEVEL: 80, BASS: 80, COMFORT: 84, MICROPHONE: 84, WATER_RESISTANCE: 75 } },
  { sku: "SN-BUDS-ACTIVE", name: "Buds Active", brand: "SoundNest", description: "Secure fit and splash protection for training.", pricePaise: 139900n, availableQty: 24, attributes: { BATTERY_HOURS: 68, ANC_LEVEL: 15, BASS: 82, COMFORT: 73, MICROPHONE: 62, WATER_RESISTANCE: 96 } },
];
