# The 4G LTE Digital Twin

## Stack and topology

The 4G twin runs srsRAN_4G (v25.10.0) as three containers per <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> pair:

```
srsue4g  <--ZMQ IQ-->  srsenb  <--SCTP/S1AP-->  srsepc
 (UE)                   (eNB)                   (EPC: MME + HSS + S/P-GW)
```

The radio link is real software, emulated: `srsue` and `srsenb` exchange
ZeroMQ REQ/REP messages carrying <span class="glossary-term" data-glossary-id="iq-samples" data-glossary-term="IQ samples" data-glossary-definition="Complex-valued in-phase and quadrature samples representing a modulated radio waveform digitally." tabindex="0" role="button">IQ samples</span> instead of driving an <span class="glossary-term" data-glossary-id="sdr" data-glossary-term="SDR" data-glossary-definition="Software-defined radio — programmable radio hardware controlled by software, used to transmit/receive real RF signals instead of ZMQ simulation." tabindex="0" role="button">SDR</span>, so
every PRACH preamble, <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> message, and <span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span> exchange that crosses that link
is the same byte-correct <span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span> <span class="glossary-term" data-glossary-id="per-encoding" data-glossary-term="PER encoding" data-glossary-definition="Packed Encoding Rules — compact binary encoding of ASN.1 structures for RRC/NAS Layer-3 messages. Decoupling from PHY does not mean skipping PER encoding." tabindex="0" role="button">PER</span>/UPER encoding a real phone and base
station would produce. This is the core fidelity claim of the whole twin:
nothing about the signaling is simplified.

The default deployment is **one pair** (`srsue4g`/`srsenb`/`srsepc`). A
`docker-compose.3ue.yml` overlay adds two more independent pairs
(`srsenb2`/`srsue4g2`, `srsenb3`/`srsue4g3`), all sharing the **same** <span class="glossary-term" data-glossary-id="epc" data-glossary-term="EPC" data-glossary-definition="Evolved Packet Core — the 4G core network (MME, SGW, PGW, HSS) handling mobility, authentication, and sessions." tabindex="0" role="button">EPC</span> —
see [`design_principles.md`](design_principles.md) for why pairs share one
EPC and never share a radio link. There is no cross-UE <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> sharing in this
twin (see "Why not just add more UEs" below); three pairs means three
independent ZMQ lockstep links, each as fast as a single UE alone.

## Trace identity injection

The twin's distinguishing feature is that a live simulated UE can carry a
**real captured subscriber's identity**. `rrc_trace_fields.py` extracts the
`m_tmsi` and `establishmentCause` fields from a real decoded TELUS call
record (`22_decoded/`), and
`rrc_trace/rrc_injector_entrypoint.sh` exports them as environment variables
(`RRC_TRACE_LTE_M_TMSI`, `RRC_TRACE_LTE_CAUSE`) before `srsue` starts.
`srsue/src/stack/rrc/rrc.cc`'s RRC Connection Request builder reads them via
plain `std::getenv()` and uses them instead of its own synthetic defaults.
The result: the live attach's first RRC message carries a real subscriber's
identity fields, so the signaling that follows is directly comparable to
what that real subscriber's phone produced.

A second, **offline-only** path does the reverse direction — re-encoding a
real captured record into PER/UPER bytes for side-by-side display
(`rrc_trace/encode_templates.py`, <span class="glossary-term" data-glossary-id="pycrate" data-glossary-term="Pycrate" data-glossary-definition="Python ASN.1 toolkit used to load UL-DCCH-Message definitions and validate that reconstructed messages match the expected ASN.1 structure and fields." tabindex="0" role="button">pycrate</span>-based). This is dashboard
decoration only: it has never been wired to feed live bytes into `srsue`.
The forward path for that (a byte-level injector that would let a live UE
*transmit* arbitrary real-trace-derived PER encodings rather than just
borrowing two fields) is exactly what the paused `realizer/` plan's M5
milestone is for — see [`usage_and_roadmap.md`](usage_and_roadmap.md).

## Why not just add more UEs onto one <span class="glossary-term" data-glossary-id="enb" data-glossary-term="eNB" data-glossary-definition="Evolved Node B — the 4G LTE base station connecting UEs to the EPC over S1AP." tabindex="0" role="button">eNB</span>

`srsue`/`srsenb` exchange IQ over ZeroMQ in **lockstep**: one request/reply
round trip per radio subframe, shared by every UE on the <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>. This isn't a
CPU limit — it's a serialization point. Adding UEs to one shared link adds
more round trips per subframe, so the cell's effective clock slows down
roughly linearly with UE count. This was measured directly (see below) and
is the same structural limit the 5G twin's storm framework hit and designed
around (its own Layer A pool is capped "RF-correct... but above ~4 UEs the
clock crawls," per `storm/README.md`).

The 4G twin's answer, for now, is the opposite of approximating the
limit: **don't share a link**. Each of the 3 pairs gets its own independent
eNB + UE + ZMQ link, so 3 pairs running concurrently are still each
individually as fast as 1 pair alone — what changes is that they now
compete for the *same host's* CPU, which is a different, also-real and
also-worth-measuring kind of contention. The paused `realizer/` plan
(see `usage_and_roadmap.md`) is the alternative being designed for: one
`srsue` process hosting N logical UE contexts over one shared PHY worker,
which would remove the per-pair container/process overhead entirely — but
that is **not** what's running today.

## Measuring real contention: the 3-UE demo

`integration/demo3ue/` force-recreates each pair's eNB+UE together (recreating
a UE alone against an already-running eNB causes a <span class="glossary-term" data-glossary-id="rach" data-glossary-term="RACH" data-glossary-definition="Random Access Channel — procedure for a UE to request initial access to a cell (preamble, response, connection setup)." tabindex="0" role="button">RACH</span> retry storm that
never settles — confirmed empirically) and runs repeated attach/release
cycles, comparing one pair running alone against all three running
concurrently. Two KPIs are tracked:

- **<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> processing delay** — PRACH preamble (Msg1) to Random Access Response
  (Msg2) turnaround. This is eNB-side only, no EPC round trip — the standard
  RACH response-time KPI (4G's eNB plays the DU's PHY/MAC role; there's no
  separate DU process to isolate).
- **Call/session duration** — NAS Attach Complete to eNB-initiated release
  (the eNB's inactivity timer, default 30s).

Measured result (`demo3ue/RESULTS.md`, n=5 cycles per scenario, same
hardware, only concurrency changed):

| | 1 pair alone | 3 pairs concurrent | |
|---|---|---|---|
| DU processing delay | 28.40 ms | 30.86 ms | **+8.7%** |
| Call duration | 35.41 s | 38.45 s | **+8.6%** |

That's host-CPU contention between three independent stacks, not protocol
contention (each pair has its own radio link) — but it's a real, measured
cost of "more UEs" in this architecture, which is exactly the number the
paused `realizer/` plan exists to make unnecessary at larger N.

## The live dashboard

`integration/dashboard/serve_dashboard.py` (port 8765) parses live container
logs into a call-flow ladder, per-message explanations, KPIs, and a live
multi-UE KPI histogram. A few points worth knowing if you're extending it:

- **`parse_4g.py`** turns raw `srsenb`/`srsue` log lines into ordered events.
  Two non-obvious pieces: an `_ATTACH_FLOW` phase-rank table sorts events by
  *protocol logic* (cell acquisition → random access → setup → NAS auth →
  bearer setup → attach complete → release) rather than raw timestamp,
  because NAS Attach Request is logged by `srsue` at decision-time, before
  it's actually sent inside a later RRC message — `_CARRIED_IN` substitutes
  the carrier message's timestamp so the ladder doesn't show it arriving
  "before" its own logical predecessor. `compute_attach_kpis()` separates
  attach-phase events from release-phase events specifically so a long idle
  hold time before release isn't miscounted as attach time.
- **Live polling is debounced, not per-request.** Each browser poll
  (`/api/data`, every 5s) calls `pull_logs_4g()` (six `docker exec ... tail`
  calls, one per container, run in parallel) then a full re-parse. Two
  failure modes were found and fixed the hard way: (1) srsue's PHY layer
  logs every subframe, so an unbounded `docker cp` of the whole log file
  eventually means parsing millions of lines per poll — fixed by tailing a
  bounded window instead of copying the whole file; (2) with several browser
  tabs polling independently, every poll used to trigger its own rebuild,
  and once a rebuild took longer than the 5s poll interval the backlog grew
  without bound. The fix: `payload()` never blocks a poller on a rebuild it
  didn't start — every request gets the last known-good snapshot instantly
  unless it's the one thread doing the (now bounded) rebuild. See
  [`design_principles.md`](design_principles.md) for the general lesson.
- **Container status is independent of log content.** `container_status_4g()`
  asks Docker directly (`docker inspect`) rather than inferring "running"
  from log activity, specifically so stopping/starting a pair shows up
  immediately even though srsRAN's own file logger can lag real activity by
  a noticeable amount.
