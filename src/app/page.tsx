import { getPublishedCatalog } from "@/lib/catalog.server";

export const dynamic = "force-dynamic";

const formatInr = (paise: bigint) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(paise) / 100);

export default async function Home() {
  const { merchant, products } = await getPublishedCatalog();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Day 1 foundation</p>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight text-white">BuyableAI</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-300">An explainable foundation for merchants that AI buyers can understand, evaluate, and safely transact with.</p>
      <section className="mt-14 rounded-3xl border border-slate-700 bg-slate-900/70 p-8">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-400">Demo merchant</p><h2 className="text-2xl font-semibold text-white">{merchant?.name ?? "No active merchant"}</h2></div><span className="rounded-full bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200">{products.length} seeded earbuds</span></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => <article className="rounded-2xl border border-slate-700 bg-slate-950 p-5" key={product.sku}><p className="text-xs font-medium uppercase tracking-wider text-cyan-300">{product.brand}</p><h3 className="mt-2 text-lg font-semibold text-white">{product.name}</h3><p className="mt-2 min-h-12 text-sm text-slate-400">{product.description}</p><div className="mt-5 flex items-center justify-between"><span className="font-semibold text-white">{formatInr(product.pricePaise)}</span><span className="text-sm text-emerald-300">{product.availableQty} in stock</span></div></article>)}
        </div>
      </section>
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <a href="/shop" className="rounded-xl bg-purple-500/10 border border-purple-500/20 px-5 py-3 text-sm font-semibold text-purple-300 transition-all hover:bg-purple-500/20 hover:border-purple-400/30">Enter Buyer Shop →</a>
        <a href="/merchant/readiness" className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-5 py-3 text-sm font-semibold text-cyan-300 transition-all hover:bg-cyan-500/20 hover:border-cyan-400/30">View Readiness Report →</a>
      </div>
    </main>
  );
}
