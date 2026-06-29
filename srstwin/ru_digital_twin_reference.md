# <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> Digital Twin & <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> Emulator — Reference

Architectural reference for the planned **RAN-side emulator** that presents
realistic UE behavior and a believable RU interface to an O-<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>/<span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>. This
complements the running twins documented in
[`sa_signaling_storm.md`](sa_signaling_storm.md) (5G core load) and
[`lte_digital_twin.md`](lte_digital_twin.md) (4G protocol fidelity).

> Source: teammate technical reference (June 2026), synthesized from the RU
> Digital Twin proposal and *"A Parallel UE/gNB Emulator for Large-Scale
> Validation of 5G Core Networks"* (Luong & Phung, RIVF 2025).

## What the system is

Despite the name "RU Digital Twin," the target is really **two components**:

```
Component 1 — UE/RAN behavior generator
  Realistic UE signaling, RF conditions, mobility, handovers at scale

Component 2 — RU interface emulator
  Speaks eCPRI/Open Fronthaul toward O-DU so the DU/CU believes a real RU is attached
```

**Near-term goal:** UE emulator + basic RU interface toward OSC O-CU/DU.
**Later:** vendor-specific behavior profiles once real DU access is available.

### Three driving scenarios

| Scenario | Purpose |
|---|---|
| **1 — Scale traffic** | Generate realistic UE mobility/RF toward DU/CU at cluster scale |
| **2 — Fake RU** | Let DU/CU teams validate config changes against an emulated RU |
| **3 — Trace replay** | Reproduce production issues from real network traces in the lab |

Data sources: RAN call/session traces, Opensignal crowd RF data, network event
logs, and demand models from social/event calendars.

### Why not only OSC O-CU/DU

OSC stacks are spec-perfect — which can **hide** production issues:

- Vendor-specific timing quirks and proprietary IE handling
- A DU/CU that passes against OSC may still fail against a Nokia or Ericsson RU
- Production failures often come from *deviations* from spec, not compliance with it

## Paper takeaways (Luong & Phung 2025)

Parallel UE/gNB emulator for 5G core stress testing. Each UE is an independent
FSM implementing <span class="glossary-term" data-glossary-id="5gmm" data-glossary-term="5GMM" data-glossary-definition="5G Mobility Management — UE state machine for registration, deregistration, and mobility in 5G SA." tabindex="0" role="button">5GMM</span>/<span class="glossary-term" data-glossary-id="5gsm" data-glossary-term="5GSM" data-glossary-definition="5G Session Management — UE state machine for PDU session establishment, modification, and release." tabindex="0" role="button">5GSM</span>; users declare a target state and the emulator
runs the compliant procedure sequence with correct <span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span> timers.

| Capability | This paper | UERANSIM | PacketRusher |
|---|---|---|---|
| Multi-UE scale (>1000) | Yes | No | No |
| Interactive control | Yes | No | No |
| Chaos/fuzz injection | Yes | No | No |
| Multi-UE handover | Yes | Single UE | Yes |

Scale demonstrated: Open5GS ~1,200 UEs (mobility), Free5GC ~3,000 UEs.
Vulnerabilities found include missing SUCI length checks (Open5GS DoS) and
<span class="glossary-term" data-glossary-id="amf" data-glossary-term="AMF" data-glossary-definition="Access and Mobility Management Function — 5G core node handling registration and mobility over NGAP." tabindex="0" role="button">AMF</span> crashes on malformed Registration Requests (Free5GC).

**Not covered:** <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>/RF, full <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>, MAC/L1/L2, user-plane throughput, <span class="glossary-term" data-glossary-id="ecpri" data-glossary-term="eCPRI" data-glossary-definition="Enhanced Common Public Radio Interface — a protocol that packages IQ samples into standard ethernet frames for efficient transport on fiber between RU and DU." tabindex="0" role="button">eCPRI</span>.

## UE emulator architecture

### Protocol layers

| Layer | Coverage |
|---|---|
| NAS / 5GMM / 5GSM, <span class="glossary-term" data-glossary-id="ngap" data-glossary-term="NGAP" data-glossary-definition="NG Application Protocol — control-plane protocol between gNB and 5G core AMF." tabindex="0" role="button">NGAP</span>, <span class="glossary-term" data-glossary-id="sctp" data-glossary-term="SCTP" data-glossary-definition="Stream Control Transmission Protocol — reliable transport used by S1AP, NGAP, and other telecom control protocols." tabindex="0" role="button">SCTP</span> | Fully implement |
| RRC | Stub / abstract ("wire" forwarding NAS to NGAP) |
| MAC / PDCP / RLC | Simplified statistical model |
| PHY / RF | Statistical only |
| eCPRI / <span class="glossary-term" data-glossary-id="fronthaul" data-glossary-term="Fronthaul Interface" data-glossary-definition="The connection between the RU and DU carrying low-level radio data, often IQ samples over protocols like eCPRI or Open Fronthaul." tabindex="0" role="button">fronthaul</span> | Implement for RU interface |

### RRC abstraction — why it is hard

RRC has sub-millisecond deadlines (NR slot = 0.5 ms at 30 kHz SCS), enormous
concurrent sub-state (measurements, bearers, security, mobility, DRX), runs
over an unreliable channel (unlike SCTP-backed NAS), and depends on <span class="glossary-term" data-glossary-id="harq" data-glossary-term="HARQ" data-glossary-definition="Hybrid Automatic Repeat Request — L1/L2 retransmission mechanism whose timing RRC procedures depend on." tabindex="0" role="button">HARQ</span>/ARQ
timing. Full RRC at thousands of UEs implies millions of concurrent timers.

**Practical abstraction:** NAS → pass-through shim → NGAP. The 5G core never
sees RRC directly, so this is invisible to core-signaling tests — matching what
Layer B in [`sa_signaling_storm.md`](sa_signaling_storm.md) already does with
UERANSIM.

### GroupUE abstraction

```
gNB Emulator
├── Group 1 → normal registration
├── Group 2 → handover stress
├── Group 3 → PDU session load
└── Group 4 → fuzz / abnormal behavior
```

All UEs in a group launch **in parallel** (unlike sequential UERANSIM launches).

## ML / statistical behavior layer (Phase 3)

Inject RRC-level *events* from models trained on traces — without implementing
full PHY:

| Physical event | RRC consequence | Core impact |
|---|---|---|
| SINR drop | A2 measurement report | Handover (NGAP HO Request) |
| Radio link failure | T310 expiry | RRC release → re-registration |
| <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">Cell</span> overload | RRC release + redirect | UE idle, re-registers |
| Beam failure | BFR / recovery | Possible reestablishment |

Approaches: LSTM/GAN on drive-test RSRP, <span class="glossary-term" data-glossary-id="3gpp" data-glossary-term="3GPP" data-glossary-definition="3rd Generation Partnership Project — the international standards body defining mobile network protocols. srsRAN and OCUDU implement 3GPP specifications." tabindex="0" role="button">3GPP</span> TR 38.901 TDL models, Markov
cell-availability chains, generative BSR traffic — connected to Phase 1 FSMs
via probabilistic event injection.

## RU interface emulator

The O-DU southbound expects <span class="glossary-term" data-glossary-id="open-fronthaul" data-glossary-term="Open Fronthaul" data-glossary-definition="O-RAN WG4 fronthaul specification (eCPRI-based) between DU and RU for C-plane and U-plane sections." tabindex="0" role="button">Open Fronthaul</span> (eCPRI + O-RAN WG4). Three options:

| Option | Description | Trade-off |
|---|---|---|
| **A — <span class="glossary-term" data-glossary-id="fapi" data-glossary-term="FAPI" data-glossary-definition="Femtocell API — software interface between MAC and PHY (or O-DU and PHY) that can bypass full eCPRI fronthaul for lab integration." tabindex="0" role="button">FAPI</span>** | Inject at MAC via nFAPI/FAPI | Easiest; not a true RU emulator |
| **B — eCPRI + synthetic IQ** | Correct framing, statistical IQ content | **Recommended** — catches fronthaul issues |
| **C — Full PHY** | Commercial-grade simulation | Out of scope initially |

**Cannot fake:** PRACH Zadoff-Chu sequences, <span class="glossary-term" data-glossary-id="ptp" data-glossary-term="PTP" data-glossary-definition="Precision Time Protocol — sub-microsecond synchronization required for O-RAN S-plane between DU and RU." tabindex="0" role="button">PTP</span> timing, basic IQ grid structure
(DMRS, slot boundaries).

**Can fake statistically:** channel models, simplified MIMO, HARQ ACK/NACK rates,
MCS/CQI lookup, MAC scheduling, RLC segmentation, simplified RRC timing.

## The four planes

O-DU startup order: <span class="glossary-term" data-glossary-id="m-plane" data-glossary-term="M-plane" data-glossary-definition="Management plane — NETCONF/YANG configuration and capability exchange between O-DU and RU during initialization." tabindex="0" role="button">M-plane</span> connect → **<span class="glossary-term" data-glossary-id="s-plane" data-glossary-term="S-plane" data-glossary-definition="Synchronization plane — PTP/IEEE-1588 timing lock between O-DU and RU; prerequisite before C-plane and U-plane traffic." tabindex="0" role="button">S-plane</span> timing lock** → <span class="glossary-term" data-glossary-id="c-plane" data-glossary-term="C-Plane" data-glossary-definition="The control plane handles planning and instructions but does not carry actual user data. It contains commands for how the user and their data should be handled, receives real-time scheduling instructions (beamforming weights, PRB allocations) from the DU, and tells the RU what UE data to modulate or demodulate." tabindex="0" role="button">C-plane</span>
scheduling → <span class="glossary-term" data-glossary-id="u-plane" data-glossary-term="U-Plane" data-glossary-definition="The user plane is the pipeline where actual user data flows as IQ samples. On downlink it unpacks DU IQ samples for RF transmission; on uplink it converts received waveforms into IQ vectors sent to the DU over fronthaul. It often relies on high-throughput hardware such as smartNIC FPGA or DPDK." tabindex="0" role="button">U-plane</span> IQ.

| Plane | Depth | Notes |
|---|---|---|
| **S-plane** | Full (one-time) | PTP via linuxptp; O-DU blocks without it |
| **M-plane** | Minimal stub | <span class="glossary-term" data-glossary-id="netconf" data-glossary-term="NETCONF" data-glossary-definition="Network Configuration Protocol — management interface (often with YANG models) for RU/O-DU initialization." tabindex="0" role="button">NETCONF</span> session, capability report, carrier config |
| **C-plane** | Full focus | Section types 1/3/5; map UE events to PRACH/PUSCH reports |
| **U-plane** | Structural stub | Correct eCPRI containers; synthetic payloads |

For lab work with OSC O-DU, relaxed timing config can unblock S-plane initially.

## Vendor specifics

Vendor quirks live at the **RU interface** (YANG extensions, timing tolerance,
proprietary C-plane sections) and **CU/DU** (scheduler assumptions, F1
extensions) — the latter is what you are testing, not emulating.

**Data-driven approach:** extract timing offsets, retry behavior, and error
handling from real traces → per-vendor profile plugins on a spec-compliant
eCPRI base layer. YANG models and trace formats are proprietary; models must
be **inferred from observed data**.

## Language choices

| Component | Timing | Language |
|---|---|---|
| PTP / S-plane | ~100 ns–1 μs | C or Rust (linuxptp) |
| eCPRI framing | ~500 μs slots | C/C++/Rust |
| UE FSMs | ms–s | Python asyncio |
| ML models | seconds | Python |
| M-plane NETCONF | seconds | Python (ncclient) |

Recommended split: Python UE + ML layer, ZeroMQ/shared-memory IPC to C/Rust
S-plane and eCPRI engine.

> Start in Python, introduce C/Rust only where timing measurements prove it
> necessary.

## Phased implementation path

### Phase 1 — UE emulator (now)

5GMM/5GSM FSMs, GroupUE parallelism, NAS/NGAP procedures, timers, fuzz hooks,
control API. Test against Open5GS/Free5GC directly. **Target:** 1,000+ stable
concurrent UEs.

### Phase 2 — RU interface for OSC O-DU

S-plane (linuxptp or relaxed OSC timing), M-plane NETCONF stub, C-plane
scheduling + UE event reports, U-plane structural stub. **Target:** OSC O-DU
accepts emulated RU; registrations reach O-CU.

### Phase 3 — Statistical PHY + ML

Channel, handover, cell-failure, and traffic models from traces. **Target:**
behavior distributions match real network statistics.

### Phase 4 — Vendor profiles

Nokia/Ericsson/Samsung timing and YANG overlays; production incident replay.
Requires real DU access and operator traces.

## Relationship to current srsTwin

| Current twin | This reference |
|---|---|
| [`sa_signaling_storm.md`](sa_signaling_storm.md) Layer B | Closest to Phase 1 UE emulator (PHY-abstract NGAP scale) |
| [`sa_signaling_storm.md`](sa_signaling_storm.md) Layer A | Real RRC/PHY pool — opposite trade-off (fidelity, not 1000+ UEs) |
| [`lte_digital_twin.md`](lte_digital_twin.md) | 4G protocol-exact twin; different stack, same fidelity-vs-scale axis |
| [`structure_and_implementation.md`](structure_and_implementation.md) | Running 4G <span class="glossary-term" data-glossary-id="per-encoding" data-glossary-term="PER encoding" data-glossary-definition="Packed Encoding Rules — compact binary encoding of ASN.1 structures for RRC/NAS Layer-3 messages. Decoupling from PHY does not mean skipping PER encoding." tabindex="0" role="button">PER</span>→IQ path today |

The RU emulator path is **forward-looking** — not yet deployed in this repo —
but defines how srsTwin's 5G scale story could evolve beyond UERANSIM + storm.

## Open risks

| Risk | Mitigation |
|---|---|
| PTP on commodity hardware | PTP-capable NIC for production; relax OSC timing in lab |
| Undocumented vendor traces | Infer behavior from observed data |
| eCPRI complexity | Start FAPI for OSC; harden to eCPRI |
| GPL linuxptp | Run as separate process or evaluate BSD ptpd |
| OSC ≠ production DU | Treat OSC phase as integration testing only |

## Further reading

- [5G SA twin & signaling storm](sa_signaling_storm.md)
- [4G structure & implementation](structure_and_implementation.md)
- [Design principles](design_principles.md)
- [Glossary](../glossary.md)
