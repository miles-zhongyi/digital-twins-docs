# srsTwin — Overview

## What it is

`srsTwin` is a digital twin built from **real open-source cellular software**,
not a simplified stand-in. Where `poc_StressTest` reproduces signaling *names
and shapes* in a lightweight asyncio process, srsTwin runs the actual
software a real base station or core network could run — srsRAN_4G's
`srsue`/`srsenb`/`srsepc`, and srsRAN-Project's `gnb` plus Open5GS — as Docker
containers talking real, <span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span>-encoded <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="nas" data-glossary-term="NAS" data-glossary-definition="Non-Access Stratum — Layer 3 protocol between UE and core for attach, authentication, and session management." tabindex="0" role="button">NAS</span>/<span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span>/NGAP over a
ZeroMQ-emulated radio link instead of real RF hardware. The trade is the
opposite of `poc_StressTest`'s: maximum protocol fidelity, at the cost of
scale (a real protocol stack assumes one <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> per process, the way one phone
is one device).

The project currently has **two independent twins** under one
`integration/` directory, built at different times for different
questions:

| | 4G LTE twin | 5G SA twin / signaling storm |
|---|---|---|
| Core software | srsRAN_4G (`srsue`, `srsenb`, `srsepc`) | srsRAN-Project `gnb` ("OCUDU") + Open5GS |
| Question it answers | Does this *exact* real subscriber's call flow behave correctly? | What does *core-network signaling load* look like at hundreds of UEs? |
| Scale | 1 <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span>, or up to 3 independent <span class="glossary-term" data-glossary-id="enb" data-glossary-term="eNB" data-glossary-definition="Evolved Node B — the 4G LTE base station connecting UEs to the EPC over S1AP." tabindex="0" role="button">eNB</span>+<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> pairs sharing one <span class="glossary-term" data-glossary-id="epc" data-glossary-term="EPC" data-glossary-definition="Evolved Packet Core — the 4G core network (MME, SGW, PGW, HSS) handling mobility, authentication, and sessions." tabindex="0" role="button">EPC</span> | 2-8 RF-real UEs (Layer A) + hundreds of <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>-abstract UEs (Layer B) |
| See | [`structure_and_implementation.md`](structure_and_implementation.md), [`lte_digital_twin.md`](lte_digital_twin.md) | [`sa_signaling_storm.md`](sa_signaling_storm.md) |

Both twins are validated against the **same real-world data source**: decoded
LTE call traces from a real TELUS network (`22_decoded/`, shared with
`poc_StressTest`). The 4G twin injects a real captured subscriber's identity
into a live simulated <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span>'s first <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> message, so the resulting signaling is
byte-comparable to what a real phone produced on a real network. See
[`../comparison.md`](../comparison.md) for how this and `poc_StressTest`'s
trace-timing replay relate.

## Why two separate twins instead of one

Real protocol stacks don't parallelize the way `poc_StressTest`'s asyncio
UEs do. `srsue`/`srsenb` exchange <span class="glossary-term" data-glossary-id="iq-samples" data-glossary-term="IQ samples" data-glossary-definition="Complex-valued in-phase and quadrature samples representing a modulated radio waveform digitally." tabindex="0" role="button">IQ samples</span> over ZeroMQ in **lockstep** — one
request/reply round trip per radio subframe — and that lockstep is shared by
every <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> attached to a <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>. Adding UEs doesn't cost more CPU cores, it costs
*more round trips per subframe*, so the <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>'s effective clock slows down
roughly linearly with <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> count. This is confirmed empirically in both twins:
the 4G twin's 3-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> demo (see `lte_digital_twin.md`) measured real contention
at just 3 concurrent pairs, and the 5G storm framework's own Layer A docs
state the same pool "stays <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>-correct, but above ~4 UEs the clock crawls."

Rather than fight that limit, both twins **accept it and scale around it**:
the 4G twin keeps the real stack small (1-3 pairs) and treats contention
itself as the thing being measured; the 5G twin keeps a small real-<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> pool
for protocol validation (Layer A) and adds a <span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span>-abstract layer (Layer B,
UERANSIM) purely for core-network signaling scale. See
[`design_principles.md`](design_principles.md) for the general principle
this reflects: when a real protocol stack hits a structural scaling wall,
don't approximate the stack — separate the concern that needs scale from
the concern that needs fidelity, and solve each with the right tool.

## Where things live

```
srsTwin/
  srsRAN_4G/              the real LTE stack (srsue, srsenb, srsepc), patched
                           for trace-identity injection (rrc_trace/)
  ocudu/                   a full srsRAN-Project clone (the 5G gNB, "OCUDU")
  integration/
    docker-compose*.yml    4G twin: base 1-pair stack + healthchecks/restart
    docker-compose.3ue.yml 4G twin: overlay adding 2 more eNB+UE pairs
    4g_configs/            per-pair eNB/UE configs, EPC subscriber DB
    demo3ue/                4G twin: 3-UE contention measurement tooling
    realizer/               4G twin: paused plan to host N UEs in ONE srsue process
    dashboard/              4G twin: live web dashboard (port 8765)
    hub/                    5G twin: ZMQ IQ-relay hub (UL sum / DL fan-out)
    storm/                  5G twin: the signaling-storm framework (Layers A/B)
```
