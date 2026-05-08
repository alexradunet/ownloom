export function createTabController({ buttons, panels, initialTab = "chat", onSelect = () => {}, onPersist = () => {} }) {
  const knownTabs = new Set(panels.map((panel) => panel.dataset.tabPanel));

  function select(tab, { focus = false } = {}) {
    const nextTab = knownTabs.has(tab) ? tab : "chat";
    let activeButton = null;

    for (const button of buttons) {
      const active = button.dataset.tabTarget === nextTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
      if (active) activeButton = button;
    }

    for (const panel of panels) {
      const active = panel.dataset.tabPanel === nextTab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    }

    onPersist(nextTab);
    onSelect(nextTab);
    if (focus) activeButton?.focus();
  }

  function selectByOffset(currentButton, offset) {
    const currentIndex = buttons.indexOf(currentButton);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + offset + buttons.length) % buttons.length;
    select(buttons[nextIndex].dataset.tabTarget, { focus: true });
  }

  for (const button of buttons) {
    button.addEventListener("click", () => select(button.dataset.tabTarget));
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        selectByOffset(button, -1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        selectByOffset(button, 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        select(buttons[0].dataset.tabTarget, { focus: true });
      } else if (event.key === "End") {
        event.preventDefault();
        select(buttons[buttons.length - 1].dataset.tabTarget, { focus: true });
      }
    });
  }

  select(initialTab);
  return { select };
}
