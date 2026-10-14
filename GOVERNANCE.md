# Governance

Small project, stated plainly.

## Who runs this

**One maintainer working with AI coding agents.** Commit messages say when a change was made with an
agent. There is no foundation, no DAO, no multisig, and no token-holder vote — because there is no
token.

## Who holds what

| Thing | Holder | Notes |
| --- | --- | --- |
| Repository and source | The maintainer | History is the record |
| Deployment access | None yet | There is no hosted service |
| Wallets | **None** | There is no wallet, no key, and no address to publish |
| Token allocation | **None**, because no token exists | If one ever exists, its allocation and its chain are published before anything opens |

No key material is in this repository, and none is needed to run it.

## How changes happen

1. Every change lands as its own commit with a message saying what and why.
2. A change that moves a golden vector must update `tests/goldens.json`, bump `WORLD_VERSION` if the
   rules changed, and say so in [AUDIT-LOG.md](AUDIT-LOG.md). CI fails otherwise.
3. Anything that would give an agent access to a network, a key, or a machine other than this process
   is rejected outright — not deferred, not flagged for discussion. The project's premise is that the
   jar has no door.

## Decisions that are not made

Recorded here instead of in someone's head:

- **The name.** The public name is **WORM** (2026-10-13). `Mitosis` was the working title, and it survives only in the repository's history.
- **Whether real money is ever involved.** Phase 2 in the pitch is a *design*, not a plan with a
  date, and it would bring obligations (identity, anti-money-laundering, custody) that this project
  has not begun to take on.
- **Whether a token exists at all.** Nothing here needs one.
