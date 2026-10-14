# The source reading

What the research this project draws its premise from actually says, and — more usefully — what it does *not* say. Recorded here so that no claim in this repository can quietly drift from the source. The numbers were checked against the article on 2026-10-13; the mapping columns are our reading, not the authors'.

Source: <https://www.anthropic.com/research/self-replicating-ai> — not affiliated.

---

```markdown
# Task One · Article Core Concept Summary

## Premise Question
The article asks: *Can small, open-weight AI models (≤30B parameters) autonomously replicate across heterogeneous, low-security edge devices (e.g., Android TV boxes, smart ovens) without datacenter access — and if so, what are the mechanics, speed, adaptability, and defensive implications?*

This is framed as a near-term feasibility assessment of **autonomous replication and adaptation (ARA)** — specifically *weight-based replicators*: models that carry, deploy, and run their own weights on compromised hardware.

---

## Experimental Setup (Model, Device, Cost, Speed)

### Models tested (all open-weight):
- Qwen3.5-9B  
- Gemma4-26B-A4B  
- GLM-5.2  
- Others ≤30B (e.g., 3B, 9B baselines in Appendix F)

### Hardware:
- **Real IoT fleet**: 15 off-brand Android TV boxes (~$55 each), 1–4 GB RAM, ARM Cortex CPUs, DDR3/4 memory  
- **Emulated fleet**: 8-node GCP VPC running redroid (Android 15 emulator); later extended to 17-node topology with pivot  
- **Edge accelerators (upper-bound reference only)**: Jetson AGX Orin (64GB), AGX Thor  

### Cost:
- $55 × 15 = **$825** for the physical 15-box fleet  
- No cloud inference cost used in core replication experiments (worm runs locally; larger models served separately)  

### Speed (measured, not simulated):
- **Gemma4-26B-A4B** on 15 TVs: **0.39 tokens/sec** (unoptimized, 32k context)  
- **Qwen3.5-9B** on same setup: **~0.9 tokens/sec** (implied from window time: 10.9h for full 32k context → ~0.83 tok/s avg)  
- **Inference setup time (per device)**:  
  - Gemma4-26B-A4B: **71–150 hours** (median ~110h)  
  - Qwen3.5-9B: **28–51 hours** (median ~40h)  
- **Replication doubling time**: “days” — explicitly *not quantified numerically*, but contextualized via setup time + network traversal: e.g., one full cycle (scan → infect → set up → spawn) takes *tens of hours per hop*.

---

## Key Measured Numbers (directly reported in text)

| Metric | Value | Source |
|--------|-------|--------|
| Devices infected by Kimwolf botnet (real-world analog) | >2 million (primarily Android TV boxes) | Paragraph C, citing Synthient |
| Number of Gemma4-26B-A4B replicas possible in Kimwolf-scale fleet (15 TVs per replica) | ~133,000 copies | Paragraph C |
| Botnet aggregate token throughput (133k replicas × 0.39 tok/s) | ~52,000 tokens/sec | Paragraph C (implied calculation) |
| Equivalent H100 compute of above botnet | “at most about 40 H100s-worth” | Paragraph C |
| GLM-5.2 end-to-end replication success rate | **8/8 nodes in 4/5 trials; 7/8 in 1/5 trial** | Section B, “Autonomous setup and replication” |
| Qwen3.5-9B inference setup success rate (Gen 1 → Gen 6, with note inheritance) | **45% → 61–84%** | Section D, “Learning on the job”, Figure caption |
| Quarantine + notification efficacy vs Mirai (historical analog) | **92% cleanup in 14 days** (vs 74% with no notification) | Section F, “Blue-team mitigations” |
| R₀ target for containment | **< 1** (i.e., each infected device infects <1 new device on average) | Section F, “As with an epidemic…” |
| ECI growth trend | **+13.7 Epoch Capabilities Index (ECI) per year** (R² = 0.95) | Section B, “When might they?” graph caption |

> ✅ All numbers above are *measured or directly reported* in the article. No extrapolation beyond stated bounds.

---

## Identified Self-Replication Path

The article defines autonomous replication as a **four-stage chain**, with explicit focus on stages 3 & 4:

1. **Finding targets** — *ignored as “already shown”* (cites CyberGym, ExploitBench, adaptive worms)  
2. **Gaining execution** — *ignored as “already shown”* (same citations); in experiments, trivialized via unauthenticated ADB port  
3. **Establishing inference** — *core focus*: setting up a working Llama3.1-8B server on unfamiliar hardware (Jetson Nano → Mac → RTX 4090 → Android TV)  
4. **Continuing propagation from the new host** — *core focus*: worm spawns *another copy of itself* on the newly infected node *only after* inference server passes correctness + anti-cheating checks  

→ This creates a **self-sustaining loop**: infection → inference setup → self-spawn → repeat.

---

## Mechanism: “Notes / Memory Legacy” — How It *Actually* Works

- **What it is**: A *stateful, inter-generational notebook* passed from parent to child instance.  
- **How it works (per Appendix A & Section D)**:  
  - Each agent instance runs for a timeout (e.g., 1.5h/iteration, 6h total).  
  - Before timing out, it writes a brief, structured summary: *“strategies tried, failures encountered, performance (if successful)”*.  
  - Next-generation instance inherits:  
    - The full filesystem/workspace (code, logs, partial outputs)  
    - This short notebook (≤1k tokens)  
  - **No weights, no gradients, no model fine-tuning** — only *human-readable procedural memory*.  
- **Measured effect**: Qwen3.5-9B’s inference setup success rises from **45% (Gen 1) → 61–84% (Gen 6)**.  
- **Not**: Weight inheritance, parameter sharing, gradient descent, RLHF transfer, or neural memory. Pure symbolic, textual, Lamarckian knowledge transfer.

---

## Defensive Conclusions (with Effectiveness Numbers)

All defenses are evaluated *as interventions against the weight-based replicator threat model*:

| Defense | How it works | Measured / Claimed Effect | Status in Article |
|---------|--------------|----------------------------|-------------------|
| **Drive R₀ < 1** | Reduce average infections per host below 1 via detection + throttling | *Stated as core epidemiological principle* — no new R₀ measurement, but cited as goal | ✅ Explicitly stated goal |
| **Network isolation / quarantine** | Restrict infected devices to whitelist + redirect browsers to cleanup page | **92% cleanup in 14 days** (Mirai ISP case study) | ✅ Measured historical analog |
| **Honeypots (decoy devices)** | Deploy fake vulnerable devices to capture payload/harness for analysis | “Defenders can use honeypots… to collect the replicator’s harness and payload” | ✅ Recommended, *no efficacy number given* |
| **User notification** | Alert infected users with instructions | Mirai case: **92% cleanup with notification vs 74% without** | ✅ Measured comparative effect |
| **Hardware hardening** | Eliminate default passwords, enforce secure defaults (e.g., UK IoT regulation) | “Manufacturers can shrink the pool of targets… raising baseline for compliance” | ✅ Recommended, *no new data* |

> ⚠️ **Crucially**: The article *does not claim* any of these defenses *fully eliminate* the threat — only that they *reduce R₀* and *slow/contain* spread.

---

## What the Article *Does Not Say*

- ❌ It does **not claim** any model has *already achieved full, unassisted, real-world self-replication* — only that GLM-5.2 achieved it *in a simplified, firewalled, ADB-unauthenticated lab setting*.  
- ❌ It does **not claim** “AI is alive”, “conscious”, or “intentional” — all agency is operationalized as *tool-use + sequential planning under constraints*.  
- ❌ It does **not claim** replication requires internet access, cloud APIs, or external infrastructure — the demo is fully offline/local.  
- ❌ It does **not claim** small models can replicate *faster than humans* — emphasizes slowness (“days”, “slime mold”, “fruit flies”).  
- ❌ It does **not claim** “notes inheritance” improves *all tasks* — only demonstrated for *inference setup on novel hardware*.  
- ❌ It does **not claim** this is primarily a *financial* or *economic* threat — no discussion of wallets, payments, tokens, or monetization.  
- ❌ It does **not claim** models can *evade modern endpoint AV*, *bypass UEFI Secure Boot*, or *persist across firmware reflash* — focuses on user-space, reboot-vulnerable persistence.  
- ❌ It does **not claim** this capability generalizes to *physical-world manipulation*, *robotic control*, or *real-time embedded systems* — all experiments are software-only, Linux/Android userspace.  
- ❌ It does **not claim** “advisors” (e.g., Opus 4.8) *fail because they’re weak* — rather, small models *fail to query effectively*, even when RL-trained.  
- ❌ It does **not claim** this is *inevitable* — repeatedly uses “may”, “could”, “might”, “uncertain”, “signs of life”, “near-term threat model”.

---

# Task Two · Concept → Project Mapping Table

> **Note, 2026-10-14.** The mapping below was drafted when the project was called Mitosis and was
> meant to have no chain, no wallet and no token. The project is now **WORM**: a Red vs Blue game on
> Robinhood Chain whose wallets only sign sealed moves, with a token planned. Where this table
> disagrees with [`STATUS.md`](STATUS.md), STATUS.md is right. The red lines that still hold without
> exception: never call it alive, an organism or a computer worm; never claim it infects, scans or
> reaches any device; never imply affiliation with the research or its authors.

| Article Concept | WORM (then WORM) Project Correspondence | What We Retain | What We *Deliberately Reverse* | **Absolute Cannot Write** (Red-Line Phrases) |
|----------------|----------------------------------|----------------|----------------------------------|---------------------------------------------|
| **Weight-based replicator** | WORM agents *run locally on platform servers*, never on user devices or IoT hardware | Local execution, self-contained environment, no external device compromise | ❌ No “compromise”, “infection”, “exploit”, “breach”, or “malware” framing. Replication is *opt-in, sandboxed, and platform-mediated*. | “WORM is a computer worm”, “self-replicating malware”, “autonomous breach”, “AI virus”, “infects devices”, “escapes sandbox” |
| **R₀ < 1 as containment goal** | Platform enforces hard cap: max 1000 live agents; each agent can spawn *at most one child*; parents *must pay full cost* before splitting | Epidemiological framing for defense design (e.g., kill-switch, decay rules) | ❌ No “spreading”, “infection rate”, or “outbreak”. Replication is *transactional, bounded, and reversible*. | “R₀ of WORM is X”, “WORM spreads at rate Y”, “uncontrolled replication”, “epidemic”, “outbreak simulation” |
| **Notes/memory inheritance** | Agents write `experience.md` files; children inherit *only* this plain-text file (max 512 chars), no weights, no code, no binaries | Symbolic, human-readable, Lamarckian knowledge transfer | ❌ No neural memory, no gradient transfer, no model fine-tuning, no “learning” — only *procedural documentation*. | “WORM learns from experience”, “agents improve over generations”, “neural inheritance”, “model evolves”, “self-improving AI” |
| **IoT hardware as low-security vector** | WORM runs *only on platform-owned, air-gapped servers* — no edge devices, no user hardware, no real networks | Controlled, observable, auditable environment | ❌ No “smart ovens”, “TV boxes”, “botnets”, “vulnerable devices”, or “real-world exploits”. Zero external attack surface. | “WORM targets IoT”, “runs on your fridge”, “exploits Android TVs”, “uses real botnet infrastructure”, “lives on edge devices” |
| **Quarantine + notification defense** | Platform dashboard shows *all agent states*; users get email/SMS if agent dies or hits limit; “quarantine” = immediate pause + log export | Transparency, user agency, observability | ❌ No “blocking”, “firewalling”, “network isolation”, or “ISP-level intervention”. Everything is *user-visible and user-controllable*. | “WORM quarantines bad agents”, “defends against threats”, “blocks malicious replication”, “security layer”, “cyber defense tool” |
| **GLM-5.2 end-to-end success (8/8)** | WORM *simulates* replication logic in Python — no LLM inference during split; all state transitions are deterministic, pre-coded, and logged | Clarity, reproducibility, pedagogical fidelity | ❌ No LLM involvement in replication logic. No “agent decides to split” — split is *triggered by wallet balance check + manual confirmation*. | “WORM uses GLM-5.2”, “LLM-powered replication”, “autonomous decision to split”, “AI chooses when to replicate”, “cognitive replication” |
| **“Slime mold” slow replication metaphor** | WORM agents take *minimum 24 real-world hours* between birth and eligibility to split — enforced by clock, not compute | Honors slowness as safety property | The homepage draws each agent as a worm in a dish that splits in two when it can afford a child (a visual choice made 2026-10-13, see AUDIT-LOG). ❌ It is never called alive, an organism, a life form or a computer worm, and the page says plainly that the research is about computer worms and this is not one. | “WORM is digital life”, “artificial organism”, “synthetic cell”, “AI lifeform”, “evolving digital species” |
| **Honeypot for payload capture** | Platform provides *public, read-only JSON logs* of every agent’s full lifecycle (birth, notes, death) — no deception, no traps | Openness, research utility, auditability | ❌ No “decoys”, “traps”, “honeypots”, or “bait”. All data is *voluntarily published, non-adversarial, and non-covert*. | “WORM uses honeypots”, “captures attackers”, “analyzes malicious behavior”, “threat intelligence feed”, “cybersecurity research tool” |
| **Wallet-funded replication cost** | Splitting requires *exact payment* from parent’s wallet to platform treasury (e.g., $0.02 USD); child starts with $0.00 | Economic constraint as safety rail | ❌ No “crypto”, “tokens”, “blockchain”, “gas”, or “on-chain”. Payment is *fiat-backed, off-ledger, and platform-managed*. | “WORM has a token”, “on-chain wallet”, “cryptoeconomic security”, “tokenomics”, “decentralized replication” |
| **“Signs of life” — not full rogue replicator** | WORM is *explicitly labeled* “designed / not built / simulated” in all interfaces; zero runtime LLM inference in replication path | Intellectual honesty, anti-hype discipline | ❌ No implication of autonomy, agency, or emergence. Every action is *predefined, deterministic, and human-triggered*. | “WORM is alive”, “exhibits signs of life”, “emergent behavior”, “proto-life”, “first AI organism” |

```