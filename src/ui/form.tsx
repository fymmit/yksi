import { createSignal, For, Show, untrack } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import type { ElicitationSchema } from "@agentclientprotocol/sdk";
import { createForm, numberValue, questionChoices, questionState, sameAnswer, type FormContent, type FormErrors, type QuestionState } from "./form-state";
import type { Theme } from "./theme";
import { defaultKeybindings, type Keybindings } from "../keybindings";
import { consumeKey, suppressEditorFallback } from "./keybindings";

export function FormView(props: { schema: ElicitationSchema; theme: Theme; keys?: Keybindings; answer: (id?: string, content?: FormContent) => void }) {
  const keys = props.keys ?? defaultKeybindings;
  const hint = keys.hint;
  const form = createForm(props.schema);
  const [fallback, setFallback] = createSignal(form.questionFallback(form.defaults));
  const [json, setJson] = createSignal(fallback().length > 0);
  const [questions, setQuestions] = createSignal(form.fields.map(field => questionState(field, Object.hasOwn(form.defaults, field.name) ? form.defaults[field.name] : undefined)));
  const [index, setIndex] = createSignal(0);
  const [errors, setErrors] = createSignal<FormErrors>({ fields: {}, summary: "" });
  let jsonText = JSON.stringify(form.defaults, null, 2);
  let jsonEditor: TextareaRenderable | undefined;
  let activeEditor: { index: number; editor: TextareaRenderable } | undefined;
  let optionsScroll: ScrollBoxRenderable | undefined;
  let submitted = false;
  const update = (position: number, patch: Partial<QuestionState>) =>
    setQuestions(previous => previous.map((question, i) => i === position ? { ...question, ...patch } : question));
  const saveEditor = () => {
    if (json() || !activeEditor) return;
    const { index: position, editor } = activeEditor;
    if (editor.plainText !== (questions()[position]?.text ?? "")) {
      update(position, { text: editor.plainText, confirmed: false });
    }
  };
  const navigate = (next: number, captureDraft = true) => {
    next = Math.max(0, Math.min(form.fields.length - 1, next));
    if (next === index()) return;
    if (captureDraft) saveEditor();
    activeEditor = undefined;
    setIndex(next);
  };
  const showErrors = (next: FormErrors) => {
    setErrors(next);
    if (!json()) {
      const first = form.fields.findIndex(field => Object.hasOwn(next.fields, field.name));
      if (first >= 0 && first !== index()) navigate(first);
    }
  };
  const accept = (value: unknown) => {
    if (submitted) return;
    const result = form.validate(value);
    if (result.errors) { showErrors(result.errors); return; }
    submitted = true;
    props.answer("accept", result.content);
  };
  const advance = () => {
    const states = questions();
    if (states.every(question => question.confirmed)) {
      accept(Object.fromEntries(states.flatMap((question, i) => question.answer === undefined ? [] : [[form.fields[i]!.name, question.answer]])));
      return;
    }
    for (let offset = 1; offset <= states.length; offset++) {
      const next = (index() + offset) % states.length;
      if (!states[next]!.confirmed) { navigate(next, false); return; }
    }
  };
  const confirm = (skip = false) => {
    if (submitted) return;
    const field = form.fields[index()];
    if (!field) { accept({}); return; }
    saveEditor();
    const question = questions()[index()]!;
    const choices = questionChoices(field);
    let value: FormContent[string] | undefined;
    if (!skip) {
      if (field.type === "array") {
        value = choices[question.highlight]?.value === undefined && !field.required ? undefined : question.value ?? [];
      } else if (choices.length) value = choices[question.highlight]?.value;
      else if (field.type === "number" || field.type === "integer") {
        value = numberValue(question.text ?? "");
        if (value === undefined) { showErrors({ fields: { [field.name]: "Enter a finite number." }, summary: "" }); return; }
      } else value = question.text ?? "";
    }
    const invalid = form.validateField(field, value);
    if (invalid) { showErrors(invalid); return; }
    update(index(), { confirmed: true, answer: value, value,
      text: choices.length || value === undefined ? undefined : String(value) });
    setErrors({ fields: {}, summary: "" });
    advance();
  };
  const toggleSelection = (highlight: number) => {
    if (submitted) return;
    const field = form.fields[index()];
    if (field?.type !== "array") return;
    const choice = questionChoices(field)[highlight];
    if (typeof choice?.value !== "string") return;
    const value = choice.value;
    const selected = questions()[index()]!.value;
    const values = Array.isArray(selected) ? selected : [];
    update(index(), { highlight, value: values.includes(value) ? values.filter(item => item !== value) : [...values, value], confirmed: false });
    setErrors({ fields: {}, summary: "" });
  };
  const draftContent = (): FormContent | undefined => {
    saveEditor();
    const entries: [string, FormContent[string]][] = [];
    for (const [i, field] of form.fields.entries()) {
      const question = questions()[i]!;
      let value = question.value;
      if (!questionChoices(field).length && question.text !== undefined) {
        value = field.type === "number" || field.type === "integer" ? numberValue(question.text) : question.text;
        if (value === undefined) { showErrors({ fields: { [field.name]: "Enter a finite number before switching to JSON." }, summary: "" }); return; }
      }
      if (value !== undefined) entries.push([field.name, value]);
    }
    return Object.fromEntries(entries);
  };
  const readJson = (): unknown => {
    jsonText = jsonEditor?.plainText ?? jsonText;
    return JSON.parse(jsonText);
  };
  const submitJson = () => {
    try { accept(readJson()); }
    catch (error) { showErrors({ fields: {}, summary: error instanceof Error ? error.message : String(error) }); }
  };
  const toggleMode = () => {
    if (json()) {
      if (form.fallback.length) { showErrors({ fields: {}, summary: `JSON is required for: ${form.fallback.join(", ")}.` }); return; }
      try {
        const result = form.validate(readJson());
        if (result.errors) { showErrors(result.errors); return; }
        const unsupported = form.questionFallback(result.content);
        setFallback(unsupported);
        if (unsupported.length) { showErrors({ fields: {}, summary: `JSON is required for: ${unsupported.join(", ")}.` }); return; }
        setQuestions(previous => previous.map((question, i) => {
          const field = form.fields[i]!;
          const value = Object.hasOwn(result.content, field.name) ? result.content[field.name] : undefined;
          const original = questionChoices(field).length ? question.value
            : question.text === undefined ? undefined
              : field.type === "number" || field.type === "integer" ? numberValue(question.text) : question.text;
          return sameAnswer(value, original) ? question : questionState(field, value);
        }));
      } catch (error) { showErrors({ fields: {}, summary: error instanceof Error ? error.message : String(error) }); return; }
    } else {
      const content = draftContent();
      if (!content) return;
      jsonText = JSON.stringify(content, null, 2);
    }
    activeEditor = undefined;
    setErrors({ fields: {}, summary: "" });
    setJson(value => !value);
  };
  useKeyboard(key => {
    if (key.defaultPrevented) return;
    if (submitted) { consumeKey(key); return; }
    if (keys.matches("form.toggleJson", key)) { if (consumeKey(key)) toggleMode(); return; }
    if (json()) {
      if (keys.matches("form.submitJson", key)) { if (consumeKey(key)) submitJson(); }
      else if (keys.matches("form.jsonNewline", key)) { if (consumeKey(key, true)) jsonEditor?.newLine(); }
      else suppressEditorFallback(key);
      return;
    }
    if (keys.matches("form.previous", key) || keys.matches("form.next", key)) {
      if (consumeKey(key, true)) navigate(index() + (keys.matches("form.previous", key) ? -1 : 1));
      return;
    }
    if (keys.matches("form.confirm", key)) {
      if (consumeKey(key)) confirm();
      return;
    }
    const field = form.fields[index()];
    if (!field) return;
    if (keys.matches("form.clear", key)) {
      if (!consumeKey(key)) return;
      if (!field.required) confirm(true);
      else {
        activeEditor?.editor.setText("");
        update(index(), { text: undefined, value: undefined, confirmed: false, answer: undefined, highlight: 0 });
      }
      return;
    }
    const choices = questionChoices(field);
    if (choices.length && field.type === "array" && keys.matches("form.toggle", key)) {
      if (consumeKey(key)) toggleSelection(questions()[index()]!.highlight);
      return;
    }
    if (choices.length && (keys.matches("form.optionPrevious", key) || keys.matches("form.optionNext", key))) {
      if (!consumeKey(key, true)) return;
      const highlight = Math.max(0, Math.min(choices.length - 1, questions()[index()]!.highlight + (keys.matches("form.optionPrevious", key) ? -1 : 1)));
      update(index(), { highlight });
      optionsScroll?.scrollChildIntoView(`question-option-${index()}-${highlight}`);
      return;
    }
    if (!choices.length) {
      if (keys.matches("form.newline", key)) { if (consumeKey(key, true)) activeEditor?.editor.newLine(); return; }
      if (keys.matches("form.cursorLeft", key)) { if (consumeKey(key, true)) activeEditor?.editor.moveCursorLeft(); return; }
      if (keys.matches("form.cursorRight", key)) { if (consumeKey(key, true)) activeEditor?.editor.moveCursorRight(); return; }
      suppressEditorFallback(key, true);
    }
  });
  return <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
    <Show when={props.schema.title}><text fg={props.theme.text}>{props.schema.title}</text></Show>
    <Show when={props.schema.description}><text fg={props.theme.muted}>{props.schema.description}</text></Show>
    <Show when={form.schemaError}><text fg={props.theme.error}>{form.schemaError}</text></Show>
    <Show when={json()} fallback={<>
      <text fg={props.theme.muted} flexShrink={0}>Question {form.fields.length ? index() + 1 : 0}/{form.fields.length} · {questions().filter(question => question.confirmed).length} answered</text>
      <Show when={form.fields[index()]} keyed fallback={<text fg={props.theme.text}>No questions. {hint("form.confirm", "to submit")}.</text>}>{field => {
        const position = form.fields.indexOf(field);
        const question = () => questions()[position]!;
        const choices = questionChoices(field);
        const selected = () => {
          const value = question().value;
          return Array.isArray(value) ? value : [];
        };
        let editor: TextareaRenderable | undefined;
        return <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
          <text fg={props.theme.accent} flexShrink={0}>{field.title}{field.required ? " *" : " (optional)"}</text>
          <Show when={field.description}><text fg={props.theme.muted}>{field.description}</text></Show>
          <Show when={choices.length} fallback={
            <textarea ref={value => { editor = value; activeEditor = { index: position, editor: value }; }} focused height={field.type === "string" ? 3 : 1}
              initialValue={untrack(() => question().text ?? "")} placeholder={field.type === "string" ? "Enter text" : "Enter a number"}
              textColor={props.theme.text} backgroundColor={props.theme.bg} focusedBackgroundColor={props.theme.bg}
              onContentChange={() => {
                if (editor && editor.plainText !== (question().text ?? "")) update(position, { text: editor.plainText, confirmed: false });
              }} />
          }>
            <scrollbox ref={value => {
              optionsScroll = value;
              value.afterLayout(() => value.scrollChildIntoView(`question-option-${position}-${question().highlight}`));
            }} scrollY flexGrow={1} flexShrink={1} minHeight={1} maxHeight={8}>
              <For each={choices}>{(choice, i) => <text id={`question-option-${position}-${i()}`}
                fg={question().highlight === i() ? props.theme.accent : props.theme.text}
                onMouseDown={() => {
                  if (submitted) return;
                  update(position, { highlight: i() });
                  if (field.type === "array" && choice.value !== undefined) toggleSelection(i());
                  else confirm();
                }}>
                {question().highlight === i() ? "> " : "  "}{field.type === "array" && typeof choice.value === "string" ? (selected().includes(choice.value) ? "[x] " : "[ ] ") : ""}{choice.title}{question().confirmed && choice.value === question().answer ? " (selected)" : ""}
              </text>}</For>
            </scrollbox>
          </Show>
          <Show when={Object.hasOwn(errors().fields, field.name)}><text fg={props.theme.error}>{errors().fields[field.name]}</text></Show>
          <Show when={field.type === "array"}><text fg={props.theme.muted} flexShrink={0}>{selected().length} selected · {hint("form.clear", field.required ? "clear" : "skip")}</text></Show>
          <text fg={props.theme.muted} flexShrink={0}>{[
            ...(choices.length ? [hint("form.optionPrevious", "previous option"), hint("form.optionNext", "next option")] : []),
            ...(field.type === "array" ? [hint("form.toggle", "toggle")] : []),
            hint("form.confirm", choices.length && field.type !== "array" ? "select" : "confirm"),
            ...(!choices.length ? [hint("form.clear", field.required ? "clear" : "skip")] : []),
          ].join(" · ")}</text>
          <Show when={!choices.length}><text fg={props.theme.muted} flexShrink={0}>{hint("form.cursorLeft", "left")} · {hint("form.cursorRight", "right")}{field.type === "string" ? ` · ${hint("form.newline", "newline")}` : ""}</text></Show>
        </box>;
      }}</Show>
      <text fg={props.theme.muted} flexShrink={0}>{hint("form.previous", "back")} · {hint("form.next", "next")} · {hint("form.toggleJson", "JSON")}</text>
    </>}>
      <Show when={fallback().length}><text fg={props.theme.warning}>JSON required for: {fallback().join(", ")}</text></Show>
      <scrollbox maxHeight={3} scrollY>
        <For each={Object.entries(props.schema.properties ?? {})}>{([name, schema]) => <text fg={props.theme.muted}>{name}: {JSON.stringify(schema)}</text>}</For>
      </scrollbox>
      <textarea ref={jsonEditor} focused flexGrow={1} minHeight={2} maxHeight={6} initialValue={jsonText} textColor={props.theme.text} backgroundColor={props.theme.bg} focusedBackgroundColor={props.theme.bg} />
      <For each={Object.entries(errors().fields)}>{([name, error]) => <text fg={props.theme.error}>{name}: {error}</text>}</For>
      <text fg={props.theme.muted} flexShrink={0}>{hint("form.toggleJson", "questions")} · {hint("form.submitJson", "submit")} · {hint("form.jsonNewline", "newline")}</text>
    </Show>
    <Show when={errors().summary}><text fg={props.theme.error}>{errors().summary}</text></Show>
    <text fg={props.theme.muted} flexShrink={0}>{hint("form.decline", "decline")} · {hint("app.cancel", "cancel")}</text>
  </box>;
}
