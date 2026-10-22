/** Platform detection used for install guidance. Feature checks are preferred;
 *  UA sniffing is limited to iOS, where no install prompt API exists. */

const ua = navigator.userAgent || "";

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/** iOS browsers other than Safari (Chrome, Firefox, Edge, ...) */
export const isIOSThirdParty = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

export function canUseServiceWorker() {
  return "serviceWorker" in navigator && (window.isSecureContext || location.hostname === "localhost");
}
