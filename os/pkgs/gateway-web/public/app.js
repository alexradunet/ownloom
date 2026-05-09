import "/generated/ownloom-admin.js";
import { startApp } from "./js/app.js";

await customElements.whenDefined("ownloom-admin-app");
const app = document.querySelector("ownloom-admin-app");
if (app && "updateComplete" in app) {
  await app.updateComplete;
} else {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

startApp();
