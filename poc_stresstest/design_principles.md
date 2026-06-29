# poc_StressTest — Design Principles

These are the recurring decisions in this codebase worth carrying forward into
similar simulation/twin work. Each is grounded in a specific place in the code,
not stated as a general best practice.

## Transport multiplexing should match the real protocol's multiplexing, not be uniform

It would have been simpler to make every hop look the same — either one socket
per <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> everywhere, or one shared socket everywhere. The codebase deliberately does
neither. UE↔<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> (`ru/ru_server.py`'s `serve_ue()`, one coroutine per accepted
connection) is one socket per UE because that is what the real Uu interface is:
a dedicated radio link per device, and treating it that way means a handover is
just "open a new socket, close the old one" with no extra state-migration
machinery (`ue_sim.py`'s `one_session()` does exactly this, make-before-break).
RU↔<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span> (`F1Link` in `ru_server.py`) is one multiplexed socket per RU, correlated by
a `txn` id, because that is what the real F1 interface is: one DU↔<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> association
carrying every <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> that tower serves. The payoff is concrete and measurable — DU
connection count is O(number of towers), not O(number of phones), which is the
entire reason a 3-RU cluster can credibly carry thousands of simulated UEs in one
process on a laptop. If a future hop needs different multiplexing in the real
network it is modelling, mirror that multiplexing rather than defaulting to
whatever is easiest to code.

## Keep simulation/functional state out of the realistic envelope

The wire message format carries two kinds of things: a realistic LTE
envelope/`decoded` body that is supposed to look exactly like a captured trace
record, and simulation bookkeeping (`ue_id`, `cell`, `rf`, `demand_mbps`,
`allocated_prbs`, `mcs`, `cause`, `step`) that no real trace would ever contain.
`common/signaling/catalog.py` puts the second kind under a single reserved key,
`_twin`, instead of letting it leak into top-level fields. The motivating risk is
collision and confusion: the realistic envelope already has a cosmetic numeric
`cell_id` (derived in `cell_num()` purely for display, e.g. `cell-1 → 1`); the <span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>'s
*functional* serving-<span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span> key (`tw["cell"]`, a string like `"RU1-A"`, the actual
<span class="glossary-term" data-glossary-id="prb" data-glossary-term="PRB" data-glossary-definition="Physical Resource Block — a unit of frequency-time resources on the LTE/NR grid allocated by the scheduler." tabindex="0" role="button">PRB</span>-pool lookup key) is a different thing with a similar name. Keeping it in
`_twin` rather than reusing or renaming the envelope's `cell_id` means the two
never get conflated, and the realistic envelope stays byte-for-byte close to what
`scripts/build_message_templates.py` extracted from a real trace. The rule this
generalizes to: when an envelope must look authentic, don't let internal
bookkeeping fields creep into it — give bookkeeping a clearly separate namespace
that calling code can `.get()` defensively (the `twin(msg)` helper returns `{}` if
absent, so callers never need a None-check on `_twin` itself).

## Trace timing and trace content are reusable independently of each other

`common/call_trace.py` and `common/trace_replay.py` extract *when* real events
happened (`iter_trace_events` → attach/measurement/release timestamps keyed by
`m_tmsi`); `common/signaling/templates.py` extracts *what real messages look like*
(`abstract_record`, tokenized envelope + verbatim `decoded` body). These are two
independent offline-built artifacts — `data/trace_index.jsonl` and
`data/lte_templates.json` — built by two separate scripts
(`scripts/build_trace_index.py`, `scripts/build_message_templates.py`) from the
same raw `22_decoded/` source, but consumed independently. `ue_sim.py`'s
`run_replay()` uses the *timing* artifact to decide when a UE attaches or releases,
but the actual messages it sends are still built by the catalog from the *template*
artifact — replay mode and synthetic mode call the exact same `CATALOG.build()` /
`_attach()` / `_release()` functions; only the schedule driving them differs
(real trace times vs `Walk`/timer-driven synthetic events). The benefit: you can
have realistic message content with synthetic timing (the default), or realistic
timing with built-in default message content (replay mode with no
`lte_templates.json` built), or both real, without the two concerns being coupled
in code. Splitting "when" from "what" is what makes each one independently
optional — a missing `data/lte_templates.json` falls back to defaults
(`LteCatalog.DEFAULT_TEMPLATES`) and the stack still runs; a missing
`data/trace_index.jsonl` just disables replay and the stack runs synthetic-only.

## Express a multi-message procedure as a flow of single-reply steps, not a stateful protocol machine

The transport guarantee is strict: one <span class="glossary-term" data-glossary-id="uplink-downlink" data-glossary-term="Uplink and Downlink" data-glossary-definition="Communication directions between the network and user equipment. Uplink is data sent from the UE to the network; downlink is data travelling from the network to UEs." tabindex="0" role="button">uplink</span>, one reply, synchronously. Rather
than fighting that to build a richer call flow (<span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> setup, security, capability,
context setup, ...), `common/signaling/procedures.py` expresses the whole
procedure as an ordered list of `Step(uplink, downlink, action)` pairs that the UE
walks in order and the DU classifies upon receipt (`catalog.classify()` maps a
received `message_name` straight back to its `Step`). Neither side needs to track
"what state is this UE's RRC connection in" as an explicit state machine — the UE
already knows because it's iterating `CATALOG.attach_flow()` in order, and the DU
derives the right handler purely from which message arrived, not from any stored
per-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> protocol state. This keeps the procedure model symmetric with the transport
model: both are fundamentally request/reply, just composed into a sequence.

## Admission accounting must be done exactly once, even when two attempts overlap

Make-before-break handover means a UE briefly has an admission request in flight
on the target cell while its session is still nominally active on the source cell.
`DU.handle_setup()` calls `_release_ue_other_cells(ue_id, cell.cell_id)` before
granting PRBs on the target — explicitly clearing any session for that `ue_id`
anywhere else in `self.cells` — specifically because the alternative (trusting
that the source side will eventually release) would let a UE be double-counted
against two PRB pools for the whole overlap window. The principle: whenever a
design intentionally creates a window where two code paths might both think they
own a resource for the same logical entity, the side that grants the *second*
claim must actively revoke the first, rather than waiting for eventual cleanup.

## Synchronous per-message round trips keep a proxy free of internal queueing complexity

The RU's `serve_ue()` loop is: receive from the UE, mutate the `_twin` sidecar,
`await F1.request(msg)`, send the reply back. There is no local queue, no
reordering buffer, no batching of multiple UEs' messages before forwarding. This
is only possible because the protocol guarantees exactly one downlink per uplink
(`common/protocol.py`'s docstring states this explicitly), so the RU never has to
decide *when* to flush a partial batch or *how* to reorder out-of-order replies —
`F1Link`'s `txn`-keyed futures already solve the one piece of reordering that
genuinely exists (replies from the DU can return in a different order than many
concurrent UEs sent their requests, because the DU's per-handler work isn't
uniform length). Anywhere a protocol can guarantee strict request/reply pairing,
exploit it: it collapses what would otherwise be a stateful pipeline into a
straight-line `await` chain with no buffering logic to get wrong.

## Let each side compute its own copy of shared physics rather than transmitting a derived decision

The UE does not ask the RU "which <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span> should I be on" — it calls the same
`rf.link_rf()` function the <span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span>'s `compute_rf()` calls, with the same tx power,
frequency, gain, and sector-width parameters (`rsrp_from()` in `ue_sim.py` mirrors
`compute_rf()` in `ru_server.py` field-for-field), and makes its own handover
decision from that. The RU then independently recomputes RF for whatever cell the
UE claims to be on, trusting the UE's chosen cell but not its RF math. Two sides
arriving at the same physical answer from the same formula, computed
independently, is closer to how a real UE and a real network both observe physical
RF rather than one side dictating to the other — and it means the RF model
(`common/rf_model.py`) only has to be written once and is shared as a library
function, not duplicated with subtly different constants on each side.

## A stub that raises clearly is better than a stub that silently degrades

`common/signaling/nr.py`'s `NrCatalog.__init__` raises `NotImplementedError` with
an explicit message pointing at the `RADIO_TECH=lte` fallback, rather than, say,
returning an empty catalog or falling back to LTE silently. Anyone setting
`RADIO_TECH=nr` today gets an immediate, legible failure instead of a stack
running in a half-implemented, confusingly-labeled "5G" mode that's actually still
LTE underneath. Reserved-but-unbuilt extension points should fail loudly at the
point of selection, not produce output that looks plausible but is wrong.
