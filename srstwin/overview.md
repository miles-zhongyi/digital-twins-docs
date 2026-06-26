# srsTwin — Overview

## What it is

`srsTwin` is a digital twin built from **real open-source cellular software**,
not a simplified stand-in. Where `poc_StressTest` reproduces signaling *names
and shapes* in a lightweight asyncio process, srsTwin runs the actual
software a real base station or core network could run — srsRAN_4G's
`srsue`/`srsenb`/`srsepc`, and srsRAN-Project's `gnb` plus Open5GS — as Docker
containers talking real, ASN.1-encoded RRC/NAS/S1AP/NGAP over a
ZeroMQ-emulated radio link instead of real RF hardware. The trade is the
opposite of `poc_StressTest`'s: maximum protocol fidelity, at the cost of
scale (a real protocol stack assumes one UE per process, the way one phone
is one device).

The project currently has **two independent twins** under one
`integration/` directory, built at different times for different
questions:

| | 4G LTE twin | 5G SA twin / signaling storm |
|---|---|---|
| Core software | srsRAN_4G (`srsue`, `srsenb`, `srsepc`) | srsRAN-Project `gnb` ("OCUDU") + Open5GS |
| Question it answers | Does this *exact* real subscriber's call flow behave correctly? | What does *core-network signaling load* look like at hundreds of UEs? |
| Scale | 1 UE, or up to 3 independent eNB+UE pairs sharing one EPC | 2-8 RF-real UEs (Layer A) + hundreds of PHY-abstract UEs (Layer B) |
| See | [`lte_digital_twin.md`](lte_digital_twin.md) | [`sa_signaling_storm.md`](sa_signaling_storm.md) |

Both twins are validated against the **same real-world data source**: decoded
LTE call traces from a real TELUS network (`22_decoded/`, shared with
`poc_StressTest`). The 4G twin injects a real captured subscriber's identity
into a live simulated UE's first RRC message, so the resulting signaling is
byte-comparable to what a real phone produced on a real network. See
[`../comparison.md`](../comparison.md) for how this and `poc_StressTest`'s
trace-timing replay relate.

## Why two separate twins instead of one

Real protocol stacks don't parallelize the way `poc_StressTest`'s asyncio
UEs do. `srsue`/`srsenb` exchange IQ samples over ZeroMQ in **lockstep** — one
request/reply round trip per radio subframe — and that lockstep is shared by
every UE attached to a cell. Adding UEs doesn't cost more CPU cores, it costs
*more round trips per subframe*, so the cell's effective clock slows down
roughly linearly with UE count. This is confirmed empirically in both twins:
the 4G twin's 3-UE demo (see `lte_digital_twin.md`) measured real contention
at just 3 concurrent pairs, and the 5G storm framework's own Layer A docs
state the same pool "stays PHY-correct, but above ~4 UEs the clock crawls."

Rather than fight that limit, both twins **accept it and scale around it**:
the 4G twin keeps the real stack small (1-3 pairs) and treats contention
itself as the thing being measured; the 5G twin keeps a small real-PHY pool
for protocol validation (Layer A) and adds a PHY-abstract layer (Layer B,
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
