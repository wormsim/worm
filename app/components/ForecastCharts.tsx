"use client";

/* The forecast's two charts. Small multiples for R by year (one panel per defence,
   one shared scale, so nothing leans on telling five similar lines apart), and the
   calibration columns against the paper's own numbers. Every value is also in the
   table under the charts; hover only adds a readout. */

import { useState } from "react";

interface Cell { pkg: string; era: number; year: number; meanR: number; held: number; lid: number; finalAlive: number }
interface Pkg { id: string; name: string; text: string }

const Y0 = 0.8, Y1 = 1.6, W = 280, H = 190, L = 34, R = 10, T = 14, B = 26;
const C = "#2aa3c2", INK = "#eef1f8", MUTED = "#8a92a8", GRID = "#1a2130", REF = "#5f6780", SURF = "#070a10";

export function RByYear({ cells, packages, crossovers }: { cells: Cell[]; packages: Pkg[]; crossovers: Record<string, number | null> }) {
  const years = [...new Set(cells.map((c) => c.year))].sort();
  const x = (y: number) => L + ((y - years[0]) / (years[years.length - 1] - years[0])) * (W - L - R);
  const y = (v: number) => T + (1 - (Math.min(Y1, Math.max(Y0, v)) - Y0) / (Y1 - Y0)) * (H - T - B);
  const [hover, setHover] = useState<{ pkg: string; year: number } | null>(null);
  return <div className="fcGrid">
    {packages.map((p) => {
      const row = cells.filter((c) => c.pkg === p.id).sort((a, b) => a.year - b.year);
      const cross = crossovers[p.id];
      const h = hover?.pkg === p.id ? row.find((c) => c.year === hover.year) : null;
      return <figure key={p.id} className={`fcPanel${p.id === "all" ? " lead" : ""}`}>
        <figcaption><b>{p.name}</b><span>{p.text}</span></figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.name}: typical daily R from ${row[0].year} to ${row[row.length - 1].year}`}
          onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const yr = years.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a)); setHover({ pkg: p.id, year: yr }); }}
          onPointerLeave={() => setHover(null)}>
          {[0.8, 1.2, 1.6].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(v) + 3} textAnchor="end" fill={MUTED} fontSize={9}>{v.toFixed(1)}</text></g>)}
          <line x1={L} x2={W - R} y1={y(1)} y2={y(1)} stroke={REF} strokeWidth={1} />
          <text x={W - R} y={y(1) - 4} textAnchor="end" fill={MUTED} fontSize={8.5}>R = 1</text>
          {[years[0], years[4], years[8], years[12]].filter(Boolean).map((yr) => <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fill={MUTED} fontSize={9}>{yr}</text>)}
          <path d={row.map((c, i) => `${i ? "L" : "M"}${x(c.year).toFixed(1)},${y(c.meanR).toFixed(1)}`).join(" ")} fill="none" stroke={C} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {row.map((c) => <circle key={c.year} cx={x(c.year)} cy={y(c.meanR)} r={c.year === hover?.year && h ? 5 : 3.2} fill={C} stroke={SURF} strokeWidth={2} />)}
          {cross && cross > years[0] && <g><line x1={x(cross)} x2={x(cross)} y1={T} y2={H - B} stroke={INK} strokeWidth={1} strokeDasharray="2 3" /><text x={x(cross) - 4} y={T + 9} textAnchor="end" fill={INK} fontSize={9}>above 1 from {cross}</text></g>}
          {h && <g><line x1={x(h.year)} x2={x(h.year)} y1={T} y2={H - B} stroke={MUTED} strokeWidth={1} /></g>}
        </svg>
        <div className="fcRead">{h ? <><b>R {h.meanR.toFixed(2)}</b> <span>{h.year} · held {Math.round(h.held * 100)}% · lid {Math.round(h.lid * 100)}%</span></> : <><b>R {row[0].meanR.toFixed(2)} → {row[row.length - 1].meanR.toFixed(2)}</b> <span>{cross === years[0] ? "above 1 in every year" : cross ? `above 1 from ${cross}` : "under 1 through " + years[years.length - 1]}</span></>}</div>
      </figure>;
    })}
  </div>;
}

export function Calibration({ rows }: { rows: { gen: number; tries: number; rate: number | null }[] }) {
  const data = rows.filter((r) => r.rate !== null && r.tries >= 20 && r.gen <= 5) as { gen: number; tries: number; rate: number }[];
  const CW = 560, CH = 220, l = 40, r = 190, t = 14, b = 28, bw = 22;
  const x = (g: number) => l + (g + 0.5) * ((CW - l - r) / 6);
  const y = (v: number) => t + (1 - v) * (CH - t - b);
  const [h, setH] = useState<number | null>(null);
  return <figure className="fcCal">
    <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Setup success by generation in the engine, against the paper's numbers">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={l} x2={CW - r} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={l - 6} y={y(v) + 3} textAnchor="end" fill={MUTED} fontSize={9}>{Math.round(v * 100)}%</text></g>)}
      <rect x={x(5) - 20} y={y(0.84)} width={40} height={y(0.61) - y(0.84)} fill="#ffffff" opacity={0.07} />
      <line x1={x(5) - 20} x2={x(5) + 20} y1={y(0.61)} y2={y(0.61)} stroke={INK} strokeWidth={1} />
      <line x1={x(5) - 20} x2={x(5) + 20} y1={y(0.84)} y2={y(0.84)} stroke={INK} strokeWidth={1} />
      <line x1={x(0) - 20} x2={x(0) + 20} y1={y(0.45)} y2={y(0.45)} stroke={INK} strokeWidth={1} />
      <text x={CW - r + 8} y={y(0.45) + 3} fill={MUTED} fontSize={9}>paper, generation 1: 45%</text>
      <text x={CW - r + 8} y={y(0.725) + 3} fill={MUTED} fontSize={9}>paper, generation 6: 61–84%</text>
      <line x1={x(0) + 22} x2={CW - r + 4} y1={y(0.45)} y2={y(0.45)} stroke={GRID} strokeDasharray="2 3" />
      {data.map((d) => {
        const top = y(d.rate), bot = y(0), cx = x(d.gen);
        return <g key={d.gen} onPointerEnter={() => setH(d.gen)} onPointerLeave={() => setH(null)} tabIndex={0} onFocus={() => setH(d.gen)} onBlur={() => setH(null)}>
          <rect x={cx - 24} y={t} width={48} height={CH - t - b} fill="transparent" />
          <path d={`M${cx - bw / 2},${bot} V${top + 4} Q${cx - bw / 2},${top} ${cx - bw / 2 + 4},${top} H${cx + bw / 2 - 4} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + 4} V${bot} Z`} fill={C} opacity={h === null || h === d.gen ? 1 : 0.55} />
          <text x={cx} y={top - 6} textAnchor="middle" fill={INK} fontSize={10}>{Math.round(d.rate * 100)}%</text>
          <text x={cx} y={CH - 10} textAnchor="middle" fill={MUTED} fontSize={9}>gen {d.gen + 1}</text>
        </g>;
      })}
    </svg>
    <figcaption className="fcRead">{h !== null ? (() => { const d = data.find((q) => q.gen === h)!; return <><b>{Math.round(d.rate * 100)}%</b> <span>of {d.tries.toLocaleString("en-US")} setups in generation {d.gen + 1} worked</span></>; })() : <><b>Engine, generation 1 → 4: {Math.round(data[0].rate * 100)}% → {Math.round((data.find((d) => d.gen === 3)?.rate ?? 0) * 100)}%</b> <span>white marks: the paper&apos;s measurements</span></>}</figcaption>
  </figure>;
}
