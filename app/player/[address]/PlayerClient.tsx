"use client";

/* One player's season. Nothing here comes from a profile on the server: the page
   fetches the published season, replays it with the engine, and reads this
   wallet's moves and results out of the replay. */

import { useEffect, useMemo, useState } from "react";
import { noteText, type Move } from "../../../sim/war";
import { CHAIN } from "../../lib/live/protocol";
import { replaySeason, type PublishedDay } from "../../lib/live/season";
import { playerDays, rankOf, standings } from "../../lib/standings";
import { TOOL_CARDS } from "../../components/play/Planner";

const toolName = (k: string) => TOOL_CARDS.find((t) => t.kind === k)?.name ?? k;
const moveText = (m: Move | null) => !m ? "—" : m.side === "red" ? noteText(m.note) : m.tools.map((t) => `${toolName(t.kind)} at ${t.x},${t.y}`).join(" · ");

export default function PlayerClient({ address }: { address: string }) {
  const [data, setData] = useState<{ season: number; published: PublishedDay[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^0x[0-9a-f]{40}$/.test(address);
  useEffect(() => {
    if (!valid) return;
    fetch(`/api/live?address=${address}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(new Error(`the server answered ${r.status}`)))
      .then((j) => setData({ season: j.season, published: j.published })).catch((e) => setErr(e.message));
  }, [address, valid]);
  const view = useMemo(() => {
    if (!data) return null;
    const { state, resolved } = replaySeason(data.season, data.published);
    const s = standings(state, resolved.map((d) => d.result));
    return { s, rank: rankOf(s, address), days: playerDays(address, state, resolved), fam: s.families.find((f) => f.player === address), ward: s.wardens.find((w) => w.player === address) };
  }, [data, address]);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return <>
    <span className="mono step">LIVE SEASON · PLAYER</span>
    <h1>{valid ? short : "Not a wallet address"}</h1>
    {valid && <p className="muted">Rebuilt in this browser from the published season. <a href={`${CHAIN.explorer}/address/${address}`} target="_blank" rel="noreferrer">See the wallet on {CHAIN.name} ↗</a></p>}
    {err && <p className="verdict bad">The live server isn&apos;t reachable ({err}).</p>}
    {valid && !err && !view && <p className="muted">Replaying the season…</p>}
    {view && !view.rank && <p>This wallet hasn&apos;t played season {data!.season} yet. <a href="/play">Play the live season →</a></p>}
    {view && view.rank && <>
      <div className="stats playerStats">
        <div><span className="mono">SIDE</span><b className={view.rank.side === "red" ? "rTxt" : "bTxt"}>{view.rank.side === "red" ? "Worm" : "Warden"}</b></div>
        <div><span className="mono">RANK</span><b>{view.rank.rank}<small> / {view.rank.of}</small></b></div>
        {view.fam && <><div><span className="mono">ALIVE NOW</span><b>{view.fam.alive}</b></div><div><span className="mono">DEEPEST GEN</span><b>{view.fam.gens}</b></div></>}
        {view.ward && <><div><span className="mono">STOPPED</span><b>{view.ward.stopped}</b></div><div><span className="mono">NOTES READ</span><b>{view.ward.notesRead}</b></div></>}
      </div>
      <h2>Day by day</h2>
      <div className="tableWrap"><table className="runsTable dayTable"><thead><tr><th>Day</th><th>Move</th><th>{view.rank.side === "red" ? "Born / lost" : "Stopped"}</th><th>Alive at close</th><th>R</th><th>Day went to</th></tr></thead>
        <tbody>{view.days.map((d) => <tr key={d.day}><td data-l="Day">{d.day}</td><td data-l="Move" className="mv">{d.side ? moveText(d.move) : <span className="muted">no reveal</span>}</td>
          <td data-l={view.rank!.side === "red" ? "Born / lost" : "Stopped"}>{view.rank!.side === "red" ? `+${d.births} / −${d.deaths}` : d.stopped}</td><td data-l="Alive">{view.rank!.side === "red" ? d.score : "—"}</td><td data-l="R">{d.R.toFixed(2)}</td><td data-l="Day went to" className={d.winner === "red" ? "rTxt" : "bTxt"}>{d.winner === "red" ? "Worms" : "Wardens"}</td></tr>)}</tbody></table></div>
      <p className="muted">Every number on this page comes from replaying the season&apos;s published moves against the drawn blocks. <a href="/play">Open the live season →</a></p>
    </>}
  </>;
}
