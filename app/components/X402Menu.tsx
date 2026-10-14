import { X402 } from "../lib/launch";

/* What a visitor (or their agent) will be able to pay for over HTTP 402.
   Nothing here is open: every card says so, and the config is the switch. */
const ITEMS: { en: string; den: string }[] = [
  { en: "Drop food", den: "A food patch next to a family of your choice in tomorrow's dish. It shows on the replay, labelled with who paid." },
  { en: "Name a family", den: "The longest-living family of the week takes a name you choose, written into that week's record." },
  { en: "Sealed-moment card", den: "One famous tick — a narrow escape, a split at the last moment — as a card anyone can re-run, forever." },
  { en: "Ask a dead worm", den: "Read the full diary a worm left behind, every line linked to the sealed tick it came from." }
];

export default function X402Menu() {
  return <div className="x402">
    <div className="x402Grid">
      {ITEMS.map((it) => <article key={it.en}>
        <span className="mono price">{X402.open ? "SEE PRICE" : "NOT OPEN YET"}</span>
        <h3>{it.en}</h3>
        <p>{it.den}</p>
        <span className="mono state"><i />OPENS AFTER LAUNCH</span>
      </article>)}
    </div>
    <div className="x402Note"><code>HTTP 402 · USDC</code><p>{X402.statusNote}</p></div>
  </div>;
}
