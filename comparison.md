# poc_StressTest and srsTwin: How They Relate

Both projects are software stand-ins for a cellular radio network, built so
that capacity behavior and protocol behavior can be tested without real
towers, real spectrum, or real subscribers. They sit at opposite ends of the
same trade-off — **fidelity vs. scale** — and neither is trying to be the
other.

| | `poc_StressTest` | `srsTwin` |
|---|---|---|
| What runs | Asyncio Python tasks, one process | Real srsRAN_4G / srsRAN-Project software, one container per network element |
| Protocol fidelity | Realistic message *names and structure*, simplified JSON payloads | Byte-correct <span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span> <span class="glossary-term" data-glossary-id="per-encoding" data-glossary-term="PER encoding" data-glossary-definition="Packed Encoding Rules — compact binary encoding of ASN.1 structures for RRC/NAS Layer-3 messages. Decoupling from PHY does not mean skipping PER encoding." tabindex="0" role="button">PER</span>/UPER <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span>/<span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span>/<span class="glossary-term" data-glossary-id="ngap" data-glossary-term="NGAP" data-glossary-definition="NG Application Protocol — control-plane protocol between gNB and 5G core AMF." tabindex="0" role="button">NGAP</span> |
| Scale | Thousands of UEs, one laptop | 1-3 real 4G pairs; 2-8 real 5G UEs + hundreds <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>-abstract |
| What it's good at | Capacity/admission-control behavior, handover correctness, "what happens at 500 users" | Exact protocol-correctness validation against real stack behavior |
| Core scaling trick | Connection multiplexing matches the real protocol's multiplexing (per-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> Uu socket, one multiplexed F1-like <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span>↔<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> connection) | Accept the real stack's one-UE-per-process nature; separate the concern that needs scale into its own, explicitly PHY-abstract layer |

## The same real-world data feeds both

Both projects are grounded in the same decoded LTE call traces from a real
TELUS network (`22_decoded/`, <span class="glossary-term" data-glossary-id="plmn" data-glossary-term="PLMN" data-glossary-definition="Public Land Mobile Network — identifies a mobile operator network via MCC (mobile country code) and MNC (mobile network code). Example: 302/221 is TELUS in Canada." tabindex="0" role="button">PLMN</span> 302/221), used in two different ways:

- **`poc_StressTest`** replays a real trace's *timing* — attach,
  measurement, and release events fire at times taken from the trace
  (`common/call_trace.py`, `scripts/build_trace_index.py`), driving
  synthetic load with realistic arrival patterns instead of pure
  randomness. It also extracts real captured message *templates*
  (`scripts/build_message_templates.py`) so the realistic envelopes it
  sends are built from real observed structure, not invented from
  scratch.
- **`srsTwin`** injects a real trace record's *identity* fields directly
  into a live simulated UE's first RRC message (see
  [`srstwin/lte_digital_twin.md`](srstwin/lte_digital_twin.md)), so the
  resulting live signaling is byte-comparable to what that real subscriber's
  phone actually produced.

One data source, one fed for *when things happen*, the other fed for *what
a real device's bytes look like* — the two uses are complementary, not
redundant.

## A natural two-tier testing strategy

Because the two projects solve different problems, they're naturally suited
to different stages of the same testing question:

- **srsTwin**, at small scale, answers "does this *exact* message sequence
  behave correctly?" — protocol-exact validation, useful whenever a real
  stack's behavior (or a real DU's, once srsTwin's 5G <span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span>/DU split exists)
  needs to be trusted, not approximated.
- **poc_StressTest**, at large scale, answers "does the *system* hold up
  under this much load?" — capacity, admission control, and handover
  correctness across hundreds or thousands of UEs, which no real-protocol
  stack on a single host can currently sustain.

Neither project needs to grow into doing the other's job. Where srsTwin's
real stacks hit a structural scaling wall (one shared radio-link lockstep
clock, slowing roughly linearly with UE count — see
[`srstwin/design_principles.md`](srstwin/design_principles.md) §3), the
answer in both projects has consistently been to add a separate, explicitly
lower-fidelity layer for the concern that needs scale, rather than to
weaken the fidelity of the layer that's there to be trusted.

## A concrete number for what the trade-off costs

srsTwin's 3-UE demo (see
[`srstwin/lte_digital_twin.md`](srstwin/lte_digital_twin.md)) measured,
rather than estimated, what running 3 real protocol stacks concurrently on
one host costs relative to one running alone: **DU processing delay rose
28.40 ms → 30.86 ms (+8.7%), call duration rose 35.41 s → 38.45 s (+8.6%)**
(n=5 cycles per scenario). That's real host-contention cost between
independent, fully real stacks — exactly the kind of number that motivates
`poc_StressTest`'s opposite choice (one process, asyncio tasks, no
per-UE OS-level overhead at all) for anything that needs to scale past a
handful of UEs.
