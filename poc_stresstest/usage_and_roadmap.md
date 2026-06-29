# poc_StressTest — Usage and Roadmap

## Running the stack

The project is Python 3.12+ with no build step and no linter configuration; it
runs via Docker Compose (Windows PowerShell is the documented host shell). From
the project root, with Docker Desktop running:

```powershell
docker compose up -d --build
docker compose ps                 # expect du, ru, ru2, ru3, ue-sim, dashboard = Up
```

Dashboard: `http://localhost:9090`. <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> JSON status: `http://localhost:9080/status`
(host port 9080 maps to the container's 8080 — 8080 itself is in Windows' excluded
port range, so it is not used directly). Tear down with `docker compose down`.

Watch what's happening from the logs:

```powershell
docker compose logs -f du         # PRB utilization bars per cell
docker compose logs -f ue-sim     # attach/handover/reject/drop stats
```

### Synthetic mode (default)

With no extra configuration, UEs run on random 2-D-walk mobility
(`ue/ue_sim.py`'s `Walk` class) and synthetic attach/measurement/release timers
(`REPORT_INTERVAL`, `DATA_INTERVAL`, `SESSION_DURATION`, `IDLE_BETWEEN`). This
needs no `22_decoded/` trace data at all — the signalling catalog's built-in
`DEFAULT_TEMPLATES` (in `common/signaling/lte.py`) cover every message type the
flow ever sends.

### Trace-replay mode

Trace replay drives <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> attach/measurement/release timing from real decoded call
traces instead of synthetic timers, while still sending the same realistic LTE
signalling messages (`common/call_trace.py`, `common/trace_replay.py`). It needs
a prebuilt index, built once on the host (decoded trace JSON goes under
`22_decoded/`, gitignored for size):

```powershell
$env:PYTHONPATH = (Get-Location).Path
python scripts/build_trace_index.py --trace-dir 22_decoded --out data/trace_index.jsonl
```

Then run with the trace overlay, which only flips `REPLAY_MODE=1` on top of the
base compose file:

```powershell
docker compose -f docker-compose.yml -f docker-compose.trace.yml up -d --build
```

At startup, `ue_sim.py`'s `run_replay()` picks UEs from the index (preferring ones
with a full attach→release arc, via `select_ues()` in `trace_replay.py`), replays
their events at trace-relative times scaled by `REPLAY_SPEED` (default 10x), then
the stack continues in ordinary synthetic mode at `NUM_UES` tasks. The base
`docker-compose.yml` pins `REPLAY_MODE=0` specifically so a stray
`$env:REPLAY_MODE=1` left in a PowerShell session can't silently hijack a
synthetic run.

Optionally, build real message templates the same way (from the same trace
files) so the wire messages match real captured envelopes/bodies rather than the
catalog's built-in defaults:

```powershell
python scripts/build_message_templates.py --trace-dir 22_decoded --out data/lte_templates.json
```

A missing `data/lte_templates.json` is not an error — `LteCatalog` simply falls
back to `DEFAULT_TEMPLATES`.

### Scaling UE count

UEs are asyncio tasks in the `ue-sim` container, not containers themselves, so
scaling means raising `NUM_UES`, not spinning up more containers:

```powershell
$env:NUM_UES = "500"; docker compose up -d --build
.\scripts\run_stress.ps1 -NumUes 500 -Detach    # helper wrapper, defaults to 2000
```

`ue_sim.py` also exposes runtime scaling without a restart: `POST /control
{"num_ues": N}` (what the dashboard's UE-count slider calls), capped at `MAX_UES`
(default 5000), reconciled in batches of `UE_SPAWN_BATCH` (default 25) spaced by
`UE_SPAWN_INTERVAL` so the RUs don't see a connection storm. The chosen target is
persisted to `UE_TARGET_STATE` (`/trace/data/ue_target.json` in the container) so
it survives a container restart. For running more simulator processes across CPU
cores rather than more tasks in one process: `docker compose up --scale ue-sim=4`.

### Traffic profile switching

`TRAFFIC_PROFILE` (env var on both `du` and `ue-sim`) selects how <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRBs</span> are sized
in `common/rf_model.py`'s `prbs_for_traffic()`:

- `voip` (default) — fixed 1–2 PRBs per session, independent of `demand_mbps`
  (`prbs_for_voip()`); good RF gets 1 PRB, marginal RF (`sinr_dl_db < 5.0`) gets 2,
  capped at `VOIP_MAX_PRBS`.
- `data` — <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRBs</span> sized from `demand_mbps` via `prbs_for_demand()`, uncapped, for
  pure capacity stress.

Switching to broadband load requires setting `TRAFFIC_PROFILE=data` and matching
`DEMAND_MIN_MBPS`/`DEMAND_MAX_MBPS` on **both** `du` and `ue-sim` — the DU uses
them to size the grant logic context and the UE uses them to generate its own
demand value, so they must agree.

### Running without Docker

`./scripts/run_local.sh [num_ues]` (Linux/macOS/Git Bash) starts one DU, **one**
<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> at the origin, and the <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> simulator directly with `python3`, setting
`PYTHONPATH` and raising the file-descriptor `ulimit`. This path does not stand up
the 3-RU cluster or the dashboard — it is a single-RU smoke-test path, not an
alternative to Compose for cluster-scale runs.

## Known limitations and next steps

These are grounded in specific stubs, constants, or comments found in the code —
not aspirational roadmap items.

- **No 5G NR signalling, despite the project's "5G <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> Digital Twin" name.**
  `common/signaling/nr.py`'s `NrCatalog.__init__` unconditionally raises
  `NotImplementedError("5G NR signalling catalog is not implemented yet. Set
  RADIO_TECH=lte (default) to use the 4G LTE flow.")`. The only implemented
  catalog is `LteCatalog` (<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> + <span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span>, <span class="glossary-term" data-glossary-id="enb" data-glossary-term="eNB" data-glossary-definition="Evolved Node B — the 4G LTE base station connecting UEs to the EPC over S1AP." tabindex="0" role="button">eNB</span>/<span class="glossary-term" data-glossary-id="mme" data-glossary-term="MME" data-glossary-definition="Mobility Management Entity — 4G core control node handling attach, authentication, and bearer setup with the eNB over S1AP." tabindex="0" role="button">MME</span>/S1 naming). `RADIO_TECH=nr` is a
  reserved selector with no working implementation; everything that runs today —
  the message names, the `procedures.py` flow, the templates — is LTE, not NR.
  The nr.py docstring notes the intended NR flow (NR-RRC over Uu, <span class="glossary-term" data-glossary-id="ngap" data-glossary-term="NGAP" data-glossary-definition="NG Application Protocol — control-plane protocol between gNB and 5G core AMF." tabindex="0" role="button">NGAP</span> toward the
  <span class="glossary-term" data-glossary-id="amf" data-glossary-term="AMF" data-glossary-definition="Access and Mobility Management Function — 5G core node handling registration and mobility over NGAP." tabindex="0" role="button">AMF</span>: RRC Setup, Registration Request, Authentication, Security Mode, UE
  Capability, Initial Context Setup, <span class="glossary-term" data-glossary-id="pdu-session" data-glossary-term="PDU Session" data-glossary-definition="5G user data session between UE and data network, established via 5GSM procedures." tabindex="0" role="button">PDU Session</span> Setup) follows the same
  `Step`-based structure and is meant to plug in once decoded NR/NGAP traces are
  available, but no such traces or catalog exist in this repository yet.
- **Single-layer RF model, no MIMO.** `common/rf_model.py`'s module docstring
  states this explicitly: "It is intentionally a single-layer (no MIMO) model."
  `MAX_SE = 7.4063` bits/s/Hz is described as "the practical single-layer
  ceiling" for 256-QAM. There is no spatial-multiplexing or layer-count concept
  anywhere in the capacity chain — a UE's throughput ceiling does not depend on
  its number of antennas or reported MIMO capability, even though real capture
  samples in `data/trace_message_samples.json` include UE capability records
  reporting `supportedMIMO-CapabilityDL-r10: fourLayers`. That capability is
  carried in the realistic envelope (sourced from real traces) but has no effect
  on the simulated capacity math.
- **VoIP PRB sizing is a fixed heuristic, not derived from the codec bitrate.**
  `prbs_for_voip()`'s docstring is explicit that the 1–2 PRB grant is "not derived
  from demand_mbps" — it is a hardcoded `VOIP_MIN_PRBS = 1` / `VOIP_MAX_PRBS = 2`
  choice keyed only on whether SINR is above or below a fixed 5.0 dB threshold.
  Real per-slot voice scheduling varies more continuously with codec mode and link
  quality than this two-bucket model.
- **`docker-compose.yml`'s `TOTAL_PRBS=250` overrides a different in-code default
  (`273`) in `du_server.py`.** Both values are plausible (273 matches LTE's 20 MHz
  carrier; 250 is the value the RU side and the README/CLAUDE.md cluster
  description assume), but the two should arguably be reconciled or the
  discrepancy documented in-code, since running the <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> outside Compose with no
  environment override silently changes per-<span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span> capacity.
- **No automated test execution path documented for CI; tests exist but are
  run manually.** `tests/` has real pytest coverage (`test_signaling_flow.py`,
  `test_templates.py`, `test_integration.py`, `test_fidelity.py`,
  `test_sector_rf.py`, `test_topology.py`, `test_ru_dictionary.py`,
  `test_dispatcher.py`), runnable via `python -m pytest tests/`, but CLAUDE.md
  states plainly that the repository has "no build step, no linter config, and no
  test suite" wired into any automated pipeline — running the tests is a manual,
  host-side step.
- **`run_local.sh` only ever starts a single RU**, so the non-Docker path cannot
  exercise inter-site handover (only the in-Docker 3-site cluster can); anyone
  testing handover behavior locally without containers would need to hand-extend
  that script.
- **The dashboard's single-UE call-flow ladder tracks exactly one <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> at a time**
  by design (`DU.trace_ue`/`trace_events` in `du_server.py` is a single slot, not
  a per-UE map), reset via `GET /trace/reset`. This is adequate for inspecting one
  representative call flow but cannot show concurrent multi-UE message
  interleaving on the ladder view.
