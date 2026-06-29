# The 5G SA Twin and the Signaling Storm Framework

## Stack

The 5G side runs a real standalone 5G core (**Open5GS**) and a real gNB
(**srsRAN-Project**, referred to in this repo as "OCUDU" — confirmed via
`integration/Dockerfile.gnb`, which builds srsRAN-Project's `gnb` target).
`ocudu/` is a full srsRAN-Project source clone. The `gnb` binary as built and
run here is **one monolithic process** combining <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>-CP, CU-UP, and <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> — the
F1 (CU↔DU) and E1 (<span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>-CP↔CU-UP) interfaces exist in the source (srsRAN-Project
supports running them as separate processes over real sockets) but today
they're wired as in-process local connectors, not exposed externally. This
matters directly for "plugging into a real DU" later: a real <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> only speaks
<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>/MAC/RLC + F1AP, so doing that for real means first splitting this
monolithic `gnb` into separate CU and DU processes talking F1 over a real
socket — structurally supported by the codebase, not yet done in this twin.

Day-to-day, the testbed runs in one of two modes (`integration/README.md`):
**direct** (one <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span>, no hub, `ue_zmq.direct.conf` ↔ `gnb_zmq.direct.yml`) or
**hub** (N UEs through the IQ-relay hub described below).

## The signaling storm: two layers, one core

`integration/storm/` simulates a UE-count *surge* against that one Open5GS
core, deliberately split into two layers that trade fidelity for scale in
opposite directions:

```
 Layer A  RF-real, CPU-bounded   srsUE pool --IQ--> IQ hub --IQ--> OCUDU gNB --+
   real PRACH collisions,              (per-UE channel model)                 | N2/N3
   near-far capture, real RRC/NAS                                             +--> Open5GS
 Layer B  PHY-abstract, scale    UERANSIM gNB + N UEs ------NGAP/NAS----------+   (one SIM DB)
   hundreds of cheap NAS regs               (separate SCTP assoc. to the AMF)
```

**Layer A** is a small (2-8) pool of real `srsUE` containers, sharing the
existing <span class="glossary-term" data-glossary-id="zmq-iq" data-glossary-term="ZMQ IQ" data-glossary-definition="Simulated radio link over network sockets where radio signals are represented as IQ samples with in-phase (I) and quadrature (Q) components." tabindex="0" role="button">ZMQ IQ</span> hub with a real per-UE RF channel model — this is where
genuine PHY-level effects (PRACH collisions resolved by near-far capture)
happen. It hits the same lockstep wall as the 4G twin: all N UEs and the gNB
share one ZMQ lockstep, so the <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>'s virtual clock slows roughly linearly
with N, not CPU-with-N. Above ~4 UEs attach latency balloons. The expensive
per-sample channel operations (carrier-frequency-offset and <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">downlink</span> AWGN)
are **off by default** for exactly this reason — enabling them measurably
cratered throughput (observed ~20× slowdown on an 8-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> pool); they're only
re-enabled via separate `*_heavy` RF profiles, and only recommended for
pools of 2-3.

**Layer B** is [UERANSIM](https://github.com/aligungr/UERANSIM), a
third-party <span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span>/<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>-over-<span class="glossary-term" data-glossary-id="ngap" data-glossary-term="NGAP" data-glossary-definition="NG Application Protocol — control-plane protocol between gNB and 5G core AMF." tabindex="0" role="button">NGAP</span> UE+gNB simulator with **no PHY at all** — it
talks straight to the <span class="glossary-term" data-glossary-id="amf" data-glossary-term="AMF" data-glossary-definition="Access and Mobility Management Function — 5G core node handling registration and mobility over NGAP." tabindex="0" role="button">AMF</span> over its own <span class="glossary-term" data-glossary-id="sctp" data-glossary-term="SCTP" data-glossary-definition="Stream Control Transmission Protocol — reliable transport used by S1AP, NGAP, and other telecom control protocols." tabindex="0" role="button">SCTP</span> association, so hundreds of UEs
cost almost nothing. The AMF therefore sees **two distinct gNB endpoints**
for one storm: OCUDU (Layer A, real F1/<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> underneath) and UERANSIM's `nr-gnb`
(Layer B), both provisioning subscribers from the same
`subscribers.storm.csv`. This is the scale knob for pure core-network
control-plane load, deliberately decoupled from anything PHY.

A storm is described by one `scenario.yml` (pool size, RF-profile mix,
arrival pattern, behavior), rendered into compose/config artifacts by
`generate.py`, played by `orchestrate.py`, and measured by `metrics.py`.

## Arrivals vs. slots, and how a storm actually plays

`total_arrivals` (how many UEs *show up* over the storm's duration) is
decoupled from `pool_size` (how many run *at once*). `orchestrate.py`'s
`Orchestrator` keeps an `asyncio.Queue` of free slots; `patterns.build_timeline()`
generates `(time, ue_id)` arrival events up front (deterministic given the
seed), and one `asyncio.Task` per arrival waits until its scheduled time,
then **blocks on slot availability** if the pool is already full — which is
exactly the admission/queueing behavior of an overloaded cell, and the wait
itself (`launch time − scheduled time`) is recorded as the queueing delay in
`events.csv`. Layer B arrivals reuse the *same pattern shape* but with
`seed + 1`, so Layer A and Layer B surges are correlated in shape but not
identical in exact timing — modeling that a real flash-crowd doesn't hit
every access technology at the exact same instant.

### Arrival patterns (`storm/patterns.py`)

All non-uniform patterns share one mechanism: build an intensity function
λ(t) on a fixed grid, normalize it into a CDF, and invert it to map uniform
random quantiles to arrival times — a standard inverse-CDF sampler, reused
across every pattern type.

| type | shape | models |
|---|---|---|
| `burst` | uniform over `[start_s, start_s+window_s]` | flash-crowd / paging flood |
| `outage_recovery` | λ(t) ∝ exp(−(t−start)/τ) | mass reconnect after power restored — spike then exponential decay |
| `poisson` | uniform over the whole duration | steady independent arrivals |
| `ramp` | linear λ(t) between `rate_start`/`rate_end` | gradually rising (or falling) busy-hour load |
| `periodic` | λ(t) = 1 + amplitude·sin(2πt/period + phase) | diurnal waves, periodic IoT check-ins |

### RF profiles (`storm/rf_profiles.py`)

Each Layer-A slot is assigned one profile (`near`/`mid`/`edge`/`ideal`,
mixed by fraction and allocated deterministically via largest-remainder so
the exact requested mix is hit). The profiles set uplink gain, downlink
SNR, fading type (Rician near/mid, Rayleigh at the edge), Doppler, CFO, and
propagation delay (in ZMQ samples — at the testbed's 11.52 Msps, one sample
≈ 26 m, so a 4-sample delay models roughly a 100 m cell-edge UE). The
*spread* in <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">uplink</span> gain (1.0 near → 0.55 mid → 0.30 edge) is what actually
drives the PRACH near-far capture effect at the hub — not anything in the
gNB or UE. `ideal` is the identity profile and matches the originally
verified 1-UE/2-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> baseline exactly, by design (see `design_principles.md`).

### Measuring it (`storm/metrics.py`)

Reads `events.csv` (Layer A's per-arrival outcomes: scheduled time, launch
time, attach latency as measured by `srsue`'s own attach timer, result,
failure reason) and the live gNB log (regex-counted <span class="glossary-term" data-glossary-id="rach" data-glossary-term="RACH" data-glossary-definition="Random Access Channel — procedure for a UE to request initial access to a cell (preamble, response, connection setup)." tabindex="0" role="button">RACH</span>/PRACH events, RRC
Setup Requests vs. Completions — their ratio is used as a contention proxy
— and NGAP registrations). Reports attach success rate, a latency
CDF (p50/p90/max) broken out **per RF profile** (so `edge` attaching worse
and later than `near` is directly visible), queueing/admission delay, and a
1-second-bucketed timeline of arrivals vs. attaches for plotting.

## The IQ hub (`integration/hub/`)

The hub is what makes Layer A's "real PRACH collisions" claim true: it
**sums** every connected UE's uplink IQ before handing it to the gNB, and
**broadcasts** the gNB's downlink IQ to every connected UE — so two UEs
RACHing in the same window genuinely collide on the gNB's antenna, and the
per-UE channel model's near-far gain spread makes that collision resolve by
capture the way it would over real air. Two mechanics worth knowing:

- **Identity bypass.** A channel with all-default parameters (gain 1.0, no
  fading, no CFO, zero delay) is detected as identity and simply never
  registered — so an all-`ideal` storm has zero per-sample processing
  overhead and is bit-identical to the original verified 1-UE/2-UE baseline.
  Realism costs CPU only where it's actually requested.
- **Dynamic join and slot recycle.** A UE slot starts disconnected and joins
  the lockstep the first time it shows up asking for a downlink block — so
  late arrivals don't have to be pre-known. A slot is freed only after
  several consecutive uplink round-trip misses (default: 8), not
  immediately on container exit, and a slow/stalled UE is **never** dropped
  on a <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">downlink</span> timeout, only on sustained uplink failure — because
  abandoning a request mid-flight would desync that UE's own RF thread and
  freeze the whole <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>, not just that <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span>.

## Relationship to the 4G twin's `realizer/` plan

The 4G twin has its own paused plan (`integration/realizer/`, see
[`lte_digital_twin.md`](lte_digital_twin.md) and
[`usage_and_roadmap.md`](usage_and_roadmap.md)) to solve the *same*
lockstep-scaling problem by hosting N logical UE contexts inside **one**
`srsue` process over one shared PHY worker, instead of N independent
processes. It is conceptually the mirror image of this storm framework's
two-layer split: rather than separating "small real-PHY pool" from "large
PHY-abstract pool" as two different layers, it asks whether the real-<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>
pool itself can be made to scale further before resorting to abstraction at
all. The two efforts are independent (4G vs. 5G stacks, different code), but
the same underlying constraint — one shared ZMQ lockstep clock — motivates
both.
