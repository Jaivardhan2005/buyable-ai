import { getBuyerSessionFromCookie } from "@/lib/session.server";
import ShopClient from "./ShopClient";
import { getPublishedCatalog } from "@/lib/catalog.server";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const session = await getBuyerSessionFromCookie();
  const catalog = await getPublishedCatalog();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <div className="mb-12 border-b border-slate-800 pb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-400">BuyableAI</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">AI Shopping Assistant</h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Tell us what you're looking for. Our AI understands your natural language, extracts your exact preferences, and evaluates {catalog.merchant?.name ?? "our"} catalog to recommend the best products for you.
        </p>
      </div>

      <ShopClient initialHasSession={!!session} merchantId={catalog.merchant?.id ?? ""} />
    </main>
  );
}
