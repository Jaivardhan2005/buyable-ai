"use client";

import { useState, useEffect } from "react";

type ScoreBreakdown = {
  attributeScore: number;
  useCaseScore: number;
  featureScore: number;
  qualityScore: number;
  finalScore: number;
};

type RecommendationResult = {
  sku: string;
  name: string;
  brand: string;
  category?: string;
  subcategory?: string;
  description: string;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  pricePaise: string | number;
  rating?: number;
  reviewCount?: number;
  specs?: {
    batteryHours?: number;
    weightGrams?: number;
    waterRating?: string;
    bluetoothVersion?: string;
    driverSizeMm?: number;
    ancType?: string;
  };
  features?: string[];
  attributes: Record<string, number>;
  explanation: string;
  strengths?: string[];
  tradeoffs?: string[];
};

type InterpretedPrefs = {
  budgetPaise: string | number | null;
  category: string | null;
  weights: Record<string, number>;
  useCases?: string[];
  requestedFeatures?: string[];
  pricePreference?: string | null;
};

type RecommendationData = {
  recommendationId: string;
  interpreted: InterpretedPrefs;
  results: RecommendationResult[];
};

const SUGGESTED_QUERIES = [
  { label: "🔊 Speakers under ₹4,000 with good bass", query: "speakers under ₹4,000 with good bass" },
  { label: "🎧 Earbuds with ANC under ₹5,000", query: "earbuds with ANC under ₹5,000" },
  { label: "✈️ Headphones for travel", query: "headphones for travel" },
  { label: "🔋 Wireless speaker with long battery life", query: "wireless speaker with long battery life" },
  { label: "🎙️ Earbuds with good microphone", query: "earbuds with good microphone" },
  { label: "🏷️ Cheap headphones", query: "cheap headphones" },
];

export default function ShopClient({
  initialHasSession,
  merchantId,
}: {
  initialHasSession: boolean;
  merchantId: string;
}) {
  const [hasSession, setHasSession] = useState(initialHasSession);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<RecommendationData | null>(null);

  useEffect(() => {
    if (!hasSession && merchantId) {
      fetch("/api/buyer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId }),
      })
        .then((res) => {
          if (res.ok) setHasSession(true);
          else console.error("Session creation failed", res.status);
        })
        .catch(console.error);
    }
  }, [hasSession, merchantId]);

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch("/api/buyer/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText: searchQuery }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Something went wrong.");
      }

      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleChipClick = (q: string) => {
    setQuery(q);
    executeSearch(q);
  };

  const formatInr = (paise: string | number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(paise) / 100);

  const getRankBadge = (idx: number) => {
    if (idx === 0) {
      return {
        label: "#1 Top Pick",
        classes: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      };
    }
    if (idx === 1) {
      return {
        label: "#2 Great Alternative",
        classes: "bg-blue-500/20 text-blue-300 border-blue-500/40",
      };
    }
    return {
      label: "#3 Best Value",
      classes: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    };
  };

  return (
    <div className="space-y-12">
      {/* Input Section */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 shadow-xl backdrop-blur">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="shop-query" className="text-sm font-semibold text-slate-200">
            What are you looking for?
          </label>
          <div className="flex gap-4 flex-col sm:flex-row">
            <input
              id="shop-query"
              type="text"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all text-base"
              placeholder="e.g., speakers under ₹4,000 with good bass, earbuds with ANC, or headphones for travel"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
            <button
              id="search-btn"
              type="submit"
              disabled={loading || !query.trim() || !hasSession}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3.5 font-semibold text-white transition-all hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-purple-900/20 active:scale-[0.98]"
            >
              {loading ? "Searching..." : "Recommend"}
            </button>
          </div>
          {!hasSession && <p className="text-xs text-slate-500">Initializing session...</p>}

          {/* Quick suggestions */}
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2.5">
              Quick Suggestions
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((item) => (
                <button
                  key={item.query}
                  type="button"
                  onClick={() => handleChipClick(item.query)}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:border-purple-500 hover:bg-purple-950/40 hover:text-purple-200 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200 animate-in fade-in slide-in-from-top-2">
          <p className="font-semibold text-red-400">Could not process request</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* Results Section */}
      {data && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Interpreted Preferences */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Interpreted Shopping Preferences
              </h2>
              <span className="text-xs text-slate-400">Deterministic Evaluation</span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {data.interpreted.category !== null && (
                <li className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-300 capitalize flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  Category: <strong className="text-white font-semibold">{data.interpreted.category}</strong>
                </li>
              )}
              {data.interpreted.budgetPaise !== null && (
                <li className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Budget: <strong className="text-white font-semibold">up to {formatInr(data.interpreted.budgetPaise)}</strong>
                </li>
              )}
              {data.interpreted.useCases && data.interpreted.useCases.length > 0 && (
                <li className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300">
                  Use Case: {data.interpreted.useCases.join(", ")}
                </li>
              )}
              {Object.entries(data.interpreted.weights).map(([key, weight]) => {
                if (weight === 0) return null;
                const label = key.replace(/_/g, " ");
                let priority = "Normal priority";
                if (weight >= 80) priority = "High priority";
                else if (weight >= 50) priority = "Medium priority";

                return (
                  <li
                    key={key}
                    className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-300"
                  >
                    {label}: <span className="text-purple-100 font-semibold">{priority}</span>
                  </li>
                );
              })}
              {Object.keys(data.interpreted.weights).length === 0 &&
                data.interpreted.budgetPaise === null &&
                data.interpreted.category === null && (
                  <li className="text-xs text-slate-500">
                    No specific constraints identified. Showing highest-rated products.
                  </li>
                )}
            </ul>
          </section>

          {/* Recommended Products */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recommended Products</h2>
              <span className="text-sm text-slate-400">
                {data.results.length} product{data.results.length === 1 ? "" : "s"} matched
              </span>
            </div>

            {data.results.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
                <p className="text-lg font-medium text-slate-300">No products match your specific criteria.</p>
                <p className="mt-2 text-sm text-slate-500">
                  Try adjusting your budget or searching in a different category.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.results.map((result, idx) => {
                  const badge = getRankBadge(idx);
                  return (
                    <article
                      key={result.sku}
                      className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-6 transition-all hover:border-slate-700 hover:shadow-2xl hover:shadow-purple-950/10 relative"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
                            {result.brand}
                          </p>
                          {result.subcategory && (
                            <p className="text-[11px] text-slate-400">{result.subcategory}</p>
                          )}
                        </div>
                      </div>

                      {/* Product Name & Description */}
                      <h3 className="mt-4 text-lg font-bold text-white leading-snug">
                        {result.name}
                      </h3>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {result.description}
                      </p>

                      {/* Rating & Price */}
                      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                          <span>★ {result.rating ?? 4.5}</span>
                          <span className="text-slate-500 font-normal">
                            ({result.reviewCount ?? 100})
                          </span>
                        </div>
                        <p className="text-lg font-bold text-emerald-400">
                          {formatInr(result.pricePaise)}
                        </p>
                      </div>

                      {/* Specs Pill Tags */}
                      {result.specs && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {result.specs.batteryHours !== undefined && result.specs.batteryHours > 0 && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              🔋 {result.specs.batteryHours}h Battery
                            </span>
                          )}
                          {result.specs.ancType && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              🔇 {result.specs.ancType}
                            </span>
                          )}
                          {result.specs.waterRating && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              💧 {result.specs.waterRating}
                            </span>
                          )}
                          {result.specs.bluetoothVersion && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              📶 BT {result.specs.bluetoothVersion}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Why this? Rationale Box */}
                      <div className="mt-5 pt-4 border-t border-slate-800">
                        <div className="rounded-xl bg-purple-950/30 border border-purple-500/20 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-1.5 flex items-center gap-1.5">
                            <span>💡</span> Why This Recommendation?
                          </p>
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {result.explanation}
                          </p>
                        </div>
                      </div>

                      {/* Strengths and Tradeoffs */}
                      <div className="mt-4 space-y-2">
                        {result.strengths && result.strengths.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                              Key Strengths
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {result.strengths.map((s, i) => (
                                <span
                                  key={i}
                                  className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300"
                                >
                                  ✓ {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.tradeoffs && result.tradeoffs.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">
                              Trade-offs to Consider
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {result.tradeoffs.map((t, i) => (
                                <span
                                  key={i}
                                  className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300"
                                >
                                  • {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
