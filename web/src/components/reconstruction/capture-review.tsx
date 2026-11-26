"use client";

import Image from "next/image";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { type BreakKind, type CaptureReport, type Motion, type Verdict, resolveFrom } from "./review-data";

// Colores de estado (fijos): siempre van con ícono y texto, nunca solos.
export const STATUS: Record<Verdict, { fill: string; ink: string; name: string; meaning: string }> = {
  verde: { fill: "#0ca30c", ink: "#ffffff", name: "Green", meaning: "ready to reconstruct" },
  amarillo: { fill: "#fab219", ink: "#0b0b0b", name: "Yellow", meaning: "possible, with warnings" },
  rojo: { fill: "#d03b3b", ink: "#ffffff", name: "Red", meaning: "better to reshoot" },
};
// Colores de la línea de tiempo. Salen de las variables del tema (app/globals.css), así que cambian con él. En el
// SVG van en style: un atributo fill o stroke no admite var().
const PROBLEM = "var(--problem)"; // dónde hay un problema: el amarillo del semáforo
const TRACK = "var(--rule)";
const AXIS = "var(--rule-strong)";
const TEXT = "var(--ink-soft)";
const MUTED = "var(--ink-faint)";
const CURSOR = "var(--ink)";

export function StatusIcon({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      {verdict === "verde" && <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === "amarillo" && <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === "rojo" && <path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" />}
    </svg>
  );
}

export function VerdictBadge({ verdict, short = false }: { verdict: Verdict; short?: boolean }) {
  const status = STATUS[verdict];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold"
      style={{ background: status.fill, color: status.ink }}
    >
      <StatusIcon verdict={verdict} className="size-4" />
      {short ? status.name : `${status.name}: ${status.meaning}`}
    </span>
  );
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function Tiles({ report }: { report: CaptureReport }) {
  const m = report.metrics;
  const photos = report.source.kind === "photos";
  const tiles: [string, number | null][] = photos
    ? [["Sharp photos", m.sharp], ["Well lit", m.lit], ["Detailed", m.detailed], ["Pairs where the camera moves", m.moving]]
    : [["Sharp frames", m.sharp], ["Well lit", m.lit], ["Detailed", m.detailed], ["Time the camera is moving", m.moving]];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
      {tiles.map(([label, value]) => (
        <div key={label} className="border-t border-rule-strong pt-3">
          <dt className="text-xs text-ink-faint">{label}</dt>
          <dd className="mt-1 text-xl font-medium tracking-[-0.02em] text-ink tabular-nums">{percent(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Issues({ issues }: { issues: CaptureReport["issues"] }) {
  return (
    <ul className="mt-6 space-y-3">
      {issues.map((issue) => (
        <li key={issue.code} className="flex gap-2.5">
          <span
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
            style={{ background: STATUS[issue.level].fill, color: STATUS[issue.level].ink }}
          >
            <StatusIcon verdict={issue.level} className="size-3" />
            <span className="sr-only">{STATUS[issue.level].name}</span>
          </span>
          <div className="text-sm">
            <p className="text-ink">{issue.message}</p>
            <p className="text-ink-muted">How to improve it: {issue.tip}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- Línea de tiempo de problemas ------------------------------------------------------------------------------

type Span = { start: number; end: number; text: string };
type Row = { label: string; spans: Span[]; marks: { t: number; text: string }[]; stateAt: (t: number) => string };

const FLAG_TEXT: Record<string, string> = {
  borroso: "blurry",
  oscuro: "dark",
  quemado: "overexposed",
  liso: "nearly featureless",
};
const BREAK_TEXT: Record<BreakKind, string> = {
  corte: "edit cut",
  perdido: "tracking lost",
  "sin-solape": "no overlap with previous photo",
};
const MOTION_TEXT: Record<Motion, string> = { avanza: "moving", gira: "turning in place", quieto: "still" };

function medianStep(times: number[]) {
  const steps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  return steps.length ? steps[Math.floor(steps.length / 2)] : 1;
}

function flagSpans(report: CaptureReport, flag: string, half: number): Span[] {
  const spans: Span[] = [];
  for (const entry of report.timeline) {
    if (!entry.flags.includes(flag)) continue;
    const last = spans.at(-1);
    if (last && entry.t - half <= last.end + 1e-6) last.end = entry.t + half;
    else spans.push({ start: entry.t - half, end: entry.t + half, text: FLAG_TEXT[flag] });
  }
  return spans;
}

function buildRows(report: CaptureReport): Row[] {
  const half = medianStep(report.timeline.map((e) => e.t)) / 2;
  const inSpans = (spans: Span[], t: number) => spans.find((s) => t >= s.start && t <= s.end)?.text;
  const flagRow = (label: string, flags: string[], ok: string): Row => {
    const spans = flags.flatMap((flag) => flagSpans(report, flag, half));
    return { label, spans, marks: [], stateAt: (t) => inSpans(spans, t) ?? ok };
  };
  const motionSpans = report.pairs
    .filter((p) => p.motion !== "avanza")
    .map((p) => ({ start: p.t0, end: p.t1, text: MOTION_TEXT[p.motion] }));
  const marks = report.breaks.map((b) => ({ t: b.t, text: BREAK_TEXT[b.kind] }));
  const photos = report.source.kind === "photos";
  return [
    flagRow("Sharpness", ["borroso"], "sharp"),
    flagRow("Light", ["oscuro", "quemado"], "good"),
    flagRow("Detail", ["liso"], "detailed"),
    {
      label: "Motion",
      spans: motionSpans,
      marks: [],
      stateAt: (t) => {
        const pair = report.pairs.find((p) => t >= p.t0 && t <= p.t1);
        return pair ? MOTION_TEXT[pair.motion] : "no data";
      },
    },
    {
      label: "Continuity",
      spans: [],
      marks,
      stateAt: (t) => marks.find((m) => Math.abs(m.t - t) <= Math.max(half, 0.5))?.text ?? (photos ? "overlapping" : "no cuts"),
    },
  ];
}

function formatTime(t: number, photos: boolean) {
  if (photos) return `photo ${Math.round(t) + 1}`;
  if (t < 60) return `${Math.round(t)} s`;
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatRange(span: Span, photos: boolean, end: number) {
  const a = Math.max(0, span.start);
  const b = Math.min(end, span.end);
  if (photos) {
    const first = Math.ceil(a) + 1;
    const last = Math.floor(b) + 1;
    return first >= last ? `photo ${first}` : `photos ${first}–${last}`;
  }
  return `${formatTime(a, false)} – ${formatTime(b, false)}`;
}

function niceTicks(end: number, photos: boolean, plotWidth: number) {
  const maxTicks = Math.max(2, Math.floor(plotWidth / 72));
  const steps = photos ? [1, 2, 5, 10, 20, 25, 50, 100, 200, 500] : [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => end / s <= maxTicks) ?? steps[steps.length - 1];
  const ticks = [0];
  for (let v = step; v <= end + 1e-6; v += step) ticks.push(photos ? v - 1 : v);
  return photos ? ticks.filter((t, i) => i === 0 || t > 0) : ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const ROW_H = 28;
const AXIS_H = 22;

export function ProblemTimeline({ report, reportUrl }: { report: CaptureReport; reportUrl: string }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const photos = report.source.kind === "photos";
  const end = photos ? Math.max(1, report.source.count - 1) : Math.max(1, report.source.duration ?? 1);
  const rows = buildRows(report);
  const times = report.timeline.map((e) => e.t);
  const labelW = width < 480 ? 88 : 112;
  const plotX = labelW;
  const plotW = Math.max(10, width - labelW - 6);
  const x = (t: number) => plotX + (Math.min(Math.max(t, 0), end) / end) * plotW;
  const plotH = rows.length * ROW_H;

  const nearest = (t: number) => {
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(nearest(((e.clientX - rect.left) / rect.width) * end));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      setHover((h) => Math.min(times.length - 1, Math.max(0, (h ?? -delta) + delta)));
    } else if (e.key === "Escape") setHover(null);
  };

  const t = hover === null ? null : times[hover];
  const tipLeft = t === null ? 0 : x(t) + 12 > width - 210 ? Math.max(0, x(t) - 222) : x(t) + 12;

  return (
    <div>
      <p className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: PROBLEM }} aria-hidden />
        Segments with problems. Hover with the mouse (or use the arrow keys) to see each moment.
      </p>
      {report.thumbs && report.thumbs.length > 0 && (
        <div className="mt-3 flex gap-1" style={{ marginLeft: labelW, marginRight: 6 }}>
          {report.thumbs.map((thumb) => (
            <figure key={thumb.url} className="min-w-0 flex-1">
              <Image
                unoptimized
                src={resolveFrom(reportUrl, thumb.url)}
                alt={`Frame at ${formatTime(thumb.t, false)}`}
                width={480}
                height={270}
                className="aspect-video w-full rounded-sm bg-tint object-cover"
              />
              <figcaption className="mt-0.5 text-center font-mono text-[10px] text-ink-faint">{formatTime(thumb.t, false)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        aria-label="Review timeline: sharpness, light, detail, motion and continuity. The same information is in the list below."
        className="relative mt-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
      >
        {width > 0 && (
          <svg width={width} height={plotH + AXIS_H} className="block select-none">
            {rows.map((row, i) => {
              const y = i * ROW_H;
              return (
                <g key={row.label}>
                  <text x={0} y={y + ROW_H / 2} dominantBaseline="middle" style={{ fill: TEXT }} fontSize={12}>
                    {row.label}
                  </text>
                  <rect x={plotX} y={y + 9} width={plotW} height={10} rx={5} style={{ fill: TRACK }} />
                  {row.spans.map((s, k) => (
                    <rect
                      key={k}
                      x={x(s.start)}
                      y={y + 9}
                      width={Math.max(2, x(s.end) - x(s.start))}
                      height={10}
                      rx={2}
                      style={{ fill: PROBLEM }}
                    />
                  ))}
                  {row.marks.map((m, k) => (
                    <rect key={k} x={x(m.t) - 1} y={y + 5} width={2} height={18} rx={1} style={{ fill: PROBLEM }} />
                  ))}
                </g>
              );
            })}
            <line x1={plotX} x2={plotX + plotW} y1={plotH + 0.5} y2={plotH + 0.5} style={{ stroke: AXIS }} />
            {niceTicks(end, photos, plotW).map((tick) => (
              <text key={tick} x={x(tick)} y={plotH + 15} textAnchor="middle" fontSize={11} style={{ fill: MUTED }}>
                {formatTime(tick, photos)}
              </text>
            ))}
            {t !== null && <line x1={x(t)} x2={x(t)} y1={0} y2={plotH} style={{ stroke: CURSOR }} strokeWidth={1} />}
            <rect
              x={plotX}
              y={0}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {t !== null && (
          <div
            className="pointer-events-none absolute top-0 w-52 rounded-md border border-rule bg-paper p-2.5 text-xs shadow-sm"
            style={{ left: tipLeft }}
          >
            <p className="font-mono font-medium text-ink">{formatTime(t, photos)}</p>
            <ul className="mt-1 space-y-0.5">
              {rows.map((row) => {
                const state = row.stateAt(t);
                const problem = row.spans.some((s) => s.text === state) || row.marks.some((m) => m.text === state);
                return (
                  <li key={row.label} className="flex items-center gap-1.5">
                    <span className="h-0.5 w-2.5 shrink-0 rounded" style={{ background: problem ? PROBLEM : AXIS }} />
                    <span className="font-medium text-ink">{state}</span>
                    <span className="text-ink-faint">{row.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-ink-faint transition-colors hover:text-ink">Show the segments as a list</summary>
        <ul className="mt-2 space-y-1 text-ink-soft">
          {rows.map((row) => {
            const items = [
              ...row.spans.map((s) => `${s.text}: ${formatRange(s, photos, end)}`),
              ...row.marks.map((m) => `${m.text}: ${formatTime(m.t, photos)}`),
            ];
            return (
              <li key={row.label}>
                <span className="text-ink-faint">{row.label}:</span>{" "}
                {items.length ? items.slice(0, 12).join(" · ") + (items.length > 12 ? ` · and ${items.length - 12} more` : "") : "no issues"}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

export function ReviewPanel({
  report,
  reportUrl,
  compact = false,
}: {
  report: CaptureReport;
  reportUrl: string;
  compact?: boolean;
}) {
  return (
    <section className="rounded-md border border-rule p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <VerdictBadge verdict={report.verdict} />
        <p className="min-w-0 flex-1 basis-64 text-sm text-ink-soft">{report.summary}</p>
      </div>
      <Tiles report={report} />
      {report.issues.length > 0 && <Issues issues={report.issues} />}
      <p className="mt-6 text-sm text-ink-soft">
        <span className="text-ink-faint">What DronAI would do:</span> {report.tier}
      </p>
      {compact ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink-muted underline decoration-rule-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink">
            {report.source.kind === "photos" ? "See the photo-by-photo review" : "See the second-by-second review"}
          </summary>
          <div className="mt-3">
            <ProblemTimeline report={report} reportUrl={reportUrl} />
          </div>
        </details>
      ) : (
        <div className="mt-5">
          <ProblemTimeline report={report} reportUrl={reportUrl} />
        </div>
      )}
    </section>
  );
}
