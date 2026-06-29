# poc_StressTest — Overview

## What it is

`poc_StressTest` is a software digital twin of a small 5G/LTE radio access network,
built to stress-test a <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>/<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> cluster's capacity and <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span> admission logic without
real radio hardware, spectrum, or a physical <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> fleet. It runs as a set of asyncio
Python services (one DU, three RU sites, one UE simulator process, one dashboard)
connected over plain TCP sockets carrying JSON, orchestrated by Docker Compose.

There is no RF hardware, no real <span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span> encoding, and no over-the-air signal. What
the twin reproduces faithfully is the *signalling and capacity behaviour*: real LTE
<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span> message names and structures (sourced from decoded TELUS call traces under
`22_decoded/`), a coherent path-loss/RSRP/SINR/Shannon-capacity chain, and <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span>
admission control that mirrors how a real <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> would grant or reject a session.

## Why it exists

The originating brief (see `Proposal.txt`) asked for a way to validate a 5G <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span>'s
behaviour against a <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>/<span class="glossary-term" data-glossary-id="cu" data-glossary-term="CU" data-glossary-definition="Centralized Unit — higher layers (PDCP/RRC) in a split base station, less time-critical than the DU. Connects to DU over F1." tabindex="0" role="button">CU</span> under realistic traffic without field trials: reproduce
mobility, handovers, and capacity load for a cluster using historical call-trace
data, without needing live spectrum or production hardware access. The proof of
concept narrows that to the simplest useful slice: create one DU and an RU cluster
in containers, simulate UEs establishing sessions, consuming <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRBs</span>, moving, and
releasing, and make the <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> count scale into the thousands so the DU's admission
control and PRB pools are pushed under genuine load.

Running this in Docker on a laptop only works because of one architecture
decision: the <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> population is simulated as asyncio tasks inside a single process,
not as one container per UE (Docker cannot sustain thousands of containers'
namespaces and per-container bookkeeping). See `architecture.md` for why the
connection topology on top of that is what actually makes it scale.

## Topology

```
UE (asyncio task, one TCP socket each)
   |  Uu
   v
RU site (one container per site, 3 sector cells each)
   |  F1 (one multiplexed TCP connection per RU)
   v
DU (one container, owns all PRB pools)
```

- **<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>** (`du/du_server.py`) — a single asyncio process that owns one `Cell` (a <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span>
  pool) per sector <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span> across the whole cluster, and performs admission control:
  granting or rejecting PRBs for each <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> session.
- **<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> sites** (`ru/ru_server.py`) — three containers in the default compose stack
  (`ru`, `ru2`, `ru3`, logically `RU1`/`RU2`/`RU3`), each one macro tower located
  apart from the others (`(0,600)`, `(-520,-300)`, `(520,-300)` by default, forming
  a triangle). Each site serves **3 sector cells** in a 120° fan (azimuths
  60°/180°/300°), so the default cluster has **9 cells** total, each with its own
  250-PRB pool on the DU (`CELL_TOTAL_PRBS` / `TOTAL_PRBS` in compose).
- **UE simulator** (`ue/ue_sim.py`) — one process that runs `NUM_UES` UEs as
  independent asyncio tasks, each with its own identity, 2-D random-walk mobility,
  transmit power, and traffic demand. Each UE picks the strongest RU/sector for its
  position, attaches, exchanges measurement reports and data, hands over between
  sectors and sites as it moves, and eventually releases.
- **Dashboard** (`dashboard/server.py`, port 9090) — polls the DU and <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> simulator
  `/status` endpoints once a second and renders <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span> utilization bars, a UE-count
  slider, handover stats, a live mobility map, and a single-UE call-flow ladder
  (<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span> sequence diagram) sourced from the <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>'s message trace ring buffer.

No real RF or <span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span> is involved anywhere in this chain. Message *names* mirror real
<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span>/<span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span> procedures so the flow is recognisable to anyone who knows the stack, but
the wire payloads are a simplified, length-prefixed JSON protocol
(`common/protocol.py`).

## How to run it

The stack is Python 3.12+, run via Docker Compose; there is no separate build step
or test harness beyond `pytest`. From the project root, with Docker Desktop running:

```powershell
docker compose up -d --build
docker compose ps     # expect du, ru, ru2, ru3, ue-sim, dashboard = Up
```

Then open the dashboard at `http://localhost:9090`. To run with more UEs (PowerShell
sets the environment variable before Compose reads it):

```powershell
$env:NUM_UES = "500"; docker compose up -d --build
```

The <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>'s raw JSON status is at `http://localhost:9080/status` (host port 9080, not
8080 — 8080 sits in Windows' excluded port range). See `usage_and_roadmap.md` for
trace-replay mode, traffic-profile switching, and scaling guidance, and
`architecture.md` for the technical design underneath these commands.
