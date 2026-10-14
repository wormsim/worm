"use client";

/* One-click sharing: a card drawn in the browser (download it, or copy the
   text) and a post-on-X link whose URL unfurls into the same card. */

import { useEffect, useRef, useState } from "react";
import type { FrameWorm } from "../../../sim/war";
import { headline, postText, subline, toQuery, type ShareData } from "../../lib/share";

export default function ShareCard({ data, frame, myFam }: { data: ShareData; frame: FrameWorm[]; myFam: number | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setUrl(`${location.origin}/s?${toQuery(data)}`); }, [data]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const x = c.getContext("2d"); if (!x) return;
    const W = 1200, H = 675; c.width = W; c.height = H;
    const red = data.side === "red", accent = red ? "#5ce1ff" : "#c4b8ff";
    x.fillStyle = "#05060a"; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(930, 340, 20, 930, 340, 360); g.addColorStop(0, red ? "#5ce1ff22" : "#a08cff22"); g.addColorStop(1, "#05060a00"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    // the dish at the end of the day, with your family lit
    const cx = 930, cy = 340, R = 250, cs = (R * 2) / 13;
    x.fillStyle = "#0a1220"; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
    x.strokeStyle = "#2c3b58"; x.lineWidth = 2; x.stroke();
    x.strokeStyle = data.winner === "red" ? "#5ce1ff" : "#ff5fb7"; x.lineWidth = 4; x.lineCap = "round";
    x.beginPath(); x.arc(cx, cy, R + 18, -Math.PI / 2, -Math.PI / 2 + Math.min(2, data.R) / 2 * Math.PI * 2); x.stroke();
    for (const [id, fam, gx, gy, settled] of frame) {
      const px = cx - R + (gx + 0.5) * cs + ((id * 7) % 5 - 2) * 2, py = cy - R + (gy + 0.5) * cs + ((id * 3) % 5 - 2) * 2, a = (id * 2.4) % 6.28;
      const mine = fam === myFam;
      x.strokeStyle = mine ? "#5ce1ff" : "rgba(130,150,190,0.55)"; x.lineWidth = mine ? 5 : 3.5;
      x.beginPath(); x.moveTo(px - Math.cos(a) * 9, py - Math.sin(a) * 9); x.quadraticCurveTo(px + Math.sin(a) * 4, py - Math.cos(a) * 4, px + Math.cos(a) * 9, py + Math.sin(a) * 9); x.stroke();
      x.fillStyle = mine ? "#e8fbff" : "rgba(170,185,215,0.8)"; x.beginPath(); x.arc(px + Math.cos(a) * 9, py + Math.sin(a) * 9, mine ? 3.5 : 2.5, 0, 7); x.fill();
      if (settled && mine) { x.strokeStyle = "rgba(92,225,255,0.4)"; x.lineWidth = 1; x.beginPath(); x.arc(px, py, 12, 0, 7); x.stroke(); }
    }
    // words
    const font = (w: number, s: number, f = "Archivo") => `${w} ${s}px "${f}", ui-sans-serif, sans-serif`;
    x.fillStyle = accent; x.font = font(500, 20, "IBM Plex Mono"); x.fillText(`WORM · ${red ? "WORM SIDE" : "WARDEN SIDE"} · ${data.mode === "live" ? "LIVE" : "PRACTICE"}`, 64, 80);
    x.fillStyle = "#eef1f8"; x.font = font(800, 66);
    const words = headline(data).split(" "); let line = "", y = 190;
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > 560 && line) { x.fillText(line, 64, y); line = w; y += 72; } else line = t; }
    x.fillText(line, 64, y);
    x.fillStyle = accent; x.font = font(600, 28); x.fillText(subline(data), 64, y + 64);
    x.fillStyle = "#ff5fb7"; x.fillRect(64, 520, 4, 74);
    x.fillStyle = "#b3bacb"; x.font = font(500, 24); x.fillText("They built an AI worm. We made it pay rent.", 84, 548);
    x.fillStyle = "#6c7590"; x.font = font(500, 16, "IBM Plex Mono");
    x.fillText(`season ${data.season} · seed ${data.seed} · head ${data.head.slice(0, 16)}…`, 84, 584);
    x.fillText("re-run it yourself", 84, 608);
  }, [data, frame, myFam]);

  const text = postText(data);
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const download = () => { const c = ref.current; if (!c) return; const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `worm-${data.side}-day${data.day || "season"}.png`; a.click(); };
  const copy = async () => { try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };

  return <div className="shareCard">
    <span className="mono">SHARE THIS {data.day ? "DAY" : "SEASON"}</span>
    <canvas ref={ref} className="shareCanvas" aria-label={`${headline(data)} ${subline(data)}`} />
    <div className="shareBtns">
      <a className="primary" href={intent} target="_blank" rel="noreferrer">POST ON X <span>↗</span></a>
      <button className="chip" onClick={download}>SAVE IMAGE</button>
      <button className="chip" onClick={copy}>{copied ? "COPIED" : "COPY TEXT"}</button>
    </div>
  </div>;
}
