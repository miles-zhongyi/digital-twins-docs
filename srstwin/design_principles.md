# Design Principles

These are patterns that recur across both srsTwin stacks (4G and 5G SA) and
are worth carrying into future work on either one.

## 1. Inject realism surgically; don't rebuild the stack to get it

The 4G twin's trace-identity injection doesn't reimplement <span class="glossary-term" data-glossary-id="rrc" data-glossary-term="RRC" data-glossary-definition="Radio Resource Control — Layer 3 protocol between UE and base station for connection setup, mobility, and bearer configuration." tabindex="0" role="button">RRC</span> message
construction to insert real subscriber data — it exports two environment
variables (`RRC_TRACE_LTE_M_TMSI`, `RRC_TRACE_LTE_CAUSE`) that `srsue`'s
existing RRC Connection Request builder reads via a single `std::getenv()`
call, falling back to its own synthetic defaults if they're unset. The
smallest change that makes the live signaling traceable to a real captured
subscriber is the right one — it leaves the rest of a large, real,
upstream-tracked codebase untouched, which is exactly what you want when
the codebase is something you don't want to fork in spirit, only patch
surgically.

## 2. Always preserve a verified baseline, and enforce it with a test, not a memory

Two unrelated parts of this project independently arrived at the same
mechanism. The 5G hub treats an all-default RF channel as the *identity*
operation and skips registering it entirely — so an `ideal`-profile storm
produces bit-identical IQ to the originally verified 1-<span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span>/2-UE link, by
construction, not by care. The paused 4G `realizer/` plan does the same
thing at the architecture-decision level: before any multi-UE code lands,
it captures the current N=1 attach sequence as a frozen baseline
(`baselines/n1_attach_baseline.json`) and ships a diff tool
(`check_n1_baseline.py`) that's meant to gate every subsequent milestone —
explicitly documented as "a hard gate, not a nice-to-have." When you're
generalizing something from N=1 to N, the N=1 case regressing silently is
the most likely way the change goes wrong; make that case a executable
check, not a thing you remember to eyeball.

## 3. When a real protocol stack hits a structural scaling wall, don't approximate the stack — separate the concern that needs scale from the concern that needs fidelity

Both stacks hit the same wall (one shared ZMQ lockstep clock, slowing
roughly linearly with UE count, not CPU-bound) and both refused to fix it
by making the real stack "a little less real." The 5G twin keeps a small
real-<span class="glossary-term" data-glossary-id="phy" data-glossary-term="PHY" data-glossary-definition="Physical layer — OFDM, modulation, and channel coding into IQ samples. A real DU must eventually demodulate IQ samples; PHY cannot be skipped entirely." tabindex="0" role="button">PHY</span> pool for protocol validation and adds a *completely separate*
PHY-abstract layer (UERANSIM) purely for the concern that actually needs
scale — core-network signaling load. The 4G twin's measured 3-UE
contention numbers exist *because* it chose to keep three pairs fully real
rather than fake the third one. If you find yourself tempted to strip
fidelity out of a real stack to make it scale, that's usually a sign the
scale requirement belongs in a different layer entirely, not a reason to
compromise the stack you already trust.

## 4. The thing observing health must not depend on the thing it's observing

`container_status_4g()` asks Docker directly (`docker inspect`) whether a
container is running, rather than inferring liveness from log activity —
specifically because srsRAN's own file logger buffers and can lag real
activity by a noticeable margin. If your only signal that something is
broken comes from the same channel that breaks when things go wrong, you'll
find out late. Keep at least one observability path that's structurally
independent of the subsystem it's watching.

## 5. Never let a poller wait on work it didn't ask for

The 4G dashboard's `/api/data` endpoint is polled every 5 seconds by
however many browser tabs happen to be open. The naive design — every
request triggers its own fresh pull-and-parse — works fine until one
rebuild takes longer than the poll interval, at which point requests queue
behind each other and latency climbs without bound (this happened in
practice). The fix generalizes beyond this dashboard: for any
multi-consumer polling endpoint backed by nontrivial work, decide up front
that a consumer either gets the last known-good result instantly, or is the
one thread that pays to refresh it — never both lock-step blocked on the
same slow path. A short debounce window plus a non-blocking lock check
(serve cache if a refresh is already in flight) is enough; it doesn't need
a queue or a background scheduler.

## 6. Decouple "how many things happen" from "how many run at once"

The signaling storm's `total_arrivals` (events over the storm's duration)
is independent of `pool_size` (concurrent execution slots) — arrivals that
outrun the pool simply queue, and that queueing *is* the admission-control
behavior the storm exists to study, not an implementation limitation to
hide. The same pattern is worth reaching for anywhere you're simulating a
population larger than you can afford to run concurrently: don't make the
population size and the concurrency limit the same knob, and treat the gap
between "wants to start" and "actually started" as a first-class, measured
quantity rather than noise.

## 7. Before an invasive low-level change, write the risk register before the code

The `realizer/` plan's `PLAN.md` lists concrete, specific risks for hosting
N UE contexts on one shared PHY worker — grant misrouting between UEs
sharing one dispatch layer, per-UE RA timers colliding, PDCCH blind-search
budget degrading silently at higher N, the per-TTI real-time deadline being
missed and desyncing the whole <span class="glossary-term" data-glossary-id="cell" data-glossary-term="Cell" data-glossary-definition="One carrier on one sector of a base station — a single radio coverage unit defined by frequency and physical cell ID. Multi-UE on one cell means many UEs contending on that single virtual cell." tabindex="0" role="button">cell</span>, <span class="glossary-term" data-glossary-id="harq" data-glossary-term="HARQ" data-glossary-definition="Hybrid Automatic Repeat Request — L1/L2 retransmission mechanism whose timing RRC procedures depend on." tabindex="0" role="button">HARQ</span> soft-buffer memory scaling with
N — each paired with a specific mitigation (a unit test, a metric to track
from a specific milestone, a hard gate). None of this required writing any
of the actual multi-UE code first. For changes this close to a hard
real-time boundary, the design discipline that matters most is naming the
specific ways it can fail before deciding how to build it, not after.
