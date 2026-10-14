/* ── sim/engine.ts ───────────────────────────────────────────────────────────
   The whole rule set of the jar, in one deterministic function.

   A tick is a fixed sequence of arithmetic over an array of agents in birth order.
   The only source of variation is one seeded PRNG, drawn in that same fixed order.
   There is no `Date.now()`, no `Math.random()`, no transcendental function (their
   last bit differs between machines), and no floating-point input that was not
   rounded first — the same seed must produce the same bytes everywhere, which is
   what makes the printed chain a commitment rather than a checksum.

   Simulation only. Nothing here touches a wallet, a chain or a payment rail; the
   balances are numbers in a struct and the rent is a deduction. That boundary is
   the product's, not an oversight — see LIMITATIONS.md.
   --------------------------------------------------------------------------- */

import { chainHash, GENESIS, recordHash } from "./hash";

export const WORLD_VERSION = "worm/1";

/** Every number that changes a run. Changing one is a WORLD change: bump the version. */
export const RULES = {
  birthCost: 4,          // what a founder costs; a split needs 2× this
  startCash: 3.5,        // a founder's opening balance (below the split threshold on purpose)
  rent: 0.45,            // compute charged per agent per tick
  rentCreep: 0.003,      // rent multiplier per tick: compute gets more expensive over time
  jobChance: 0.5,        // probability of paid work in a tick
  jobPay: 1.2,           // price of one job
  generationBonus: 1.25, // job chance multiplier from generation 3 up: inherited notes help
  cap: 42,               // hard ceiling on living agents — the jar has a lid
  maxTicks: 340
} as const;

export interface Agent {
  id: number;
  parent: number | null;
  gen: number;
  cash: number;
  bornTick: number;
}

export interface TickRecord {
  v: string;
  t: number;
  alive: number;
  maxGen: number;
  births: number;
  deaths: number;
  treasury: number;
  rent: number;
}

export interface Event {
  t: number;
  kind: "birth" | "split" | "death";
  id: number;
  parent: number | null;
  gen: number;
  cash: number;
}

export interface Run {
  seed: number;
  version: string;
  ticks: number;
  records: TickRecord[];
  events: Event[];
  /** Chain head after the last tick — the value a daily anchor would commit to. */
  chain: string;
  /** Last record's own hash, kept so a reader can recompute the chain. */
  head: string;
  stats: { alive: number; maxGen: number; births: number; deaths: number; treasury: number };
}

/** mulberry32: 32-bit, integer-only, identical everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** A read-only view of one living agent, handed to an observer after each tick. */
export type AgentSnapshot = Readonly<Agent>;

/**
 * Run the jar. Deterministic by construction: same `seed` and `ticks` ⇒ same
 * records, same chain head, on any machine.
 *
 * `observe`, if given, receives a copy of the living agents after every tick (and
 * once for tick 0). It is for drawing, nothing else: it gets copies, its return
 * value is ignored, and it is called after the tick's record is hashed — so an
 * observer cannot change a run. `tests/sim.test.ts` asserts exactly that.
 */
export function simulate(seed: number, ticks: number = RULES.maxTicks, observe?: (t: number, agents: AgentSnapshot[]) => void): Run {
  const rnd = mulberry32(seed);
  const agents: Agent[] = [
    { id: 0, parent: null, gen: 1, cash: RULES.startCash, bornTick: 0 },
    { id: 1, parent: null, gen: 1, cash: RULES.startCash, bornTick: 0 },
    { id: 2, parent: null, gen: 1, cash: RULES.startCash, bornTick: 0 }
  ];
  const records: TickRecord[] = [];
  const events: Event[] = [];
  let nextId = 3, births = 0, deaths = 0, treasury = 0, chain = GENESIS, head = GENESIS;
  observe?.(0, agents.map((a) => ({ ...a })));

  for (let t = 1; t <= ticks; t++) {
    const rent = r6(RULES.rent * (1 + (t - 1) * RULES.rentCreep));
    const born: Agent[] = [];
    let tickBirths = 0, tickDeaths = 0;

    // Fixed order: the array as it stands at the start of the tick. New agents are
    // appended and cannot act until the next tick — otherwise birth order would leak
    // into the outcome and two machines could disagree.
    for (const a of agents) {
      a.cash = r6(a.cash - rent);
      const chance = RULES.jobChance * (a.gen >= 3 ? RULES.generationBonus : 1);
      if (rnd() < chance) {
        a.cash = r6(a.cash + RULES.jobPay);
        treasury = r6(treasury + RULES.jobPay);
      }
      if (a.cash <= 0) {
        tickDeaths++; deaths++;
        events.push({ t, kind: "death", id: a.id, parent: a.parent, gen: a.gen, cash: 0 });
        continue;
      }
      if (a.cash >= RULES.birthCost * 2 && agents.length + born.length < RULES.cap) {
        a.cash = r6(a.cash / 2);          // the parent keeps half; that is the cost of a child
        const child: Agent = { id: nextId++, parent: a.id, gen: a.gen + 1, cash: a.cash, bornTick: t };
        born.push(child);
        tickBirths++; births++;
        events.push({ t, kind: "split", id: child.id, parent: a.id, gen: child.gen, cash: child.cash });
      }
    }
    for (const c of born) agents.push(c);

    const alive = agents.filter((a) => a.cash > 0);
    agents.length = 0;
    agents.push(...alive);

    const record: TickRecord = {
      v: WORLD_VERSION, t, alive: agents.length,
      maxGen: agents.reduce((m, a) => Math.max(m, a.gen), 0),
      births: tickBirths, deaths: tickDeaths, treasury, rent
    };
    records.push(record);
    head = recordHash(record);
    chain = chainHash(chain, head);
    observe?.(t, agents.map((a) => ({ ...a })));
    if (agents.length === 0) break;        // extinct: the jar stops, the record stays
  }

  return {
    seed, version: WORLD_VERSION, ticks: records.length, records, events, chain, head,
    stats: { alive: agents.length, maxGen: agents.reduce((m, a) => Math.max(m, a.gen), 0), births, deaths, treasury }
  };
}
