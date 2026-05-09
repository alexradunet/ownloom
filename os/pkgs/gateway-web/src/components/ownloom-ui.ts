import { LitElement, html, nothing } from "lit";

export class OwnloomLightElement extends LitElement {
  protected createRenderRoot() {
    return this;
  }
}

const ICONS: Record<string, ReturnType<typeof html>> = {
  menu: html`<path d="M4 7h16M4 12h16M4 17h16" />`,
  workbench: html`<path d="M5 5h14v14H5z" /><path d="M8 9h8M8 13h5" />`,
  planner: html`<path d="M6 5h12v14H6z" /><path d="M8 3v4M16 3v4M6 9h12M9 13h6" />`,
  memory: html`<path d="M7 6h10v12H7z" /><path d="M9 8h6M9 12h6M9 16h3" />`,
  access: html`<path d="M14 7a4 4 0 1 0-3.5 3.96L7 14.5V17h2.5l.5-.5V15h1.5l2.04-2.04A4 4 0 0 0 14 7Z" /><path d="M14 7h.01" />`,
  shell: html`<path d="m5 8 4 4-4 4" /><path d="M11 16h8" />`,
  trace: html`<path d="M5 19V9" /><path d="M12 19V5" /><path d="M19 19v-7" />`,
  settings: html`<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />`,
  hearth: html`<path d="M12 21c4 0 7-2.7 7-6.4 0-2.4-1.3-4.4-3.6-6.1.2 1.7-.5 2.9-1.6 3.4.1-3.2-1.6-5.8-4.3-8.1.4 3-1.7 4.8-3 6.8A7 7 0 0 0 5 14.6C5 18.3 8 21 12 21Z" />`,
  search: html`<circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" />`,
  notify: html`<path d="M6 16h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v4L6 16Z" /><path d="M10 19h4" />`,
  mesh: html`<path d="M12 5v6l5 3" /><path d="M12 11 7 14" /><circle cx="12" cy="5" r="2" /><circle cx="7" cy="14" r="2" /><circle cx="17" cy="14" r="2" />`,
  send: html`<path d="M4 12 20 4l-6 16-3-7-7-1Z" />`,
  attach: html`<path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7.1-7.1l8-8" />`,
  dataset: html`<path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />`,
  close: html`<path d="M6 6l12 12M18 6 6 18" />`,
};

export class OwnloomIcon extends OwnloomLightElement {
  static properties = {
    name: { reflect: true },
    label: {},
  };

  name = "mesh";
  label = "";

  render() {
    const icon = ICONS[this.name] ?? ICONS.mesh;
    return html`<svg
      class="ownloom-icon inline-block h-[1.25em] w-[1.25em] shrink-0 align-[-0.18em]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden=${this.label ? nothing : "true"}
      role=${this.label ? "img" : nothing}
      aria-label=${this.label || nothing}
    >${icon}</svg>`;
  }
}

export class OwnloomHearth extends OwnloomLightElement {
  static properties = {
    heading: {},
    detail: {},
  };

  heading = "Hearth";
  detail = "Loopback-first, local Ownloom services.";

  render() {
    return html`<footer class="mx-sm mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-xs rounded border border-secondary/30 bg-secondary/10 p-xs text-on-surface" aria-label="Local-first hearth status">
      <span class="h-3 w-3 rounded-sm border border-on-surface/20 bg-secondary shadow-none" aria-hidden="true"></span>
      <p class="m-0 text-sm text-on-surface-variant"><strong class="text-on-surface">${this.heading}</strong><br /><small>${this.detail}</small></p>
    </footer>`;
  }
}

customElements.define("ownloom-icon", OwnloomIcon);
customElements.define("ownloom-hearth", OwnloomHearth);
