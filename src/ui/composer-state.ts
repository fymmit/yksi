import { createSignal } from "solid-js";
import type { TextareaRenderable } from "@opentui/core";
import type { InputHistoryEntry, Session } from "../state";

/** Local drafts and navigation; protocol history remains owned by the controller. */
export function createComposerState(
  session: () => Session,
  editor: () => TextareaRenderable | undefined,
) {
  const [draft, setDraft] = createSignal("");
  const [attachments, setFiles] = createSignal<string[]>([]);
  const drafts = new Map<string, InputHistoryEntry>();
  let historyIndex = -1;
  let savedDraft: InputHistoryEntry = { text: "", attachments: [] };
  let replacementText: string | undefined;
  let revision = 0;
  const text = () => editor()?.plainText ?? draft();
  const replaceDraft = (value: string) => {
    revision++;
    replacementText = value;
    editor()?.setText(value);
    editor()?.gotoBufferEnd();
    setDraft(value);
  };
  const resetHistory = () => {
    historyIndex = -1;
  };
  const setAttachments = (files: string[]) => {
    revision++;
    resetHistory();
    setFiles(files);
  };
  const capture = () => ({
    sessionId: session().id,
    revision,
    text: text(),
    attachments: attachments(),
  });
  return {
    draft,
    text,
    attachments,
    replaceDraft,
    setAttachments,
    resetHistory,
    capture,
    accept(submission: ReturnType<typeof capture>) {
      if (
        session().id !== submission.sessionId ||
        revision !== submission.revision ||
        text() !== submission.text
      )
        return false;
      replaceDraft("");
      setAttachments([]);
      return true;
    },
    contentChanged() {
      const value = text();
      setDraft(value);
      if (value !== replacementText) {
        revision++;
        replacementText = undefined;
        resetHistory();
      }
    },
    switchSession(previousId: string, nextId: string) {
      drafts.set(
        previousId,
        historyIndex === -1 ? { text: text(), attachments: attachments() } : savedDraft,
      );
      const saved = drafts.get(nextId);
      replaceDraft(saved?.text ?? "");
      setAttachments(saved?.attachments ?? []);
    },
    browse(previous: boolean, consume: () => boolean) {
      const current = session();
      const history =
        current.inputHistory ??
        current.items.flatMap(item =>
          item.type === "message" && item.role === "user"
            ? [{ text: item.text, attachments: [] }]
            : [],
        );
      const next = Math.max(-1, Math.min(history.length - 1, historyIndex + (previous ? 1 : -1)));
      if (next === historyIndex) return false;
      if (!consume()) return true;
      if (historyIndex === -1) savedDraft = { text: text(), attachments: attachments() };
      historyIndex = next;
      const entry = next === -1 ? savedDraft : history[history.length - 1 - next]!;
      replaceDraft(entry.text);
      setFiles([...entry.attachments]);
      return true;
    },
  };
}
