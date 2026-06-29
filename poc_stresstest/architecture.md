# poc_StressTest — Architecture

## Connection multiplexing: the decision that makes this scale

The signalling path is a proxy chain:

```
UE  <--Uu-->  RU  <--F1-->  DU
```

The single design decision that makes thousands of simulated UEs runnable on one
laptop is that **connection multiplexing differs per hop, deliberately**, mirroring
how the multiplexing works in a real RAN:

- **<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> ↔ <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> (the "Uu" link):** one TCP socket *per UE*. In `ru/ru_server.py`,
  `serve_ue()` is the coroutine bound to `asyncio.start_server` — one instance per
  accepted connection, so the RU naturally holds one coroutine and socket per UE.
  In `ue/ue_sim.py`, `_attach()` opens a fresh `asyncio.open_connection` per
  attach. Because a UE's socket *is* its radio link, a handover is just opening a
  new socket to the target RU and closing the old one — there is no cross-process
  or cross-container state migration to choreograph.
- **RU ↔ <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> (the "F1" link):** exactly **one** multiplexed TCP connection per RU,
  carrying every UE's signalling that RU forwards. This is implemented by
  `F1Link` in `ru/ru_server.py`: it owns a single `reader`/`writer` pair, a
  `pending: dict[int, asyncio.Future]` map, and an `itertools.count()` transaction
  id generator. `request(msg)` stamps `msg["txn"]` with the next id, registers a
  future in `pending[txn]`, sends the message under `self.wlock` (so concurrent UE
  coroutines don't interleave writes on the shared socket), and awaits the future.
  A single background task, `_reader_loop()`, is the *only* code that reads from
  the DU socket; it pops `pending[reply["txn"]]` and resolves that UE's future.
  This is the standard async RPC-over-one-socket pattern: many logical requests in
  flight, one physical connection, replies routed back by a correlation id. It
  mirrors a real F1 interface (one DU↔RU association carries all UEs under that
  RU) and is *why* DU connection count is O(towers) rather than O(phones) — three
  RU sites means three F1 sockets on the DU, no matter whether the UE simulator is
  running 1 UE or 5000.

The DU side of the same connection is `DU.serve_f1()`: one `async def` per RU
connection, looping on `P.async_recv_msg(reader)`, dispatching synchronously, and
echoing `msg.get("txn")` back on the reply so the RU's `_reader_loop` can find the
right future. `F1Link` also handles reconnection (`_reconnect_loop`, exponential
backoff capped at 5s) and fails every pending future with `ConnectionError` if the
DU link drops, so an F1 outage doesn't hang UE coroutines indefinitely — the Uu
side stays up while F1 reconnects in the background.

## Wire protocol

`common/protocol.py` defines a framing layer used identically on both hops: a
4-byte big-endian length prefix followed by UTF-8 JSON —

```
[ 4 bytes length N ][ N bytes UTF-8 JSON ]
```

`send_msg`/`recv_msg` are the blocking (socket) variants; `async_send_msg`/
`async_recv_msg` are the asyncio `StreamWriter`/`StreamReader` variants actually
used by the DU, RU, and UE simulator. `async_recv_msg` raises
`asyncio.IncompleteReadError` on a clean EOF, which all three servers catch as "the
peer went away." Because every UE→DU <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">uplink</span> elicits exactly one DU→UE downlink, the
RU can be a synchronous transparent proxy: receive from the UE, stamp RF/<span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>
context, forward over F1, receive the one reply, relay it back. There is no
internal queueing, reordering, or batching logic in the RU's per-UE loop.

`protocol.py` also still defines a legacy, flat set of message-type constants
(`RRC_SETUP_REQUEST`, `RRC_SETUP`, `DATA`, `RRC_RELEASE`, ...) from an earlier,
simpler version of the wire format. These remain only as fallbacks; the actual
message content on the wire today is produced by the signalling catalog described
below, and code should build messages with `catalog.build(...)` / classify them
with `catalog.classify(...)` rather than hand-assembling dicts or hardcoding these
names.

## The `_twin` sidecar pattern

Every wire message has a realistic envelope — `message_name`, `interface`,
`protocol`, `decoded`, plus fields like `cell_id`, `m_tmsi`, `timestamp` that look
exactly like fields a real decoded LTE trace record would have — and a top-level
`txn` used only for the RU's F1 request/reply correlation. Riding alongside that,
under the key `_twin`, is a sidecar dict holding everything that is simulation
state but has no analogue in a real captured trace: `ue_id`, `cell` (the DU's pool
key for the serving sector — not the same as the envelope's cosmetic numeric
`cell_id`), `rf` (the RSRP/SINR snapshot), `demand_mbps`, `allocated_prbs`, `mcs`,
`cause`, `step`, `congested`, and so on.

`SignalingCatalog.build()` (`common/signaling/catalog.py`) constructs this: it
fills a template to get the realistic envelope, then attaches
`msg["_twin"] = sidecar` built from the keyword arguments callers pass (filtering
out `None` values). The accessor `twin(msg)` (also exported from
`common/signaling/__init__.py`) just returns `msg.get("_twin") or {}`.

This separation is deliberate and load-bearing throughout the codebase: the DU's
handlers (`handle_setup`, `handle_measurement`, `handle_data`, `handle_release` in
`du_server.py`) read `tw = twin(msg)` and pull `tw["ue_id"]`, `tw["cell"]`,
`tw["rf"]["sinr_dl_db"]`, `tw["demand_mbps"]` to do admission math — none of that
functional state lives in or competes with the realistic envelope fields. The RU's
`serve_ue()` stamps `tw["cell"]` and `tw["rf"]` (computed from UE geometry) into the
sidecar before forwarding uplinks, while writing the cosmetic numeric `cell_id`
separately onto the top-level envelope via `_CELL_NUM`. The DU classifies an uplink
by its real `message_name` (`CATALOG.classify(msg)`), never by anything in `_twin`
— `_twin` is consulted only after the message has already been identified as a
real procedure.

## Signalling catalog and templates

The signalling layer is split into a technology-neutral flow definition and a
per-technology catalog that maps it onto real message names.

**Flow (`common/signaling/procedures.py`).** Because the Uu/F1 link is a strict
one-uplink → one-reply exchange, a fuller call flow is modelled as an ordered
sequence of `Step(name, uplink, downlink, action)` tuples, each pairing one logical
UE uplink with the one logical network downlink it elicits. `action` is one of
`ACT_NONE`, `ACT_ADMIT`, `ACT_RECONFIG`, `ACT_RELEASE` and tells the DU what
capacity-affecting work (if any) to do at that step. The defined flows are:

- `ATTACH_FLOW` — `RRC_CONNECTION_REQUEST → RRC_CONNECTION_SETUP`, `..._SETUP_COMPLETE
  → SECURITY_MODE_COMMAND`, `SECURITY_MODE_COMPLETE → UE_CAPABILITY_ENQUIRY`,
  `UE_CAPABILITY_INFORMATION → S1_INITIAL_CONTEXT_SETUP_REQUEST` (this step carries
  `ACT_ADMIT` — the <span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span> grant decision happens here), `RECONFIGURATION_COMPLETE →
  S1_INITIAL_CONTEXT_SETUP_RESPONSE`.
- `MEASUREMENT_STEP` — `RRC_MEASUREMENT_REPORT → RRC_CONNECTION_RECONFIGURATION`
  (`ACT_RECONFIG`), the steady-state mobility/RF update.
- `DATA_STEP` — `DATA → DATA_ACK`, user-plane traffic with no LTE control-plane
  analogue.
- `RELEASE_FLOW` — `S1_UE_CONTEXT_RELEASE_REQUEST → S1_UE_CONTEXT_RELEASE_COMMAND`
  (`ACT_RELEASE` — PRBs reclaimed here), `S1_UE_CONTEXT_RELEASE_COMPLETE →
  RRC_CONNECTION_RELEASE` (the session's `FINAL_UPLINK`).

**Catalog (`common/signaling/catalog.py`, `lte.py`, `nr.py`).** `SignalingCatalog`
is the base class; `LteCatalog` (the only implemented one) supplies `MESSAGE_NAMES`
(logical name → real LTE message name, e.g. `RRC_CONNECTION_REQUEST →
RRC_RRC_CONNECTION_REQUEST`), `RECORD_IDS` (the decoder's canonical per-type id,
taken from `CallFlow/record-id-messages.txt`), and `DEFAULT_TEMPLATES` (built-in
fallback templates so the twin runs with no extracted-template file present).
`catalog.build(logical, ue_id=..., cell=..., step=..., **twin_fields)` resolves the
real name, fills the template with a per-call `_token_context` (timestamps,
`m_tmsi`, <span class="glossary-term" data-glossary-id="s1ap" data-glossary-term="S1AP" data-glossary-definition="S1 Application Protocol — a control-plane protocol between 4G eNB and EPC/MME handling communications between the base station and core network." tabindex="0" role="button">S1AP</span> ids, the canonical `record_id`, the cosmetic numeric `cell_id`), and
attaches the `_twin` sidecar. `catalog.classify(msg)` looks up `msg["message_name"]`
in a precomputed `real-uplink-name → Step` map (falling back to the `_twin.step`
field, then `None`) so the DU knows which handler and which downlink to use.
`get_catalog()` (in `common/signaling/__init__.py`) selects the catalog class by the
`RADIO_TECH` environment variable (default `lte`) and caches instances.

**Templates (`common/signaling/templates.py`).** A template is a real captured
record — the full envelope plus its realistic `decoded` body — with a small,
fixed set of per-instance envelope leaves (`TEMPLATE_TOKENS`: `record_id`,
`timestamp`, `procedure_id`, `cell_id`, `m_tmsi`, `enb_ue_s1ap_id`,
`mme_ue_s1ap_id`) replaced by `<<name>>` placeholder strings — `abstract_record()`
does this extraction offline. Everything else, including the entire `decoded`
<span class="glossary-term" data-glossary-id="asn1" data-glossary-term="ASN.1" data-glossary-definition="A schema language for telecom messages: a strict protocol blueprint defining what messages exist, their fields, mandatory vs optional fields, choices, and value types." tabindex="0" role="button">ASN.1</span>-shaped body and any opaque hex blobs, is preserved verbatim from the sample,
which is what makes a built message look real rather than synthetic. At runtime,
`fill(template, context)` deep-copies the template and walks it, replacing any
string that exactly matches a `<<token>>` with the corresponding live value from
`context`; unmatched tokens are left in place as a visible "forgot to supply this"
marker. Real templates are produced offline by `scripts/build_message_templates.py`
from `22_decoded/` traces and written to `data/lte_templates.json`; they **override**
the catalog's `DEFAULT_TEMPLATES` by message name when present (`load_templates()`
merges `{**DEFAULT_TEMPLATES, **load_templates(path)}`), and a missing file simply
means defaults are used — the stack always runs without requiring real trace data.

A `SignalingDispatcher` (`common/signaling/dispatcher.py`, returned by
`get_dispatcher()`) wraps the catalog with an additional, optional layer: per
message-type source selection between a trace-sample index
(`common/signaling/trace_index.py`), an ML-vocabulary source
(`common/signaling/ml_source.py`), and the catalog's own templates, configured via
`common/signaling/message_sources.py` and exposed to the dashboard at
`/api/message-sources`. `du_server.py`, `ru_server.py`, and `ue_sim.py` all call
`get_dispatcher()` and use it exactly where they would use a catalog; this is a
pluggability seam for swapping in higher-fidelity message bodies without touching
the flow/admission logic.

## RF and capacity model

`common/rf_model.py` implements a single, coherent chain used identically by the
RU (to compute RF for an uplink) and the DU (to size a PRB grant):

```
distance + tx power --(path loss)--> RSRP / SINR --(Shannon)--> spectral efficiency --> PRB requirement
```

- `path_loss_db()` — log-distance path loss anchored to free-space loss at 1 m
  (`exponent=3.5` by default).
- `rsrp_dbm()` / `sinr_db()` — turn transmit power, distance, and bandwidth into
  per-subcarrier RSRP and wideband SINR (signal over thermal noise plus a fixed
  neighbour-interference margin).
- `spectral_efficiency()` — Shannon capacity (`log2(1 + SINR)`) scaled by
  `IMPL_EFFICIENCY = 0.6` (a real scheduler's practical fraction of Shannon after
  coding overhead) and capped at `MAX_SE = 7.4063` bits/s/Hz (a 256-QAM,
  ~0.93-code-rate ceiling). Below `MIN_SINR_DB = -6.7` dB the call returns `0.0` —
  no coverage.
- `throughput_per_prb_mbps()` / `prbs_for_demand()` — convert spectral efficiency
  and one PRB's bandwidth (`prb_bandwidth_hz`, 12 subcarriers × SCS) into an
  achievable per-PRB Mbps, then `ceil(demand_mbps / per_prb)` PRBs to meet a
  target demand.
- `prbs_for_voip()` — VoIP is *not* sized from `demand_mbps`: it reserves a fixed
  1 PRB (good RF) or 2 PRBs (`sinr_db < 5.0`, marginal RF), capped by
  `VOIP_MAX_PRBS = 2`, matching how real VoLTE schedulers grant 1–2 PRBs per slot
  rather than scaling with the codec's actual ~12–48 kbps.
- `prbs_for_traffic(demand_mbps, sinr, scs_khz, profile)` — the single entry point
  the DU calls; dispatches to `prbs_for_demand` (uncapped) for `profile="data"` or
  `prbs_for_voip` for `profile="voip"` (the default).

The model is explicitly single-layer (no MIMO), tuned to land in realistic ranges
for an n78 (3.5 GHz), 100 MHz macro cell. Beyond roughly 1.3 km a UE falls out of
coverage and any admission attempt is rejected with `cause="no-coverage"`.

Sector antennas are modelled separately: `sector_antenna_gain_db()` applies a
120°-wide pattern (`SECTOR_WIDTH_DEG`) with an 18 dB edge rolloff
(`SECTOR_EDGE_LOSS_DB`) quadratic in the angle off boresight, and returns
`NO_COVERAGE_GAIN_DB = -999.0` outside the sector — `link_rf()` (the function both
the RU's `compute_rf()` and the UE's `rsrp_from()` call) uses this to decide
`in_sector` and synthesizes a deep-fade RF snapshot (`rsrp_dl_dbm=-140.0`,
SINR below `MIN_SINR_DB`) when the UE is outside the cell's fan.

## Handover

Handover decision-making lives entirely on the UE side, in `ue/ue_sim.py`'s
`one_session()` — the RU and DU are passive with respect to *which* cell a UE
should be on; they only react to what the UE tells them.

`_parse_rus()` flattens the `RU_LIST` environment variable (a JSON array of RU
*sites*, each with `host`, `port`, `x`, `y`, and a `sectors` list of
`{cell, azimuth}`) into one flat link per sector cell, all sharing their site's
host/port/coordinates. `rsrp_from(ru, pos)` calls the same `rf.link_rf()` function
the RU's `compute_rf()` uses, with the same tx power, frequency, gain, and sector
width defaults — so the UE's view of signal strength is computed by the identical
path-loss/sector model the network side uses, not an approximation of it.
`best_ru(pos)` returns the RU/sector with the highest estimated RSRP for a
position, evaluated across every sector of every site in `RUS`.

The handover trigger is A3-style hysteresis: in the periodic measurement block of
`one_session()`, the UE recomputes `target = best_ru(pos)` and hands over only if
`target["name"] != serving["name"]` **and**
`rsrp_from(target, pos) >= rsrp_from(serving, pos) + HO_MARGIN_DB` (default 3 dB,
`HO_MARGIN_DB` env var). This margin prevents ping-pong handovers right at a cell
boundary where two sectors' RSRP estimates are nearly equal. The same trigger and
margin apply whether the candidate is a different sector of the *same* site
(inter-sector) or a sector of a *different* site (inter-site) — the UE does not
distinguish the two cases.

The handover itself is make-before-break: `_attach(target, ...)` walks the full
attach flow and opens a brand-new socket to the target cell, and only if that
attach is *not* rejected does the UE call `_release()` on the old socket and switch
`serving` to the target. If the target rejects (no coverage, no free PRBs), the UE
stays on the original cell and counts a `ho_fail`. Because the target's admission
runs while the source session is still technically active, the DU's
`handle_setup()` explicitly guards against double-counting: it calls
`_release_ue_other_cells(ue_id, cell.cell_id)` before granting the target cell's
PRBs, clearing any stale session for that `ue_id` on every other cell so a UE is
never billed for PRBs on two cells at once during the overlap window.

## The three servers, briefly

- **DU** (`du/du_server.py`) — one `Cell` (PRB pool, `used_prbs`/`total_prbs`)
  per cell id, lazily created on first reference. `dispatch()` classifies an
  uplink via the catalog and routes by `step.action` to `handle_setup` /
  `handle_measurement` / `handle_data` / `handle_release` / `handle_passthrough`
  (for flow steps with no capacity action, like <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> setup or security mode). All
  handlers are synchronous functions with no `await` inside them, so under
  asyncio's single-threaded cooperative scheduling each one runs atomically with
  respect to every other connection — no locks guard the PRB pools. A
  `ThreadingHTTPServer` running in a background thread serves `/status` from a
  pre-serialized JSON snapshot (`_snap_json`) that the event loop's `monitor()`
  coroutine refreshes once a second, so the HTTP thread and the event loop never
  touch the same live structures concurrently. `serve_f1()`'s `finally` block
  reclaims PRBs for every UE on that connection's cells if the RU's F1 link drops.
- **RU** (`ru/ru_server.py`) — `compute_rf()` turns UE geometry into an RSRP/SINR
  snapshot for whichever sector the UE's own `_twin.cell` names (trusting the
  UE's choice, falling back to `best_sector()` — the RU's local strongest-sector
  pick — only if the UE names a cell that isn't one of this site's sectors or
  supplies no position). It stamps that into the uplink's `_twin` sidecar before
  proxying through `F1.request()`. If a UE's socket drops without a clean
  release, the `finally` block in `serve_ue()` sends a catalog-built
  `S1_UE_CONTEXT_RELEASE_REQUEST` on the UE's behalf so the DU still reclaims the
  PRBs.
- **UE simulator** (`ue/ue_sim.py`) — runs `target_num_ues` UEs as asyncio tasks
  (`run_ue`/`one_session`), each with independent identity, `Walk` mobility (a
  bounded 2-D random walk), tx power, and demand. `reconcile()` spawns or cancels
  tasks in batches of `SPAWN_BATCH` (default 25, `UE_SPAWN_INTERVAL` between
  batches) to reach `target_num_ues` without a connection storm against the RUs.
  `POST /control {"num_ues": N}` (used by the dashboard slider) and `GET /status`
  expose runtime scaling; the target is persisted to `UE_TARGET_STATE` so a
  container restart resumes at the same scale.

Configuration throughout is environment variables with in-code defaults,
overridden by `docker-compose.yml` (and `docker-compose.trace.yml` for the
trace-replay overlay, which only flips `REPLAY_MODE=1` and sets `REPLAY_SPEED`).
One discrepancy worth noting: `du_server.py`'s in-code default for `TOTAL_PRBS` is
`273`, but `docker-compose.yml` sets it to `250` for every cell — the deployed
default is 250 PRBs/cell, matching the README/CLAUDE.md's "250 PRB each" claim; the
273 figure only appears if the DU is run standalone with no environment override.
