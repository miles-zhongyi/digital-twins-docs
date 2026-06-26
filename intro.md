# Digital Twins Project

Documentation for the Digital Twins monorepo: two complementary digital
twins of a cellular radio network, built to test capacity and protocol
behavior without real towers, spectrum, or subscribers.

- **[poc_StressTest](poc_stresstest/overview.md)** — a lightweight,
  large-scale software twin (DU/RU cluster + asyncio UE simulator) for
  capacity and admission-control stress testing.
- **[srsTwin](srstwin/overview.md)** — a high-fidelity twin built from real
  open-source cellular software (srsRAN_4G and srsRAN-Project/Open5GS) for
  protocol-exact validation, with a 4G LTE twin and a separate 5G SA /
  signaling-storm twin.
- **[How they relate](comparison.md)** — the fidelity-vs-scale trade-off
  both projects sit on opposite ends of, and how they're meant to be used
  together.

Use the table of contents to navigate.
