import { defaultTextareaKeyBindings, type KeyEvent } from "@opentui/core";
import { matchesKey } from "../keybindings";

/** Consume before focused widgets or other global handlers see the event. */
export function consumeKey(key: KeyEvent, repeat = false) {
  key.preventDefault();
  key.stopPropagation();
  return key.eventType !== "release" && (repeat || (!key.repeated && key.eventType !== "repeat"));
}

/** OpenTUI merges widget bindings with defaults. Managed actions must not fall
 * through to those defaults after being rebound or disabled. Other editing
 * shortcuts keep their native behavior. Call after matching configured actions. */
export function suppressEditorFallback(key: KeyEvent, cursor = false) {
  if (
    defaultTextareaKeyBindings.some(
      binding =>
        (binding.action === "submit" ||
          binding.action === "newline" ||
          (cursor && (binding.action === "move-left" || binding.action === "move-right"))) &&
        matchesKey(key, binding),
    )
  ) {
    consumeKey(key);
  }
}
