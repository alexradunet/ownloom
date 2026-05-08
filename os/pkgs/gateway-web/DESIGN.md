# Ownloom Cockpit Design Guideline

Ownloom Cockpit is a private, local-first operator surface for Alex and his AI system. It should feel like a calm command center for context, planning, chat, and infrastructure — not like a generic SaaS dashboard.

## Design direction: calm sovereign cockpit

Ownloom is about owned context, personal continuity, and inspectable automation.

The UI should communicate:

- **Sovereignty** — local-first, private, tunnel/loopback-oriented, no external assets.
- **Calm** — low-noise, focused, no gamified dopamine UI.
- **Capability** — chat, planner, config, logs, and terminal are all first-class.
- **Continuity** — sessions, reminders, wiki memory, and agent work feel connected.
- **Inspectability** — the user can see system state, logs, tokens, and boundaries clearly.

A useful internal phrase: **Own your context.** Use it sparingly; the product should prove it through clarity and control.

## Ownloom palette

Ownloom uses its own identity: **dark ink + teal thread + amber loomlight**.

- **Dark ink**: the private local workspace, terminal depth, quiet control.
- **Teal thread**: active context, primary action, connection, agent continuity.
- **Amber loomlight**: focus, attention, human review, warmth.
- **Moss**: healthy/connected/done states.
- **Ember**: destructive or error states.

This should feel distinct from Nord, Catppuccin, generic VS Code themes, and SaaS dashboards. Borrow the discipline of those palettes, not their exact look.

## Visual metaphor

Ownloom suggests threads, weaving, memory, and durable structure. Use this subtly:

- thin line accents
- connected status chips
- timeline/thread-like separators
- layered panels that feel woven together
- clear “current thread/session” emphasis

Avoid literal loom illustrations, mascots, busy decorative patterns, or cyberpunk styling.

## Principles

1. **State first** — connection, offline/PWA state, current session, agent-running state, terminal-token state, and destructive-action state must be visible and textual.
2. **Content before chrome** — chat, planner context, actions, and logs matter more than decoration.
3. **One primary action per area** — avoid competing accent buttons.
4. **Advanced areas stay honest** — Config, Terminal, and Log are operator tools; make them clear, not hidden or cute.
5. **Reviewable mutation** — destructive actions need explicit labels, danger styling, and confirmation.
6. **Native controls first** — use semantic HTML and browser behavior before custom widgets.
7. **Motion explains** — animation should clarify feedback/state changes, not decorate.
8. **No stale truth** — never present cached API/planner/terminal data as current.

## Token architecture

Use CSS custom properties only. No token JSON, build step, framework, Tailwind, or generated utilities.

Tokens live in `public/styles/tokens.css` and should be organized as comments/sections:

1. **Primitive tokens** — raw palette, spacing, radius, typography, shadows, motion.
2. **Semantic tokens** — UI roles like background, surface, text, border, accent, danger, focus.
3. **Component tokens** — repeated roles for buttons, cards, chips, messages, inputs.

Keep existing token names working when refactoring so incremental changes remain safe.

## Color

Default theme is dark/operator mode. Light mode can come later via semantic token remapping.

Preferred direction:

- dark neutral canvas
- layered blue/ink surfaces
- cool teal/cyan accent for primary action
- warm amber/yellow focus and attention
- semantic green/amber/red states

Rules:

- Normal text contrast: WCAG AA 4.5:1 minimum.
- Large text and UI boundaries/states: 3:1 minimum.
- State cannot rely on color alone; pair color with text labels.
- Avoid heavy glassmorphism or gradients behind text.
- No remote images, fonts, icons, or decorative network assets.

## Typography

Use system fonts. Do not import remote fonts.

Guidelines:

- Body: readable `1rem` base, line-height around `1.5`.
- Labels/meta: compact but readable; do not make operational controls tiny.
- Logs/tokens/technical snippets: monospace system stack.
- Avoid fixed-height text containers except deliberate scroll regions like chat log, event log, and terminal iframe.

## Spacing and shape

Use a simple 4px/8px-friendly rhythm.

- Controls should target about 44px height where practical.
- Cards should be spacious enough to scan but compact enough for daily operator use.
- Rounded surfaces are good; avoid over-soft “consumer toy” shapes.
- Prefer border + surface contrast + subtle shadow over dramatic elevation.

## Motion

Motion should be short, purposeful, and optional.

Recommended use:

- hover/focus/press feedback
- tab/panel transition
- new message entry
- one-shot status change feedback
- loading state only when paired with text/`aria-busy`

Rules:

- Animate `opacity` and `transform` where possible.
- Avoid parallax, animated backgrounds, bouncing, and decorative loops.
- Respect `prefers-reduced-motion`; reduced motion should remove meaningful animation.
- Never require motion to understand state.

## Components

### Header

The header should quickly answer:

- Where am I? Ownloom Cockpit.
- What is this? Local operator hub.
- Is it connected/offline? Status chips.

A small “loopback/tunnel only” cue is acceptable if it does not clutter mobile.

### Tabs

Preserve the native ARIA tab structure. Active state should differ by more than color: use fill, border/underline, and text contrast.

Primary sections should feel more important than advanced operator sections, but the current simple top tabs are acceptable.

### Cards

Cards are major surfaces, not decoration. Use them for meaningful grouping:

- chat composer/log
- sessions
- today/upcoming planner context
- config/client/delivery groups
- terminal/log panels

### Buttons

Use clear variants:

- primary: main action in an area
- secondary: neutral action
- ghost: low emphasis, if needed
- danger: delete/revoke/reset/forget
- small: repeated list actions

Destructive actions still require confirmation.

### Chips and pills

Use for status, identity, scope, and source:

- connected/offline/error
- web-main/current session
- config-managed/paired browser
- WhatsApp/web/local

Every chip must contain readable text; color is reinforcement.

### Chat

Chat is the main working surface.

- user messages right, agent/system left
- preserve `role="log"` and polite live updates
- keep message bubbles readable at long lengths
- attachments stay explicit and one-shot
- do not switch sessions while an agent run is active

### Organizer

Organizer is planner-backed, not wiki-task-backed.

Until the planner API is designed, show honest placeholders for:

- Today
- Upcoming
- Reminders/events

Copy should mention Ownloom Planner / CalDAV / iCalendar, not Markdown task pages.

### Config

Config should be clear and slightly more “operator” in tone.

- pairing creates a full-operator runtime client
- token storage depends on Remember locally
- revoke/delete/forget use danger styling
- do not echo tokens into logs or normal text

### Terminal

Terminal is powerful and advanced.

- keep loopback-only copy visible
- lazy-load iframe only on the Terminal tab
- token copy should be local and short-lived
- do not broaden frame/proxy/security assumptions

### Log

Log is local trace, not durable memory.

- monospace
- compact
- readable wrapping
- no token echoing beyond existing redaction assumptions

## Accessibility

Accessibility is part of the visual system.

- Keep semantic HTML first.
- Preserve skip link.
- Preserve ARIA tabs and keyboard support.
- Every interactive element needs visible `:focus-visible` styling.
- No color-only state.
- Respect reduced motion and forced-colors/high-contrast modes.
- Test 200% zoom and 320px width.
- Prefer text buttons over icon-only controls.
- Live regions should be polite and not noisy.

## Responsive behavior

- Keep the shell around 1200px max width.
- Desktop: chat + side session column works well.
- Mobile/tablet: stack grids and settings controls.
- Tabs may scroll horizontally.
- The page should not horizontally scroll except terminal/log/code-like content when unavoidable.
- Header status wraps above tabs.
- Button rows wrap cleanly; narrow cards may stack actions.

## Security and PWA design boundaries

Design work must not weaken the operator security model.

- No external scripts/styles/fonts/icons.
- No inline scripts/styles that conflict with CSP.
- No broadening of `connect-src`, `frame-src`, or loopback assumptions without explicit approval.
- Service worker caches static shell only.
- Never cache API, planner, terminal, token, Authorization, WebSocket, or operator-data responses.
- Offline mode is a static shell only; live actions should fail honestly.

## Implementation order

1. Refine tokens additively.
2. Improve base controls, focus, typography, and reduced-motion coverage.
3. Polish cards, tabs, buttons, chips, messages, lists, terminal, and log.
4. Refresh static copy/classes in `index.html` without changing required IDs/data attributes.
5. Add dynamic button/status variants in JS only where needed.
6. Update smoke checks only for intentional changed strings/files/selectors.
7. Validate with JS checks, Nix builds, keyboard-only pass, contrast pass, reduced-motion pass, and mobile/zoom checks.

## Non-goals for now

- No framework.
- No build step.
- No Tailwind.
- No remote design assets.
- No custom animation engine.
- No live Organizer data until planner API shape is designed.
- No theme marketplace or large design-system process.
