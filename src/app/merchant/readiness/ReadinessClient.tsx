"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunAssessmentButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/merchant/readiness/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? `Assessment failed (${response.status})`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Assessing…" : "Run Assessment"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
