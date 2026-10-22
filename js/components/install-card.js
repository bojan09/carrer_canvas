import { h, icon } from "../utils/dom.js";
import { getInstallState, onInstallState, promptInstall, showInstallHelp } from "../pwa/install.js";

const COPY = {
  installed: "CareerCanvas is installed. You are using the app.",
  prompt: "Install CareerCanvas for a full-screen app that opens from your home screen and works offline.",
  ios: "On iPhone and iPad, install from Safari's Share menu.",
  "android-manual": "Add CareerCanvas to your home screen from your browser menu.",
  manual: "Install CareerCanvas from your browser's menu if it supports installing web apps.",
};

/** Renders an install control that reflects what the current browser can really do. */
export function mountInstallCard(container) {
  const status = h("p", { class: "install-card__status" });
  const actions = h("div", { class: "install-card__actions" });
  container.replaceChildren(status, actions);

  function render(state = getInstallState()) {
    status.innerHTML = state.kind === "installed" ? icon("check") : icon("download");
    status.append(h("span", { text: COPY[state.kind] }));
    actions.replaceChildren();
    if (state.kind === "prompt") {
      actions.append(h("button", { type: "button", class: "btn btn--primary", onclick: () => promptInstall(), text: "Install app" }));
    } else if (state.kind !== "installed") {
      const label = state.kind === "ios" ? "How to install on iPhone / iPad" : "How to install";
      actions.append(
        h("button", { type: "button", class: "btn btn--outline", onclick: () => showInstallHelp(state.kind), text: label }),
      );
    }
  }

  render();
  return onInstallState(render);
}
