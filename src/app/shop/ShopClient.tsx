"use client";

import { useState, useEffect, useCallback } from "react";
import type { CartSummary, CartItemSummary } from "@/lib/cart";
import type { OrderSnapshot } from "@/lib/order";

type ScoreBreakdown = {
  attributeScore: number;
  useCaseScore: number;
  featureScore: number;
  qualityScore: number;
  valueScore?: number;
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

  // Cart & Checkout State
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartAddingSku, setCartAddingSku] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderConfirmed, setOrderConfirmed] = useState<OrderSnapshot | null>(null);

  const fetchCart = useCallback(async () => {
    try {
      const res = await fetch("/api/buyer/cart");
      if (res.ok) {
        const json = await res.json();
        setCart(json);
      }
    } catch {
      // Ignore initial cart fetch error if session is not yet ready
    }
  }, []);

  const ensureSession = useCallback(async () => {
    if (hasSession) return true;
    try {
      const targetMerchantId = merchantId || "merchant-demo-001";
      const res = await fetch("/api/buyer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: targetMerchantId }),
      });
      if (res.ok) {
        setHasSession(true);
        fetchCart();
        return true;
      }
    } catch (e) {
      console.error("Session creation error:", e);
    }
    return false;
  }, [hasSession, merchantId, fetchCart]);

  useEffect(() => {
    if (!hasSession) {
      ensureSession();
    } else {
      fetchCart();
    }
  }, [hasSession, ensureSession, fetchCart]);

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    if (!hasSession) {
      const sessionReady = await ensureSession();
      if (!sessionReady) {
        setError("Could not initialize buyer session. Please try again.");
        return;
      }
    }

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

  const handleAddToCart = async (sku: string) => {
    setCartAddingSku(sku);
    try {
      const res = await fetch("/api/buyer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, quantity: 1 }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to add to cart.");
      }

      setCart(json);
      setCartOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not add to cart.");
    } finally {
      setCartAddingSku(null);
    }
  };

  const handleUpdateQuantity = async (cartItemId: string, newQty: number) => {
    try {
      const res = await fetch("/api/buyer/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItemId, quantity: newQty }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to update quantity.");
      }

      setCart(json);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not update quantity.");
    }
  };

  const handleRemoveItem = async (cartItemId: string) => {
    try {
      const res = await fetch(`/api/buyer/cart?cartItemId=${encodeURIComponent(cartItemId)}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to remove item.");
      }

      setCart(json);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not remove item.");
    }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const res = await fetch("/api/buyer/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `idemp-${Date.now()}`,
        },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Checkout validation failed.");
      }

      setOrderConfirmed(json);
      setCartOpen(false);
      fetchCart(); // Refresh cart to clean state
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setCheckoutLoading(false);
    }
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

  const totalCartQty = cart?.totalQuantity ?? 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 relative">
      {/* Header with Cart Button */}
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div>
          <span className="inline-block px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold rounded-full uppercase tracking-wider mb-2">
            AI-Commerce Buyer Experience
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            SoundNest Audio Store
          </h1>
        </div>

        {/* Cart Trigger */}
        <button
          id="cart-trigger-btn"
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition text-slate-200 shadow-lg cursor-pointer"
        >
          <span className="text-xl">🛒</span>
          <span className="font-semibold text-sm">Cart</span>
          {totalCartQty > 0 && (
            <span
              id="cart-badge-count"
              className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse"
            >
              {totalCartQty}
            </span>
          )}
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Experience deterministic, transparent AI shopping recommendations with verified specifications and instant checkout.
          </p>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">
            Quick Searches:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((item, idx) => (
              <button
                key={idx}
                id={`quick-chip-${idx + 1}`}
                onClick={() => handleChipClick(item.query)}
                className="text-xs px-3 py-1.5 bg-slate-900 hover:bg-purple-900/40 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white rounded-lg transition text-left cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-2">
            <input
              id="shop-search-input"
              type="text"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition shadow-inner"
              placeholder="e.g. speakers under ₹4,000 with good bass, earbuds with ANC..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
            />
            <button
              id="shop-recommend-btn"
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-xl transition shadow-lg shadow-purple-900/20 cursor-pointer"
            >
              {loading ? "Analyzing..." : "Recommend"}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-4 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-sm mb-8">
            {error}
          </div>
        )}

        {/* Results Container */}
        {data && (
          <div className="space-y-8 animate-fadeIn">
            {/* Extracted Query Breakdown */}
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl text-xs text-slate-400">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <span className="font-semibold text-slate-300">Target Category:</span>{" "}
                  <span className="text-purple-400 uppercase font-mono font-bold">
                    {data.interpreted.category || "All Audio"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Budget Limit:</span>{" "}
                  <span className="text-emerald-400 font-mono font-bold">
                    {data.interpreted.budgetPaise ? formatInr(data.interpreted.budgetPaise) : "No Limit"}
                  </span>
                </div>
                {data.interpreted.useCases && data.interpreted.useCases.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-300">Use Cases:</span>{" "}
                    <span className="text-blue-400">{data.interpreted.useCases.join(", ")}</span>
                  </div>
                )}
                {data.interpreted.requestedFeatures && data.interpreted.requestedFeatures.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-300">Features:</span>{" "}
                    <span className="text-cyan-400">{data.interpreted.requestedFeatures.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendation Cards */}
            <div className="grid gap-6">
              {data.results.map((res, idx) => {
                const badge = getRankBadge(idx);
                const isAdding = cartAddingSku === res.sku;

                return (
                  <div
                    key={res.sku}
                    id={`recommendation-card-${idx + 1}`}
                    className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative overflow-hidden transition hover:border-slate-700 shadow-xl"
                  >
                    {/* Top Row: Rank Badge & Category */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badge.classes}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs uppercase tracking-wider text-slate-500 font-mono">
                        {res.category} {res.subcategory ? `• ${res.subcategory}` : ""}
                      </span>
                    </div>

                    {/* Product Name & Pricing */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-2">
                      <h3 className="text-xl font-bold text-white tracking-tight">
                        {res.name}
                      </h3>
                      <div className="text-right">
                        <span className="text-2xl font-extrabold text-emerald-400">
                          {formatInr(res.pricePaise)}
                        </span>
                      </div>
                    </div>

                    {/* Ratings & Brand */}
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
                      <span>Brand: <strong className="text-slate-200">{res.brand}</strong></span>
                      <span>•</span>
                      <span className="text-amber-400 font-semibold">★ {res.rating ?? 4.5}</span>
                      <span className="text-slate-500">({res.reviewCount ?? 120} reviews)</span>
                      <span>•</span>
                      <span className="font-mono text-purple-400">Match: {res.score}%</span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                      {res.description}
                    </p>

                    {/* Hardware Specs Pills */}
                    {res.specs && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {res.specs.batteryHours && (
                          <span className="text-xs bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700/50">
                            🔋 {res.specs.batteryHours}h Battery
                          </span>
                        )}
                        {res.specs.ancType && (
                          <span className="text-xs bg-slate-800/80 text-cyan-300 px-2.5 py-1 rounded-md border border-slate-700/50">
                            🔇 {res.specs.ancType}
                          </span>
                        )}
                        {res.specs.waterRating && (
                          <span className="text-xs bg-slate-800/80 text-blue-300 px-2.5 py-1 rounded-md border border-slate-700/50">
                            💧 {res.specs.waterRating} Rating
                          </span>
                        )}
                        {res.specs.bluetoothVersion && (
                          <span className="text-xs bg-slate-800/80 text-slate-400 px-2.5 py-1 rounded-md border border-slate-700/50">
                            📶 Bluetooth {res.specs.bluetoothVersion}
                          </span>
                        )}
                      </div>
                    )}

                    {/* "Why This?" Explanation Box */}
                    <div className="p-4 bg-purple-950/20 border border-purple-800/40 rounded-xl mb-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300 uppercase tracking-wider mb-1.5">
                        <span>💡</span>
                        <span>Why this?</span>
                      </div>
                      <p className="text-sm text-purple-100/90 leading-relaxed font-medium">
                        {res.explanation}
                      </p>
                    </div>

                    {/* Key Strengths & Tradeoffs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 text-xs">
                      {res.strengths && res.strengths.length > 0 && (
                        <div className="bg-slate-950/50 p-3 rounded-lg border border-emerald-900/30">
                          <span className="font-bold text-emerald-400 block mb-1">Key Strengths:</span>
                          <ul className="space-y-1 text-slate-300">
                            {res.strengths.map((st, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <span className="text-emerald-500">✓</span> {st}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {res.tradeoffs && res.tradeoffs.length > 0 && (
                        <div className="bg-slate-950/50 p-3 rounded-lg border border-amber-900/30">
                          <span className="font-bold text-amber-400 block mb-1">Trade-offs:</span>
                          <ul className="space-y-1 text-slate-400">
                            {res.tradeoffs.map((to, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <span className="text-amber-500">•</span> {to}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Add To Cart CTA */}
                    <div className="pt-2 border-t border-slate-800/60 flex justify-end">
                      <button
                        id={`add-to-cart-btn-${idx + 1}`}
                        onClick={() => handleAddToCart(res.sku)}
                        disabled={isAdding}
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-purple-900/20 cursor-pointer"
                      >
                        <span>{isAdding ? "Adding..." : "🛒 Add to Cart"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Cart Drawer / Slide-Over */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setCartOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shadow-2xl">
              {/* Drawer Header */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>🛒</span> Your Cart
                  </h2>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="text-slate-400 hover:text-white text-2xl p-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>

                {/* Warnings / Alerts */}
                {cart?.warnings && cart.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-300 text-xs">
                    {cart.warnings.map((w, i) => (
                      <p key={i}>⚠️ {w}</p>
                    ))}
                  </div>
                )}

                {checkoutError && (
                  <div className="mt-4 p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs">
                    ❌ {checkoutError}
                  </div>
                )}

                {/* Cart Items List */}
                <div className="mt-6 space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {!cart || cart.items.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      Your cart is empty.
                    </div>
                  ) : (
                    cart.items.map((item: CartItemSummary) => (
                      <div
                        key={item.id}
                        className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-white text-sm">
                              {item.name}
                            </h4>
                            <span className="text-xs text-slate-400 font-mono">
                              SKU: {item.sku}
                            </span>
                          </div>
                          <span className="font-bold text-emerald-400 text-sm">
                            {formatInr(item.lineTotalPaise)}
                          </span>
                        </div>

                        {item.stockWarning && (
                          <span className="text-xs text-amber-400">
                            ⚠️ {item.stockWarning}
                          </span>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                          {/* Quantity Controls */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center font-bold text-sm cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-bold text-sm text-white px-2">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                              disabled={item.quantity >= item.availableQty}
                              className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded flex items-center justify-center font-bold text-sm cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          {/* Delete Item */}
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            🗑️ Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Drawer Footer / Subtotal & Checkout */}
              {cart && cart.items.length > 0 && (
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-2 text-sm text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-white text-base">
                      {formatInr(cart.subtotalPaise)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-4 text-xs text-slate-500">
                    <span>Delivery & Taxes:</span>
                    <span className="text-emerald-400 font-medium">Free (Demo)</span>
                  </div>

                  <button
                    id="proceed-checkout-btn"
                    onClick={handleCheckout}
                    disabled={checkoutLoading || !cart.isCheckoutReady}
                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition text-center cursor-pointer"
                  >
                    {checkoutLoading ? "Validating & Creating Order..." : `Proceed to Checkout • ${formatInr(cart.subtotalPaise)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Confirmation Modal */}
      {orderConfirmed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setOrderConfirmed(null)}
          />

          <div className="relative bg-slate-900 border border-purple-500/40 rounded-2xl max-w-lg w-full p-6 text-slate-100 shadow-2xl animate-scaleUp">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                ✓
              </div>
              <h3 className="text-2xl font-extrabold text-white">
                Order Created Successfully!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Order ID: <span className="font-mono text-purple-300 font-semibold">{orderConfirmed.orderId}</span>
              </p>
            </div>

            {/* Order Items Snapshot */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 max-h-40 overflow-y-auto space-y-2">
              {orderConfirmed.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs py-1 border-b border-slate-900 last:border-0">
                  <span className="text-slate-300">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatInr(item.lineTotalPaise)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total Amount Snapshot */}
            <div className="flex justify-between items-center py-2 px-4 bg-purple-950/30 rounded-lg border border-purple-900/50 mb-4 text-sm">
              <span className="font-semibold text-purple-200">Authoritative Total:</span>
              <span className="text-lg font-extrabold text-emerald-400">
                {formatInr(orderConfirmed.amountPaise)}
              </span>
            </div>

            {/* Verified Policy Guarantees */}
            <div className="mb-6">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Verified Merchant Guarantees:
              </span>
              <div className="space-y-1.5">
                {orderConfirmed.policies.map((p, idx) => (
                  <div key={idx} className="text-xs bg-slate-950/60 p-2 rounded border border-slate-800/80 flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <div>
                      <strong className="text-slate-200">{p.title}:</strong>{" "}
                      <span className="text-slate-400">{p.summary}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              id="order-continue-shopping-btn"
              onClick={() => setOrderConfirmed(null)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
