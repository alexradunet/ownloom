---
layout: home

hero:
  name: NixPI
  text: Pi-native AI companion OS on NixOS
  tagline: A self-hosted, inspectable operating model for one-person AI computing. NixPI combines NixOS, a persistent agent runtime, file-native memory, and a local-only web chat into a machine you can actually operate and evolve.
  image:
    src: /nixpi-mark.svg
    alt: NixPI
  actions:
    - theme: brand
      text: Start Here
      link: /why-nixpi
    - theme: alt
      text: Install
      link: /install
    - theme: alt
      text: Read the Docs
      link: /getting-started/

features:
  - title: Inspectable by design
    details: Durable memory, system workflows, and operating surfaces stay rooted in files, Markdown, NixOS, and systemd instead of opaque hosted abstractions.
  - title: Built for one operator
    details: NixPI is opinionated around a single-user machine that acts like a personal assistant, knowledge system, and controlled automation surface.
  - title: AI lives inside the system
    details: Pi is not just a browser session. The runtime includes a local web chat, a resident daemon, host integrations, and first-class OS workflows.
  - title: Minimal default surface
    details: The base stays deliberately small so the operator can evolve the machine through Pi without inheriting a large fixed platform.
---

<PresentationBand
  eyebrow="Project shape"
  title="A presentation site on top of the real documentation"
  lede="This site now serves two audiences at once: people evaluating the idea of an AI-first operating system, and maintainers who need the technical truth. The product story leads; the docs remain intact underneath."
>

<div class="signal-grid">
  <div class="signal-card">
    <strong>Presentation first</strong>
    Use this front page and <a href="./why-nixpi">Why NixPI</a> to understand the thesis, capability shape, and what makes the project distinct.
  </div>
  <div class="signal-card">
    <strong>Documentation preserved</strong>
    The existing architecture, operations, codebase, and reference sections remain the maintained technical source of truth.
  </div>
  <div class="signal-card">
    <strong>Install path included</strong>
    Public visitors can move directly from concept to a runnable system through the new <a href="./install">Install</a> path.
  </div>
  <div class="signal-card">
    <strong>Warm technical language</strong>
    The site favors an editorial, systems-oriented visual language over generic developer-docs chrome or flashy AI branding.
  </div>
</div>

</PresentationBand>

<SectionHeading
  label="What ships today"
  title="The project already spans provisioning, runtime, memory, and service surface"
  lede="NixPI is more than a set of prompts or scripts. It already behaves like a small operating environment designed around a durable assistant."
/>

| Subsystem | What it contributes |
| --- | --- |
| NixOS foundation | Reproducible machine state, modules, packaging, and deployment workflow |
| Local runtime daemon | Persistent Pi runtime with scheduling, routing, and multi-agent support |
| Memory model | Markdown-native durable memory and append-only episodes |
| Built-in services | Pi Web Chat and the local runtime surface around it |
| First-boot workflow | Installer path plus operator-guided setup and persona completion |

<PresentationBand
  eyebrow="Explore"
  title="Choose the right entry point"
  lede="The fastest way through the project depends on whether you are evaluating the idea, trying the system, or maintaining the code."
>

- Read [Why NixPI](./why-nixpi) for the thesis and operating model.
- Open [Install](./install) for the shortest path to a running system.
- Use [Getting Started](./getting-started/) for the maintainer path.
- Jump to [Architecture](./architecture/) or [Reference](./reference/) for technical depth.

</PresentationBand>
