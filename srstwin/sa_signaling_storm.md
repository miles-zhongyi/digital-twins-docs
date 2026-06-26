# The 5G SA Twin and the Signaling Storm Framework

## Stack

The 5G side runs a real standalone 5G core (**Open5GS**) and a real gNB
(**srsRAN-Project**, referred to in this repo as "OCUDU" — confirmed via
`integration/Dockerfile.gnb`, which builds srsRAN-Project's `gnb` target).
`ocudu/` is a full srsRAN-Project source clone. The `gnb` binary as built and
run here is **one monolithic process** combining CU-CP, CU-UP, and DU — the
F1 (CU↔DU) and E1 (CU-CP↔CU-UP) interfaces exist in the source (srsRAN-Project
supports running them as separate processes over real sockets) but today
they're wired as in-process local connectors, not exposed externally. This
matters directly for "plugging into a real DU" later: a real DU only speaks
PHY/MAC/RLC + F1AP, so doing that for real means first splitting this
monolithic `gnb` into separate CU and DU processes talking F1 over a real
socket — structurally supported by the codebase, not yet done in this twin.

Day-to-day, the testbed runs in one of two modes (`integration/README.md`):
**direct** (one UE, no hub, `ue_zmq.direct.conf` ↔ `gnb_zmq.direct.yml`) or
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
existing ZMQ IQ hub with a real per-UE RF channel model — this is where
genuine PHY-level effects (PRACH collisions resolved by near-far capture)
happen. It hits the same lockstep wall as the 4G twin: all N UEs and the gNB
share one ZMQ lockstep, so the cell's virtual clock slows roughly linearly
with N, not CPU-with-N. Above ~4 UEs attach latency balloons. The expensive
per-sample channel operations (carrier-frequency-offset and downlink AWGN)
are **off by default** for exactly this reason — enabling them measurably
cratered throughput (observed ~20× slowdown on an 8-UE pool); they're only
re-enabled via separate `*_heavy` RF profiles, and only recommended for
pools of 2-3.

**Layer B** is [UERANSIM](https://github.com/aligungr/UERANSIM), a
third-party NAS/RRC-over-NGAP UE+gNB simulator with **no PHY at all** — it
talks straight to the AMF over its own SCTP association, so hundreds of UEs
cost almost nothing. The AMF therefore sees **two distinct gNB endpoints**
for one storm: OCUDU (Layer A, real F1/PHY underneath) and UERANSIM's `nr-gnb`
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
*spread* in uplink gain (1.0 near → 0.55 mid → 0.30 edge) is what actually
drives the PRACH near-far capture effect at the hub — not anything in the
gNB or UE. `ideal` is the identity profile and matches the originally
verified 1-UE/2-UE baseline exactly, by design (see `design_principles.md`).

### Measuring it (`storm/metrics.py`)

Reads `events.csv` (Layer A's per-arrival outcomes: scheduled time, launch
time, attach latency as measured by `srsue`'s own attach timer, result,
failure reason) and the live gNB log (regex-counted RACH/PRACH events, RRC
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
  on a downlink timeout, only on sustained uplink failure — because
  abandoning a request mid-flight would desync that UE's own RF thread and
  freeze the whole cell, not just that UE.

## Relationship to the 4G twin's `realizer/` plan

The 4G twin has its own paused plan (`integration/realizer/`, see
[`lte_digital_twin.md`](lte_digital_twin.md) and
[`usage_and_roadmap.md`](usage_and_roadmap.md)) to solve the *same*
lockstep-scaling problem by hosting N logical UE contexts inside **one**
`srsue` process over one shared PHY worker, instead of N independent
processes. It is conceptually the mirror image of this storm framework's
two-layer split: rather than separating "small real-PHY pool" from "large
PHY-abstract pool" as two different layers, it asks whether the real-PHY
pool itself can be made to scale further before resorting to abstraction at
all. The two efforts are independent (4G vs. 5G stacks, different code), but
the same underlying constraint — one shared ZMQ lockstep clock — motivates
both.
