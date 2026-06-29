# Digital Twins Project

Documentation for the Digital Twins monorepo: two complementary digital
twins of a cellular radio network, built to test capacity and protocol
behavior without real towers, spectrum, or subscribers.

- **[Glossary](glossary.md)** — telecom and project terms (highlighted
  throughout the book; hover or click for definitions).
- **[poc_StressTest](poc_stresstest/overview.md)** — a lightweight,
  large-scale software twin (<span class="glossary-term" data-glossary-id="du" data-glossary-term="DU" data-glossary-definition="Distributed Unit — runs lower real-time layers (RLC, MAC, high-PHY scheduling) in an O-RAN split. A software DU runs on general-purpose servers; non-real-time simulation DUs can be time-dilated, real-time DUs driving real fronthaul cannot." tabindex="0" role="button">DU</span>/<span class="glossary-term" data-glossary-id="ru" data-glossary-term="RU" data-glossary-definition="Radio Unit — the physical antenna that talks directly with UEs. It converts analog RF to digital IQ samples and forwards them to the DU over ethernet, and modulates/demodulates U-Plane data per DU instructions." tabindex="0" role="button">RU</span> cluster + asyncio <span class="glossary-term" data-glossary-id="ue" data-glossary-term="UE" data-glossary-definition="User Equipment — the mobile device (phone/modem) that attaches to the cellular network." tabindex="0" role="button">UE</span> simulator) for
  capacity and admission-control stress testing.
- **[srsTwin](srstwin/overview.md)** — a high-fidelity twin built from real
  open-source cellular software (srsRAN_4G and srsRAN-Project/Open5GS) for
  protocol-exact validation, with a 4G LTE twin and a separate 5G SA /
  signaling-storm twin.
- **[How they relate](comparison.md)** — the fidelity-vs-scale trade-off
  both projects sit on opposite ends of, and how they're meant to be used
  together.

Use the table of contents to navigate.
