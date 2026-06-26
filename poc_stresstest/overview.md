# poc_StressTest — Overview

## What it is

`poc_StressTest` is a software digital twin of a small 5G/LTE radio access network,
built to stress-test a DU/RU cluster's capacity and PRB admission logic without
real radio hardware, spectrum, or a physical UE fleet. It runs as a set of asyncio
Python services (one DU, three RU sites, one UE simulator process, one dashboard)
connected over plain TCP sockets carrying JSON, orchestrated by Docker Compose.

There is no RF hardware, no real ASN.1 encoding, and no over-the-air signal. What
the twin reproduces faithfully is the *signalling and capacity behaviour*: real LTE
RRC/S1AP message names and structures (sourced from decoded TELUS call traces under
`22_decoded/`), a coherent path-loss/RSRP/SINR/Shannon-capacity chain, and PRB
admission control that mirrors how a real DU would grant or reject a session.

## Why it exists

The originating brief (see `Proposal.txt`) asked for a way to validate a 5G RU's
behaviour against a DU/CU under realistic traffic without field trials: reproduce
mobility, handovers, and capacity load for a cluster using historical call-trace
data, without needing live spectrum or production hardware access. The proof of
concept narrows that to the simplest useful slice: create one DU and an RU cluster
in containers, simulate UEs establishing sessions, consuming PRBs, moving, and
releasing, and make the UE count scale into the thousands so the DU's admission
control and PRB pools are pushed under genuine load.

Running this in Docker on a laptop only works because of one architecture
decision: the UE population is simulated as asyncio tasks inside a single process,
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

- **DU** (`du/du_server.py`) — a single asyncio process that owns one `Cell` (a PRB
  pool) per sector cell across the whole cluster, and performs admission control:
  granting or rejecting PRBs for each UE session.
- **RU sites** (`ru/ru_server.py`) — three containers in the default compose stack
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
- **Dashboard** (`dashboard/server.py`, port 9090) — polls the DU and UE simulator
  `/status` endpoints once a second and renders PRB utilization bars, a UE-count
  slider, handover stats, a live mobility map, and a single-UE call-flow ladder
  (RRC/S1AP sequence diagram) sourced from the DU's message trace ring buffer.

No real RF or ASN.1 is involved anywhere in this chain. Message *names* mirror real
RRC/S1AP procedures so the flow is recognisable to anyone who knows the stack, but
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

The DU's raw JSON status is at `http://localhost:9080/status` (host port 9080, not
8080 — 8080 sits in Windows' excluded port range). See `usage_and_roadmap.md` for
trace-replay mode, traffic-profile switching, and scaling guidance, and
`architecture.md` for the technical design underneath these commands.
