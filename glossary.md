# Glossary

Telecom and project terms used across this book. Marked terms in the
documentation appear in **blue** (light theme) or **light blue** (dark theme)
— hover or click for a definition. Within each paragraph, a term is
highlighted on its **1st** occurrence, then again after skipping the next **2**,
then after skipping **4**, then **8**, and so on (doubling). This page lists
the full definitions.

```{raw} html
<div class="glossary-index">
```

## A–C

**ASN.1**
: Schema language for telecom messages — defines message structures, fields,
  mandatory/optional elements, choices, and value types.

**ASN.1 Wrapper**
: Message body wrapped inside `UL-DCCH-Message` → `message` → `c1`.

**C-Plane (Control Plane)**
: Planning and instructions plane; does not carry user data. Receives scheduling
  from the DU and tells the RU what to modulate/demodulate.

**Cell**
: One carrier on one sector of a base station — a single coverage unit defined by
  frequency and physical cell ID.

**CSL**
: Call/session log with KPI-level granularity (RSRP, durations, session info),
  lower detail than TrC.

## D–I

**DU (Distributed Unit)**
: Lower real-time baseband (RLC, MAC, high-PHY scheduling) in an O-RAN split.

**CU (Centralized Unit)**
: Higher layers (PDCP/RRC), connected to DU over F1.

**DPDK**
: Data Plane Development Kit — high-throughput userspace networking for U-Plane.

**eCPRI**
: Enhanced Common Public Radio Interface — packages IQ samples into ethernet
  frames for RU–DU fronthaul.

**eNB**
: Evolved Node B — 4G LTE base station.

**EPC**
: Evolved Packet Core — 4G core (MME, SGW, PGW, HSS).

**Fronthaul Interface**
: Connection between RU and DU carrying IQ and low-level radio data.

**GNU Radio broker**
: Pipeline summing UE uplinks into gNB RX and fanning gNB downlink to all UEs.

**HSS**
: Home Subscriber Server — 4G subscriber database (IMSI, Ki, OPc, APN, QoS).

**HSS/UDM provisioning**
: Adding subscriber records into the network database.

**IMSI**
: International Mobile Subscriber Identity — unique SIM/subscriber identifier.

**IQ samples**
: Complex in-phase/quadrature digital representation of a radio waveform.

## K–P

**Ki**
: Secret authentication key in SIM and operator database.

**Markov model**
: Memoryless procedure-sequence model built from TrC transition probabilities.

**MME**
: Mobility Management Entity — 4G core attach/auth/bearer control.

**Modulation**
: Encoding bits onto a carrier by varying amplitude and phase.

**NAS**
: Non-Access Stratum — UE-to-core attach and session management.

**NRCSL / SANRCSL**
: NR call/session log types for NSA and SA deployment modes.

**OAI**
: Open Air Interface — open-source 4G/5G access network stack.

**OFDM**
: Orthogonal Frequency Division Multiplexing — parallel narrow sub-carriers.

**OPc**
: Operator auth value for Milenage authentication.

**PER encoding**
: Packed Encoding Rules — compact ASN.1 binary encoding for RRC/NAS.

**PHY**
: Physical layer — OFDM, modulation, channel coding to IQ samples.

**PLMN**
: Public Land Mobile Network — operator identity via MCC/MNC (e.g. 302/221 TELUS).

**PRB**
: Physical Resource Block — scheduler allocation unit on the time-frequency grid.

**Pycrate**
: Python ASN.1 toolkit for validating reconstructed RRC message structures.

## R–Z

**RACH**
: Random Access Channel — initial UE access procedure to a cell.

**RNTI**
: Radio Network Temporary Identifier — 16-bit UE tag on the radio.

**RRC**
: Radio Resource Control — UE-to-base-station connection and bearer control.

**RU (Radio Unit)**
: Antenna/RF front-end converting between air interface and digital IQ.

**S1AP**
: S1 Application Protocol — eNB-to-MME control plane in 4G.

**SDR**
: Software-defined radio — programmable RF hardware.

**SIMCredentials**
: IMSI, Ki, OP/OPc, and algorithm needed for attach authentication.

**srsEPC**
: srsRAN simplified 4G core (MME, SGW, PGW, HSS).

**TrC**
: Trace record with per-message signaling detail for a session.

**TX / RX streams**
: Continuous IQ sample flows; UE TX reaches gNB RX and vice versa.

**UDM**
: Unified Data Management — 5G subscriber database (HSS equivalent).

**UE**
: User Equipment — the mobile device.

**UL-CCCH-Message**
: Uplink common control RRC container before dedicated connection exists.

**UL-DCCH-Message**
: Uplink dedicated control RRC container after dedicated connection begins.

**U-Plane (User Plane)**
: Pipeline carrying actual user payload as IQ samples.

**Uplink / Downlink**
: UE→network vs network→UE traffic directions.

**Webhook Endpoints**
: Server URLs called automatically on events (push instead of poll).

**ZMQ IQ**
: Simulated radio link exchanging IQ samples over ZeroMQ sockets.

**ZMQ RF driver**
: Fake RF driver piping IQ over ZMQ instead of SDR hardware.

**3GPP**
: Standards body defining cellular protocols implemented by srsRAN/OCUDU.

```{raw} html
</div>
```

See also: [4G Structure and Implementation](srstwin/structure_and_implementation.md).
