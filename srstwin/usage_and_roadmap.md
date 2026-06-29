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

If a newly added pair's <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> fails to attach, check `srsepc`'s log first —
`srsepc` loads `subscribers.csv` once at startup, so a subscriber added
after it's already running needs `--force-recreate srsepc` to be picked up.
**Never recreate a <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> alone against an already-running <span class="glossary-term" data-glossary-id="enb" data-glossary-term="eNB" data-glossary-definition="Evolved Node B — the 4G LTE base station connecting UEs to the EPC over S1AP." tabindex="0" role="button">eNB</span>** — that produces
a <span class="glossary-term" data-glossary-id="rach" data-glossary-term="RACH" data-glossary-definition="Random Access Channel — procedure for a UE to request initial access to a cell (preamble, response, connection setup)." tabindex="0" role="button">RACH</span> retry storm that doesn't settle; always recreate an <span class="glossary-term" data-glossary-id="enb" data-glossary-term="eNB" data-glossary-definition="Evolved Node B — the 4G LTE base station connecting UEs to the EPC over S1AP." tabindex="0" role="button">eNB</span>+<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> pair
together.

Dashboard: `python integration/dashboard/serve_dashboard.py --pull`, then
open `http://localhost:8765`. The 4G LTE tab shows a live signaling ladder,
per-message decode/explanation, attach/session KPIs, and (bottom-left) a
multi-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> KPI histogram. For a fuller-looking histogram, run
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
  verified live. The offline <span class="glossary-term" data-glossary-id="per-encoding" data-glossary-term="PER encoding" data-glossary-definition="Packed Encoding Rules — compact binary encoding of ASN.1 structures for RRC/NAS Layer-3 messages. Decoupling from PHY does not mean skipping PER encoding." tabindex="0" role="button">PER</span>-encoding side-by-side display
  (`encode_templates.py`) has never been wired to inject real bytes into a
  live <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> — see the `realizer/` M5 milestone below for what that would take.
- **5G SA twin**: Layer A (real <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>) verified up to a small pool; Layer B
  (UERANSIM) is the scale path for core-signaling load specifically because
  Layer A's lockstep ceiling makes it unsuitable for "hundreds of UEs" on
  its own.
- **No <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>/<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> split is deployed today.** `ocudu`'s `gnb` binary runs <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>-CP +
  <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>-UP + <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> as one process with in-process F1/E1 connectors. The source
  supports running them as separate processes over real sockets; this
  twin doesn't do that yet. This is the actual blocker for "plug into a
  real external <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>" — see the storm chapter's framing of why <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>-abstract
  UEs structurally cannot reach a real <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> (a <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> has no notion of <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span>).

## Roadmap: `realizer/` — N logical UEs in one `srsue` process (4G, paused)

A reviewed architecture plan (`integration/realizer/PLAN.md`) to remove the
4G twin's per-pair process/container overhead by hosting N <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> contexts
inside one `srsue` process, sharing one <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> worker, instead of N independent
processes each with their own ZMQ lockstep. Chosen over the alternative
(N independent processes summed at a ZMQ hub, mirroring the 5G twin's
Layer A) specifically because LTE <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">uplink</span> is SC-FDMA — each <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> gets disjoint
<span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRBs</span>, so frequency-domain superposition of N UEs' transmissions is *exact*,
not an approximation, which the existing 5G hub's IQ-summation approach
isn't quite (it works, but the shared lockstep is the cost).

Status: **M0 complete, M1 not started, srsue's actual source untouched.**

| Milestone | Scope | Status |
|---|---|---|
| M0 | Interfaces (`interfaces.py`), per-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> subscriber generator (`gen_user_db.py`), N=1 regression baseline + diff tool (`capture_n1_baseline.py` / `check_n1_baseline.py`) | Done |
| M1 | 2 logical UEs over 1 shared <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> worker; dispatch + grid-placement code; full attach→bearer→detach against unmodified srsenb/<span class="glossary-term" data-glossary-id="srsepc" data-glossary-term="srsEPC" data-glossary-definition="srsRAN's simplified 4G core containing MME, SGW, PGW, and HSS. Authenticates srsUE and assigns an IP address." tabindex="0" role="button">srsepc</span>; N=1 baseline diff must stay clean | Not started |
| M2 | Parameterize to N=8; collect PDCCH miss rate, per-TTI worker time, HARQ memory | Not started |
| M3 | Unit-test grant routing correctness; verify only modeled PRACH collisions occur, not dispatch bugs | Not started |
| M4 | Load harness: per-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> attach success/timing distributions, extending the dashboard's `parse_4g.py` KPI logic | Not started |
| M5 | Live <span class="glossary-term" data-glossary-id="pycrate" data-glossary-term="Pycrate" data-glossary-definition="Python ASN.1 toolkit used to load UL-DCCH-Message definitions and validate that reconstructed messages match the expected ASN.1 structure and fields." tabindex="0" role="button">pycrate</span> byte-injection — populate real UEs' transmitted bytes from real trace records at runtime (the missing other half of trace-identity injection, today offline-only) | Deferred until M1-M4 are solid |

Each milestone in `PLAN.md` is paired with a specific risk (grant
misrouting, RA timer collision, PDCCH blind-search budget degrading
silently, the per-TTI real-time deadline, HARQ buffer scaling, USIM
credential collisions) and a concrete mitigation — see
[`design_principles.md`](design_principles.md) §7.

## Roadmap: signaling storm

- Push Layer B (UERANSIM) scale further and correlate its arrival timing
  more tightly with Layer A's, to study mixed real-<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>/abstract surges more
  precisely.
- If a real external <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> becomes a target, the prerequisite is splitting
  `ocudu`'s `gnb` into separate <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span> and <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> processes communicating over a
  real F1 socket (supported by the source, not configured here) — at that
  point Layer A's real-<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> pool would sit in front of a <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> that's either
  still OCUDU's own or an actual third-party <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>, with the rest of the
  pipeline unchanged.
- `*_heavy` RF profiles (CFO + <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">downlink</span> AWGN) are currently only viable on
  very small pools (2-3 UEs) before the per-sample cost craters lockstep
  throughput — worth revisiting if/when the underlying channel math gets
  optimized.
