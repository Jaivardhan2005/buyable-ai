import { prisma } from "@/lib/prisma";
import { readinessRubric, type ReadinessInput } from "@/lib/readiness-rubric";
import { demoMerchant } from "@/lib/demo-catalog";
import { RunAssessmentButton } from "./ReadinessClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merchant Readiness | BuyableAI",
  description: "Explainable readiness assessment for AI-buyable merchants.",
};

const severityColor: Record<string, string> = {
  BLOCKER: "bg-red-500/20 text-red-300 border-red-500/30",
  WARNING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  INFO: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const scoreColor = (score: number) =>
  score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";

const barColor = (score: number) =>
  score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";



export default async function MerchantReadinessPage() {
  const merchant = await prisma.merchant.findUnique({ where: { slug: demoMerchant.slug } });

  if (!merchant) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-white">Merchant not found</h1>
        <p className="mt-4 text-slate-400">The demo merchant has not been seeded. Run <code className="text-cyan-300">npm run prisma:seed</code> first.</p>
      </main>
    );
  }

  const assessment = await prisma.readinessAssessment.findFirst({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    include: { issues: { orderBy: [{ severity: "asc" }, { code: "asc" }] } },
  });

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <nav className="mb-10">
        <a href="/" className="text-sm text-slate-400 hover:text-cyan-300 transition-colors">← Back to catalog</a>
      </nav>

      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Merchant Readiness</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{merchant.name}</h1>
      <p className="mt-3 text-slate-400">Explainable readiness assessment — measures whether an AI buyer can safely discover, evaluate, and transact with this merchant.</p>

      <div className="mt-8">
        <RunAssessmentButton merchantId={merchant.id} />
      </div>

      {!assessment ? (
        <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-900/70 p-8">
          <p className="text-slate-400">No assessment has been run yet. Click <span className="font-semibold text-white">Run Assessment</span> above to generate an explainable readiness report.</p>
        </section>
      ) : (
        <>
          {/* Overall score */}
          <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-900/70 p-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-sm text-slate-400">Overall readiness score</p>
                <p className={`mt-1 text-6xl font-bold tracking-tight ${scoreColor(assessment.score)}`}>{assessment.score}<span className="text-2xl text-slate-500">/100</span></p>
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>Rubric: <span className="text-slate-300">{assessment.rubricVersion}</span></p>
                <p>Assessed: <span className="text-slate-300">{new Date(assessment.createdAt).toLocaleString()}</span></p>
                <p>Status: <span className="rounded-full bg-emerald-400/10 px-3 py-0.5 text-xs font-medium text-emerald-300">{assessment.status}</span></p>
              </div>
            </div>
          </section>

          {/* Dimension breakdown */}
          <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-8">
            <h2 className="text-lg font-semibold text-white">Dimension Breakdown</h2>
            <p className="mt-1 text-sm text-slate-400">Each dimension contributes its weight to the overall score based on the rubric.</p>

            <div className="mt-6 space-y-4">
              {readinessRubric.map((dimension) => {
                const dimensions = assessment.dimensions as ReadinessInput;
                const earned = dimensions[dimension.key] ?? 0;
                const contribution = Math.round((earned * dimension.weight) / 100);

                return (
                  <div key={dimension.key} className="rounded-xl border border-slate-700/50 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{dimension.label}</p>
                        <p className="text-xs text-slate-500">Weight: {dimension.weight}% · Contributes {contribution} points</p>
                      </div>
                      <span className={`text-2xl font-bold ${scoreColor(earned)}`}>{earned}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full rounded-full transition-all ${barColor(earned)}`} style={{ width: `${earned}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Issues */}
          <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Issues</h2>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">{assessment.issues.length} found</span>
            </div>

            {assessment.issues.length === 0 ? (
              <p className="mt-4 text-sm text-emerald-300">No issues detected — this merchant is fully AI-buyer ready.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {assessment.issues.map((issue) => (
                  <div key={issue.id} className={`rounded-xl border p-4 ${severityColor[issue.severity] ?? severityColor.INFO}`}>
                    <div className="flex items-center gap-3">
                      <span className="rounded-md border border-current px-2 py-0.5 text-xs font-bold uppercase">{issue.severity}</span>
                      <p className="font-medium">{issue.title}</p>
                    </div>
                    <p className="mt-2 text-xs opacity-70">Code: <code>{issue.code}</code></p>
                    {issue.safeFix && (
                      <p className="mt-1 text-xs">
                        Suggested fix: <span className="text-slate-200">{(issue.safeFix as Record<string, string>).action}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Snapshot hashes */}
          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-xs text-slate-500">
            <p>Catalog snapshot: <code className="text-slate-400">{assessment.catalogSnapshotHash}</code></p>
            <p className="mt-1">Policy snapshot: <code className="text-slate-400">{assessment.policySnapshotHash}</code></p>
          </section>
        </>
      )}
    </main>
  );
}
