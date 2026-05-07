const statusPhrases = [
  "weaving today’s thread",
  "checking loose knots",
  "aligning memory and planner",
  "holding context privately",
  "waiting for the next thread",
];

const status = document.querySelector(".status-pill");
let phraseIndex = 0;

if (status) {
  const pulse = status.querySelector(".pulse");
  window.setInterval(() => {
    phraseIndex = (phraseIndex + 1) % statusPhrases.length;
    status.replaceChildren(pulse, document.createTextNode(statusPhrases[phraseIndex]));
  }, 3600);
}

const loomCard = document.querySelector(".loom-card");

if (loomCard && window.matchMedia("(pointer: fine)").matches) {
  loomCard.addEventListener("pointermove", (event) => {
    const rect = loomCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    loomCard.style.setProperty("--tilt-x", `${x * 7}deg`);
    loomCard.style.setProperty("--tilt-y", `${y * -7}deg`);
  });

  loomCard.addEventListener("pointerleave", () => {
    loomCard.style.setProperty("--tilt-x", "0deg");
    loomCard.style.setProperty("--tilt-y", "0deg");
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.14 },
);

for (const [index, element] of document
  .querySelectorAll(".feature-card, .step, .principle-list article, .system-card")
  .entries()) {
  element.classList.add("reveal");
  element.style.transitionDelay = `${Math.min(index % 6, 5) * 70}ms`;
  observer.observe(element);
}
