# Usage and Roadmap

## Running the 4G LTE twin

From `srsTwin/integration/`, single pair:

```bash
docker compose -f docker-compose.yml -f docker-compose.4g.yml up -d --build
docker logs srstwin_ue4g --tail 3   # expect "Network attach successful. IP: ..."
```

Three pairs (adds `srsenb2`/`srsue4g2`/`srsenb3`/`srsue4g3`, all sharing the
existing `srsepc`):

```bash
docker compose -f docker-compose.yml -f docker-compose.4g.yml -f docker-compose.3ue.yml \
  up -d srsenb2 srsue4g2 srsenb3 srsue4g3
```

If a newly added pair's UE fails to attach, check `srsepc`'s log first —
`srsepc` loads `subscribers.csv` once at startup, so a subscriber added
after it's already running needs `--force-recreate srsepc` to be picked up.
**Never recreate a UE alone against an already-running eNB** — that produces
a RACH retry storm that doesn't settle; always recreate an eNB+UE pair
together.

Dashboard: `python integration/dashboard/serve_dashboard.py --pull`, then
open `http://localhost:8765`. The 4G LTE tab shows a live signaling ladder,
per-message decode/explanation, attach/session KPIs, and (bottom-left) a
multi-UE KPI histogram. For a fuller-looking histogram, run
`integration/demo3ue/live_cycler.py --pairs 1,2,3` for a few minutes
beforehand — it continuously recreates each pair's containers to generate
fresh samples, so don't run it if you need the stack to stay up undisturbed
for something else at the same time.

## Running the 5G SA / signaling storm twin

From `srsTwin/integration/`:

```bash
python storm/generate.py storm/scenario.yml   # render configs/compose/manifest
python storm/orchestrate.py --build           # first run only; drop --build after
python storm/metrics.py                       # measure the result
```

Bring the plain `docker-compose.yml`/hub stack down first — the storm
overlay reuses the same subnet and container names. Tear down with
`python storm/orchestrate.py --down`. Edit `storm/scenario.yml` to set pool
size, RF-profile mix, arrival pattern, and `layer_b.total_ues` (0 disables
Layer B; UERANSIM's image only needs building once `--build` is passed
after enabling it).

## Current status and known limitations

- **4G twin**: real, working, single- and 3-pair configurations both
  verified live. The offline PER-encoding side-by-side display
  (`encode_templates.py`) has never been wired to inject real bytes into a
  live UE — see the `realizer/` M5 milestone below for what that would take.
- **5G SA twin**: Layer A (real PHY) verified up to a small pool; Layer B
  (UERANSIM) is the scale path for core-signaling load specifically because
  Layer A's lockstep ceiling makes it unsuitable for "hundreds of UEs" on
  its own.
- **No CU/DU split is deployed today.** `ocudu`'s `gnb` binary runs CU-CP +
  CU-UP + DU as one process with in-process F1/E1 connectors. The source
  supports running them as separate processes over real sockets; this
  twin doesn't do that yet. This is the actual blocker for "plug into a
  real external DU" — see the storm chapter's framing of why PHY-abstract
  UEs structurally cannot reach a real DU (a DU has no notion of RRC/NAS).

## Roadmap: `realizer/` — N logical UEs in one `srsue` process (4G, paused)

A reviewed architecture plan (`integration/realizer/PLAN.md`) to remove the
4G twin's per-pair process/container overhead by hosting N UE contexts
inside one `srsue` process, sharing one PHY worker, instead of N independent
processes each with their own ZMQ lockstep. Chosen over the alternative
(N independent processes summed at a ZMQ hub, mirroring the 5G twin's
Layer A) specifically because LTE uplink is SC-FDMA — each UE gets disjoint
PRBs, so frequency-domain superposition of N UEs' transmissions is *exact*,
not an approximation, which the existing 5G hub's IQ-summation approach
isn't quite (it works, but the shared lockstep is the cost).

Status: **M0 complete, M1 not started, srsue's actual source untouched.**

| Milestone | Scope | Status |
|---|---|---|
| M0 | Interfaces (`interfaces.py`), per-UE subscriber generator (`gen_user_db.py`), N=1 regression baseline + diff tool (`capture_n1_baseline.py` / `check_n1_baseline.py`) | Done |
| M1 | 2 logical UEs over 1 shared PHY worker; dispatch + grid-placement code; full attach→bearer→detach against unmodified srsenb/srsepc; N=1 baseline diff must stay clean | Not started |
| M2 | Parameterize to N=8; collect PDCCH miss rate, per-TTI worker time, HARQ memory | Not started |
| M3 | Unit-test grant routing correctness; verify only modeled PRACH collisions occur, not dispatch bugs | Not started |
| M4 | Load harness: per-UE attach success/timing distributions, extending the dashboard's `parse_4g.py` KPI logic | Not started |
| M5 | Live pycrate byte-injection — populate real UEs' transmitted bytes from real trace records at runtime (the missing other half of trace-identity injection, today offline-only) | Deferred until M1-M4 are solid |

Each milestone in `PLAN.md` is paired with a specific risk (grant
misrouting, RA timer collision, PDCCH blind-search budget degrading
silently, the per-TTI real-time deadline, HARQ buffer scaling, USIM
credential collisions) and a concrete mitigation — see
[`design_principles.md`](design_principles.md) §7.

## Roadmap: signaling storm

- Push Layer B (UERANSIM) scale further and correlate its arrival timing
  more tightly with Layer A's, to study mixed real-PHY/abstract surges more
  precisely.
- If a real external DU becomes a target, the prerequisite is splitting
  `ocudu`'s `gnb` into separate CU and DU processes communicating over a
  real F1 socket (supported by the source, not configured here) — at that
  point Layer A's real-PHY pool would sit in front of a DU that's either
  still OCUDU's own or an actual third-party DU, with the rest of the
  pipeline unchanged.
- `*_heavy` RF profiles (CFO + downlink AWGN) are currently only viable on
  very small pools (2-3 UEs) before the per-sample cost craters lockstep
  throughput — worth revisiting if/when the underlying channel math gets
  optimized.
