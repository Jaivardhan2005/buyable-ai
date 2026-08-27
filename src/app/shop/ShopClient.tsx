"use client";

import { useState, useEffect } from "react";

type RecommendationResult = {
  sku: string;
  name: string;
  brand: string;
  description: string;
  score: number;
  pricePaise: string | number;
  attributes: Record<string, number>;
  explanation: string;
};

type InterpretedPrefs = {
  budgetPaise: string | number | null;
  category: string | null;
  weights: Record<string, number>;
};

type RecommendationData = {
  recommendationId: string;
  interpreted: InterpretedPrefs;
  results: RecommendationResult[];
};

export default function ShopClient({ initialHasSession, merchantId }: { initialHasSession: boolean, merchantId: string }) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch("/api/buyer/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText: query }),
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || "Something went wrong.");
      }
      
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatInr = (paise: string | number) => 
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(paise) / 100);



  return (
    <div className="space-y-12">
      {/* Input Section */}
      <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="shop-query" className="text-sm font-medium text-slate-300">What are you looking for?</label>
          <div className="flex gap-4 flex-col sm:flex-row">
            <input
              id="shop-query"
              type="text"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="e.g., I need earbuds for commuting under ₹18,000 with strong ANC and good bass."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading || !query.trim() || !hasSession}
              className="rounded-xl bg-purple-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {!hasSession && <p className="text-xs text-slate-500">Initializing session...</p>}
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
          
          {/* Explained Preferences */}
          <section className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Interpreted Preferences</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {data.interpreted.budgetPaise !== null && (
                <li className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-300">
                  Budget: up to {formatInr(data.interpreted.budgetPaise)}
                </li>
              )}
              {data.interpreted.category !== null && (
                <li className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-sm font-medium text-blue-300 capitalize">
                  Category: {data.interpreted.category}
                </li>
              )}
              {Object.entries(data.interpreted.weights).map(([key, weight]) => {
                if (weight === 0) return null;
                const label = key.replace(/_/g, " ");
                let priority = "Low priority";
                if (weight > 66) priority = "High priority";
                else if (weight > 33) priority = "Medium priority";

                return (
                  <li key={key} className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 text-sm font-medium text-purple-300">
                    {label}: <span className="text-purple-200 opacity-80">{priority}</span>
                  </li>
                );
              })}
              {Object.keys(data.interpreted.weights).length === 0 && data.interpreted.budgetPaise === null && data.interpreted.category === null && (
                <li className="text-sm text-slate-500">No specific preferences identified. Showing overall best options.</li>
              )}
            </ul>
          </section>

          {/* Recommended Products */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-6">Recommended for you</h2>
            
            {data.results.length === 0 ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-8 text-center">
                <p className="text-lg text-slate-300">No products match your specific criteria.</p>
                <p className="mt-2 text-sm text-slate-500">Try adjusting your budget or preferences to see more options.</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.results.map((result, idx) => (
                  <article key={result.sku} className="flex flex-col rounded-2xl border border-slate-700 bg-slate-950 p-6 transition-all hover:border-slate-600">
                    <div className="flex items-start justify-between">
                      <span className="inline-flex items-center justify-center rounded-full bg-purple-500/20 text-purple-300 w-8 h-8 text-sm font-bold">#{idx + 1}</span>
                      <p className="text-xs font-medium uppercase tracking-wider text-cyan-300">{result.brand}</p>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-white">{result.name}</h3>
                    <p className="mt-2 text-sm text-slate-400 min-h-12">{result.description}</p>
                    <p className="mt-4 text-lg font-medium text-emerald-400">{formatInr(result.pricePaise)}</p>
                    
                    <div className="mt-auto pt-6">
                      <div className="rounded-xl bg-slate-900 p-4 border border-slate-800">
                        <p className="text-sm text-slate-300">
                          <span className="text-purple-400 font-semibold block mb-1">Why this?</span>
                          {result.explanation}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
