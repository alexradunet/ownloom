import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

class OwnloomLightElement extends LitElement {
  protected createRenderRoot() {
    return this;
  }
}

@customElement("ownloom-lit-button")
export class OwnloomLitButton extends OwnloomLightElement {
  @property({ reflect: true }) variant: "primary" | "secondary" = "primary";
  @property() label = "Action";

  render() {
    const variantClass =
      this.variant === "secondary"
        ? "border-accent/60 bg-secondary text-secondary-foreground hover:bg-accent/10 hover:text-foreground"
        : "border-primary bg-primary text-primary-foreground hover:bg-primary/90";

    return html`<button
      type="button"
      class="inline-flex items-center justify-center gap-ds-xs rounded-[var(--radius)] border px-ds-sm py-ds-xs font-mono text-[12px] font-medium uppercase tracking-[0.05em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variantClass}"
    >
      ${this.label}
    </button>`;
  }
}

@customElement("ownloom-lit-chip")
export class OwnloomLitChip extends OwnloomLightElement {
  @property({ reflect: true }) tone: "thread" | "hearth" | "system" = "thread";
  @property() label = "Chip";

  render() {
    const toneClass = {
      thread: "border-primary/40 bg-primary/20 text-primary-foreground",
      hearth: "border-accent/40 bg-hearth text-hearth-foreground",
      system: "border-hearth/40 bg-hearth/60 text-hearth-foreground",
    }[this.tone];

    return html`<span
      class="inline-flex w-fit items-center gap-ds-base rounded-[var(--radius)] border px-ds-xs py-ds-base font-mono text-[12px] leading-none tracking-[0.02em] ${toneClass}"
    >
      ${this.label}
    </span>`;
  }
}

@customElement("ownloom-lit-card")
export class OwnloomLitCard extends OwnloomLightElement {
  @property() kicker = "Pattern";
  @property() heading = "Digital Scoarță card";
  @property() description = "Flat tonal layer, 1px structural border, 4px rhythm, and pixel-stitch detail.";

  render() {
    return html`<article
      class="lit-stitch lit-notch relative grid gap-ds-sm rounded-[var(--radius)] border border-border bg-card p-ds-md text-card-foreground shadow-none"
    >
      <header class="grid gap-ds-base">
        <small class="font-mono text-[12px] font-medium uppercase tracking-[0.05em] text-accent">${this.kicker}</small>
        <h2 class="m-0 font-serif text-[28px] leading-tight text-foreground">${this.heading}</h2>
      </header>
      <p class="m-0 max-w-[62ch] text-[16px] leading-relaxed text-muted-foreground">${this.description}</p>
      <div class="flex flex-wrap gap-ds-xs">
        <ownloom-lit-chip tone="thread" label="Digital Scoarță"></ownloom-lit-chip>
        <ownloom-lit-chip tone="hearth" label="Tailwind v4 tokens"></ownloom-lit-chip>
        <ownloom-lit-chip tone="system" label="Static runtime"></ownloom-lit-chip>
      </div>
    </article>`;
  }
}

@customElement("ownloom-lit-message")
export class OwnloomLitMessage extends OwnloomLightElement {
  @property({ reflect: true }) role: "user" | "assistant" | "system" = "assistant";
  @property() label = "Ownloom";
  @property() content = "Message content.";

  render() {
    const roleClass = {
      user: "ml-auto border-primary/40 bg-[var(--ds-on-primary)] text-primary-foreground",
      assistant: "border-border bg-card text-card-foreground",
      system: "max-w-full border-hearth/40 bg-terminal text-muted-foreground",
    }[this.role];

    return html`<div class="grid max-w-[38rem] gap-ds-base rounded-[var(--radius)] border px-ds-sm py-ds-xs shadow-none ${roleClass}">
      <small class="font-mono text-[12px] uppercase tracking-[0.05em] text-accent">${this.label}</small>
      <p class="m-0 whitespace-pre-wrap text-[15px] leading-relaxed">${this.content}</p>
    </div>`;
  }
}

@customElement("ownloom-lit-rail-item")
export class OwnloomLitRailItem extends OwnloomLightElement {
  @property() label = "Shared substrate";
  @property() detail = "Ownloom CLI";
  @property({ type: Boolean, reflect: true }) active = false;

  render() {
    return html`<a
      href="#"
      class="group grid gap-ds-base rounded-[var(--radius)] border px-ds-sm py-ds-xs no-underline shadow-none transition-colors ${this.active
        ? "border-accent/70 bg-accent/10 text-foreground"
        : "border-border bg-muted/70 text-muted-foreground hover:border-accent/50 hover:bg-accent/10 hover:text-foreground"}"
      @click=${(event: Event) => event.preventDefault()}
    >
      <span class="font-mono text-[12px] uppercase tracking-[0.05em] text-accent">${this.label}</span>
      <span class="text-[15px] leading-snug">${this.detail}</span>
      ${this.active ? html`<span class="font-mono text-[11px] uppercase tracking-[0.05em] text-hearth-foreground">active mode</span>` : nothing}
    </a>`;
  }
}

@customElement("ownloom-lit-catalog")
export class OwnloomLitCatalog extends OwnloomLightElement {
  render() {
    return html`<section class="grid gap-ds-md">
      <ownloom-lit-card
        kicker="Build-time island"
        heading="mini-lit/Lit + Tailwind bridge"
        description="This catalog-only island proves the future Ownloom Web component pattern while the live cockpit keeps its stable Pico/static baseline."
      ></ownloom-lit-card>

      <div class="grid gap-ds-sm rounded-[var(--radius)] border border-border bg-muted p-ds-md md:grid-cols-[1fr_18rem]">
        <section class="grid gap-ds-sm">
          <div class="flex flex-wrap gap-ds-xs">
            <ownloom-lit-button label="Primary action"></ownloom-lit-button>
            <ownloom-lit-button variant="secondary" label="Secondary action"></ownloom-lit-button>
          </div>
          <div class="grid gap-ds-xs">
            <ownloom-lit-message role="user" label="Alex" content="Use Ownloom Web for personal mode."></ownloom-lit-message>
            <ownloom-lit-message label="Ownloom" content="Keep the gateway as canonical runtime and share skills with the terminal agent."></ownloom-lit-message>
            <ownloom-lit-message role="system" label="Hearth" content="Loopback-only. Static assets. CSP-compatible."></ownloom-lit-message>
          </div>
        </section>
        <aside class="grid content-start gap-ds-xs">
          <ownloom-lit-rail-item active label="Personal" detail="Ownloom Web chat and planner surface"></ownloom-lit-rail-item>
          <ownloom-lit-rail-item label="Operator" detail="Zellij terminal with Pi coding agent"></ownloom-lit-rail-item>
          <ownloom-lit-rail-item label="Common" detail="ownloom-context, wiki, planner, skills"></ownloom-lit-rail-item>
        </aside>
      </div>
    </section>`;
  }
}
