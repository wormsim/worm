"use client";

/* The season's two tables. Recomputed from the season on every render — there is
   no leaderboard on the server to tamper with. */

import { useState } from "react";
import type { Standings as S } from "../../lib/standings";
import { isHuman } from "../../lib/standings";

const name = (p: string, me?: string | null) => p === me ? "You" : p === "you" ? "You" : /^0x/.test(p) ? `${p.slice(0, 6)}…${p.slice(-4)}` : p;

export default function Standings({ s, me, link = false, title = "THE SEASON SO FAR" }: { s: S; me?: string | null; link?: boolean; title?: string }) {
  const [all, setAll] = useState(false);
  const n = all ? 999 : 8;
  const who = (p: string) => link && /^0x/.test(p) ? <a href={`/player/${p}`}>{name(p, me)}</a> : name(p, me);
  const row = (p: string) => `${p === me || p === "you" ? "me" : ""}${isHuman(p) ? " human" : ""}`;
  return <div className="standings">
    <div className="curveHead"><div><span className="mono">{title}</span><h3>Worms {s.days.red} · Wardens {s.days.blue} <small className="muted">days won</small></h3></div>
      <p className="muted">Ranked from the season itself, in this browser. Families by worms alive, then deepest generation. Wardens by worms stopped. Names without a wallet are the house bots that fill empty seats.</p></div>
    <div className="stGrid">
      <div className="tableWrap"><table className="stTable"><thead><tr><th>#</th><th className="rTxt">Worm family</th><th>Alive</th><th>Gen</th><th>Born</th></tr></thead>
        <tbody>{s.families.slice(0, n).map((f, i) => <tr key={f.fam} className={row(f.player)}><td>{i + 1}</td><td>{who(f.player)}</td><td>{f.alive || <span className="muted">{f.deadOn ? `gone d${f.deadOn}` : "gone"}</span>}</td><td>{f.gens}</td><td>{f.born}</td></tr>)}</tbody></table></div>
      <div className="tableWrap"><table className="stTable"><thead><tr><th>#</th><th className="bTxt">Warden</th><th>Stopped</th><th>Caught</th><th>Cleaned</th></tr></thead>
        <tbody>{s.wardens.slice(0, n).map((w, i) => <tr key={w.player} className={row(w.player)}><td>{i + 1}</td><td>{who(w.player)}</td><td>{w.stopped}</td><td>{w.caught}</td><td>{w.cleaned}</td></tr>)}</tbody></table></div>
    </div>
    {(s.families.length > 8 || s.wardens.length > 8) && <button className="linkish mono" onClick={() => setAll(!all)}>{all ? "SHOW TOP 8" : `SHOW ALL ${s.families.length} FAMILIES AND ${s.wardens.length} WARDENS`}</button>}
  </div>;
}
