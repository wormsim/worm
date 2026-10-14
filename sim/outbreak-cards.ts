/* ── sim/outbreak-cards.ts ───────────────────────────────────────────────────
   The draft. One pool per side; the side you play picks 1 of 3 after every day,
   and the other side — run by the house — drafts 1 from its own pool. That is
   the arms race: whatever build you go for, the other side is building too.

   Rarity is drawn 60 / 30 / 10. Stackable cards can be taken again.
   Each card names the line of the research it comes from where there is one.
   --------------------------------------------------------------------------- */

export type CardSide = "worm" | "warden";
export type Rarity = "common" | "rare" | "epic";

export interface WormMods {
  rentMul: number; settleMul: number; speedMul: number; foodMul: number; splitMul: number; brood: number;
  baitSense: boolean; deepBurrow: boolean; scatter: number; hardIncomeMul: number; incomeMul: number;
  secondWind: boolean; dashCdMul: number; mitosis: boolean; martyr: boolean; swarmMind: boolean; gossip: boolean;
}
export interface WardenMods {
  energyMul: number; extraTools: number; droneSpeedMul: number; lungeCdMul: number; netMul: number; qDurMul: number;
  hardenCost: number; hardenBig: boolean; honeyCharges: number; qSize: number; alertRMul: number; alertAlone: number;
  sniffer: boolean; patch: boolean; sweepMul: number; overwatch: boolean; signature: boolean;
}

export const WORM_MODS: WormMods = {
  rentMul: 1, settleMul: 1, speedMul: 1, foodMul: 1, splitMul: 1, brood: 0, baitSense: false, deepBurrow: false, scatter: 1,
  hardIncomeMul: 1, incomeMul: 1, secondWind: false, dashCdMul: 1, mitosis: false, martyr: false, swarmMind: false, gossip: false
};
export const WARDEN_MODS: WardenMods = {
  energyMul: 1, extraTools: 0, droneSpeedMul: 1, lungeCdMul: 1, netMul: 1, qDurMul: 1, hardenCost: 2, hardenBig: false,
  honeyCharges: 1, qSize: 3, alertRMul: 1, alertAlone: 0.15, sniffer: false, patch: false, sweepMul: 1, overwatch: false, signature: false
};

export interface Card {
  id: string; side: CardSide; rarity: Rarity; stack: boolean; name: string; text: string; paper?: string;
  apply: (m: WormMods & WardenMods) => void;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export const CARDS: Card[] = [
  // ── worm ──────────────────────────────────────────────────────────────────
  { id: "thick-skin", side: "worm", rarity: "common", stack: true, name: "Thick Skin", text: "Rent costs 12% less.", apply: (m) => { m.rentMul = r4(m.rentMul * 0.88); } },
  { id: "quick-dig", side: "worm", rarity: "common", stack: true, name: "Quick Dig", text: "Settling takes 25% less time.", paper: "Setting up on new hardware was the slow step.", apply: (m) => { m.settleMul = r4(m.settleMul * 0.75); } },
  { id: "long-legs", side: "worm", rarity: "common", stack: true, name: "Long Legs", text: "Every worm crawls 15% faster.", apply: (m) => { m.speedMul = r4(m.speedMul * 1.15); } },
  { id: "forager", side: "worm", rarity: "common", stack: true, name: "Forager", text: "Food is worth 40% more.", apply: (m) => { m.foodMul = r4(m.foodMul * 1.4); } },
  { id: "lean-split", side: "worm", rarity: "common", stack: true, name: "Lean Split", text: "Splitting costs 12% less. Children start poorer.", apply: (m) => { m.splitMul = r4(m.splitMul * 0.88); } },
  { id: "brood", side: "worm", rarity: "common", stack: true, name: "Brood Pouch", text: "Every child is born with +0.6 extra cash.", apply: (m) => { m.brood = r4(m.brood + 0.6); } },
  { id: "bait-sense", side: "worm", rarity: "rare", stack: false, name: "Bait Sense", text: "You can see honeypots. No child of yours will touch one.", paper: "Defenders use decoys to capture a replicator.", apply: (m) => { m.baitSense = true; } },
  { id: "deep-burrow", side: "worm", rarity: "rare", stack: false, name: "Burrow Deep", text: "Settled worms are cleaned up half as often.", apply: (m) => { m.deepBurrow = true; } },
  { id: "scatter", side: "worm", rarity: "rare", stack: false, name: "Scatter", text: "Children land three times farther from their parent.", apply: (m) => { m.scatter = 3; } },
  { id: "hard-palate", side: "worm", rarity: "rare", stack: true, name: "Hard Palate", text: "Hard ground pays 35% more.", apply: (m) => { m.hardIncomeMul = r4(m.hardIncomeMul * 1.35); } },
  { id: "second-wind", side: "worm", rarity: "rare", stack: false, name: "Second Wind", text: "When your lead falls, the next one gets +3 cash and 3 seconds of cover.", apply: (m) => { m.secondWind = true; } },
  { id: "twitch", side: "worm", rarity: "rare", stack: true, name: "Twitch", text: "Your dash recharges 40% faster.", apply: (m) => { m.dashCdMul = r4(m.dashCdMul * 0.6); } },
  { id: "mitosis", side: "worm", rarity: "epic", stack: false, name: "Mitosis", text: "A worm with 1.6× the split cost splits into three.", apply: (m) => { m.mitosis = true; } },
  { id: "martyr", side: "worm", rarity: "epic", stack: false, name: "Notes From the Dead", text: "Every worm the wardens take leaves +0.4 cash to each crawling worm.", paper: "A note is the only thing that survives a death.", apply: (m) => { m.martyr = true; } },
  { id: "overclock", side: "worm", rarity: "epic", stack: false, name: "Overclock", text: "Income ×1.5. Rent ×1.3.", apply: (m) => { m.incomeMul = r4(m.incomeMul * 1.5); m.rentMul = r4(m.rentMul * 1.3); } },
  { id: "gossip", side: "worm", rarity: "epic", stack: false, name: "Gossip", text: "Notes go sideways: worms sharing a cell copy the note of the richest one there.", paper: "Beyond the paper: the notes it studied only went down a lineage.", apply: (m) => { m.gossip = true; } },
  { id: "swarm-mind", side: "worm", rarity: "epic", stack: false, name: "Swarm Mind", text: "Rallied worms move 40% faster and pay half rent.", apply: (m) => { m.swarmMind = true; } },
  // ── warden ────────────────────────────────────────────────────────────────
  { id: "battery", side: "warden", rarity: "common", stack: true, name: "Bigger Battery", text: "30% more energy, and it refills faster.", apply: (m) => { m.energyMul = r4(m.energyMul * 1.3); m.extraTools += 1; } },
  { id: "thrusters", side: "warden", rarity: "common", stack: true, name: "Thrusters", text: "The drone flies 18% faster.", apply: (m) => { m.droneSpeedMul = r4(m.droneSpeedMul * 1.18); } },
  { id: "capacitor", side: "warden", rarity: "common", stack: true, name: "Capacitor", text: "The drone's strike recharges 20% faster.", apply: (m) => { m.lungeCdMul = r4(m.lungeCdMul * 0.8); } },
  { id: "wide-net", side: "warden", rarity: "common", stack: true, name: "Wide Net", text: "The drone's strike is 35% wider.", apply: (m) => { m.netMul = r4(m.netMul * 1.35); } },
  { id: "long-q", side: "warden", rarity: "common", stack: true, name: "Long Quarantine", text: "Quarantines last 40% longer.", apply: (m) => { m.qDurMul = r4(m.qDurMul * 1.4); } },
  { id: "cheap-harden", side: "warden", rarity: "common", stack: false, name: "Cheap Concrete", text: "Hardening costs 1 and covers 3×3.", paper: "Fix insecure defaults: shrink the pool of easy targets.", apply: (m) => { m.hardenCost = 1; m.hardenBig = true; } },
  { id: "honey2", side: "warden", rarity: "rare", stack: false, name: "Sticky Honey", text: "Honeypots spring twice.", apply: (m) => { m.honeyCharges = 2; } },
  { id: "big-q", side: "warden", rarity: "rare", stack: false, name: "Wide Quarantine", text: "Quarantines cover 4×4.", apply: (m) => { m.qSize = 4; } },
  { id: "loud", side: "warden", rarity: "rare", stack: true, name: "Loud Alert", text: "Alerts reach 40% farther.", apply: (m) => { m.alertRMul = r4(m.alertRMul * 1.4); } },
  { id: "notify-all", side: "warden", rarity: "rare", stack: false, name: "Notify Everyone", text: "An alert on its own cleans 25%, not 15%.", paper: "Notified owners cleaned up 92% against 74%.", apply: (m) => { m.alertAlone = 0.25; } },
  { id: "sniffer", side: "warden", rarity: "rare", stack: false, name: "Sniffer", text: "Read the swarm's note at the start of every day.", apply: (m) => { m.sniffer = true; } },
  { id: "signature", side: "warden", rarity: "rare", stack: false, name: "Signature", text: "Every note a honeypot reads becomes a signature: worms carrying it are swept 50% more, and the drone hunts them first.", paper: "Beyond the paper: honeypots capture the payload; the next step is detecting it.", apply: (m) => { m.signature = true; } },
  { id: "patch", side: "warden", rarity: "epic", stack: false, name: "Patch Tuesday", text: "At midday, every worm settled on soft ground is knocked loose.", apply: (m) => { m.patch = true; } },
  { id: "scrubber", side: "warden", rarity: "epic", stack: false, name: "Scrubber", text: "Every sweep cleans 25% more.", apply: (m) => { m.sweepMul = r4(m.sweepMul * 1.25); } },
  { id: "overwatch", side: "warden", rarity: "epic", stack: false, name: "Overwatch", text: "A strike that catches a worm recharges at once.", apply: (m) => { m.overwatch = true; } }
];

export const cardById = (id: string) => CARDS.find((c) => c.id === id);
