/* The image a shared link unfurls into on X: 1200×675, drawn on the server
   from the link's own parameters. No database, no network. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { fromQuery, headline, subline } from "../../lib/share";

/* Archivo (SIL OFL, media/fonts/ARCHIVO-LICENSE.txt), read from disk: the card needs no font host. */
const font = (w: 500 | 800) => readFileSync(path.join(process.cwd(), "media", "fonts", `archivo-latin-${w}-normal.woff`));
let fonts: { name: string; data: Buffer; weight: 500 | 800; style: "normal" }[] | null = null;

export function GET(req: Request) {
  fonts ??= [{ name: "Archivo", data: font(500), weight: 500, style: "normal" }, { name: "Archivo", data: font(800), weight: 800, style: "normal" }];
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const d = fromQuery(q);
  const red = d?.side !== "blue";
  const accent = red ? "#5ce1ff" : "#c4b8ff";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#05060a", color: "#eef1f8", padding: "60px 70px", fontFamily: "Archivo", fontWeight: 500 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 4, color: accent }}>
        <span>WORM · {red ? "WORM SIDE" : "WARDEN SIDE"}</span>
        <span style={{ color: "#8a92a8" }}>{d?.mode === "live" ? "LIVE SEASON" : "PRACTICE SEASON"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 1, letterSpacing: -3, display: "flex" }}>{d ? headline(d) : "They built an AI worm."}</div>
        <div style={{ fontSize: 40, marginTop: 26, color: accent, display: "flex" }}>{d ? subline(d) : "We made it pay rent."}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 20, color: "#8a92a8" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span>season {d?.season ?? "—"} · seed {d?.seed ?? "—"}</span>
          <span style={{ color: "#5f6780", marginTop: 6 }}>chain head {d?.head || "—"}… · re-run it yourself</span>
        </div>
        <div style={{ display: "flex", borderLeft: "4px solid #ff5fb7", paddingLeft: 16, fontSize: 26, color: "#eef1f8" }}>They built an AI worm. We made it pay rent.</div>
      </div>
    </div>,
    { width: 1200, height: 675, fonts }
  );
}
