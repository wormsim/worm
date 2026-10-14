"use client";

import { useEffect, useState } from "react";
import Tutorial, { tutorialSeen } from "./Tutorial";
import LiveClient from "./LiveClient";
import PlayClient from "./PlayClient";
import Outbreak from "../outbreak/Outbreak";

type Tab = "outbreak" | "live" | "practice";

/* Three ways in: the real-time roguelite, the live season with real players,
   and a practice season of the live rules against bots. */
export default function PlayTabs() {
  const [tab, setTab] = useState<Tab>("outbreak");
  const [help, setHelp] = useState(false);
  useEffect(() => { if (tab !== "outbreak" && !tutorialSeen()) setHelp(true); }, [tab]);
  const T = (id: Tab, name: string, sub: string) => <button role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><b>{name}</b><span className="mono">{sub}</span></button>;
  return <>
    <Tutorial open={help} onClose={() => setHelp(false)} />
    <div className="playTabs three" role="tablist">
      {T("outbreak", "Outbreak", "REAL-TIME · 7 DAYS · DRAFT A CARD A DAY")}
      {T("live", "Live season", "REAL PLAYERS · ONE MOVE A DAY · ROBINHOOD CHAIN")}
      {T("practice", "Season practice", "THE LIVE RULES · YOU VS 40 BOTS")}
    </div>
    {tab !== "outbreak" && <div className="helpRow"><button className="linkish mono" onClick={() => setHelp(true)}>? HOW THE SEASON WORKS · 60 SECONDS</button></div>}
    {tab === "outbreak" ? <Outbreak /> : tab === "practice" ? <PlayClient /> : <LiveClient />}
  </>;
}
