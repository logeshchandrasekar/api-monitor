import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Only a component test (jsdom) has a document; the Node tests skip all of this.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");

  afterEach(() => cleanup());

  // jsdom does not implement <dialog> modals. This gives the app's Modal the two methods it calls.
  const dialog = HTMLDialogElement.prototype;
  if (!dialog.showModal) {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!dialog.close) {
    dialog.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }

  // jsdom has no matchMedia or scrollIntoView; some components ask for them
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
}
