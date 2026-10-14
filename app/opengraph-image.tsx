import { ImageResponse } from "next/og";

export const alt = "WORM — They built an AI worm. We made it pay rent.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* A dish of worms, drawn once as SVG and embedded, so the card needs no font or network. */
function dish(): string {
  const worms: string[] = [];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, r = 40 + Math.sqrt(i / 26) * 170, x = 250 + Math.cos(a) * r, y = 250 + Math.sin(a) * r;
    const dir = a * 1.7, len = 34 + (i % 5) * 6, c = i % 7 === 0 ? "#ff5fb7" : i % 9 === 0 ? "#ffb547" : "#5ce1ff";
    const dx = Math.cos(dir), dy = Math.sin(dir), nx = -dy, ny = dx;
    const p = (t: number) => `${(x + dx * len * t + nx * Math.sin(t * 6 + i) * 7).toFixed(1)},${(y + dy * len * t + ny * Math.sin(t * 6 + i) * 7).toFixed(1)}`;
    const d = `M${p(-0.5)} Q${p(-0.17)} ${p(0)} T${p(0.5)}`;
    worms.push(`<path d="${d}" stroke="${c}" stroke-opacity=".18" stroke-width="14" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#0f2433" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="${p(-0.5).split(",")[0]}" cy="${p(-0.5).split(",")[1]}" r="4.5" fill="#d9f6ff"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><circle cx="250" cy="250" r="236" fill="#0a1220" stroke="#2c3b58" stroke-width="2"/><circle cx="250" cy="250" r="248" fill="none" stroke="#5ce1ff" stroke-width="3" stroke-dasharray="1100 500"/>${worms.join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default function OgImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#05060a", color: "#eef1f8", position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dish()} width={500} height={500} style={{ position: "absolute", right: 60, top: 65 }} alt="" />
      <div style={{ position: "absolute", left: 70, top: 72, display: "flex", flexDirection: "column", width: 600 }}>
        <div style={{ fontSize: 22, letterSpacing: 6, color: "#5ce1ff", display: "flex" }}>WORM</div>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 0.95, letterSpacing: -3, marginTop: 36, display: "flex", flexDirection: "column" }}>
          <span>They built</span><span>an AI worm.</span><span style={{ color: "#5ce1ff" }}>We made it</span><span style={{ color: "#5ce1ff" }}>pay rent.</span>
        </div>
        <div style={{ marginTop: 34, paddingLeft: 18, borderLeft: "4px solid #ff5fb7", fontSize: 24, color: "#b3bacb", display: "flex" }}>Simulation only · every tick replays</div>
      </div>
    </div>,
    size
  );
}
