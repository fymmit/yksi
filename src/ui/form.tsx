import { createSignal, For, Show, untrack } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import type { ElicitationSchema } from "@agentclientprotocol/sdk";
import { createForm, numberValue, questionChoices, questionState, sameAnswer, type FormContent, type FormErrors, type QuestionState } from "./form-state";
import type { Theme } from "./theme";

export function FormView(props: { schema: ElicitationSchema; theme: Theme; answer: (id?: string, content?: FormContent) => void }) {
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
    if (submitted) { key.preventDefault(); return; }
    if (key.ctrl && key.name === "e") { key.preventDefault(); toggleMode(); return; }
    if (json()) {
      if (key.ctrl && key.name === "return") {
        key.preventDefault(); key.stopPropagation();
        if (!key.repeated && key.eventType !== "repeat") submitJson();
      }
      return;
    }
    if ((key.name === "left" || key.name === "right") && !key.ctrl && !key.meta && !key.shift) {
      key.preventDefault(); navigate(index() + (key.name === "left" ? -1 : 1)); return;
    }
    if (key.name === "return" && !key.shift && !key.meta) {
      key.preventDefault(); key.stopPropagation();
      if (!key.repeated && key.eventType !== "repeat") confirm();
      return;
    }
    const field = form.fields[index()];
    if (!field) return;
    if (key.ctrl && key.name === "u") {
      key.preventDefault(); key.stopPropagation();
      if (key.repeated || key.eventType === "repeat") return;
      if (!field.required) confirm(true);
      else {
        activeEditor?.editor.setText("");
        update(index(), { text: undefined, value: undefined, confirmed: false, answer: undefined, highlight: 0 });
      }
      return;
    }
    const choices = questionChoices(field);
    if (field.type === "array" && key.name === "space" && !key.ctrl && !key.meta && !key.shift) {
      key.preventDefault(); key.stopPropagation();
      if (!key.repeated && key.eventType !== "repeat") toggleSelection(questions()[index()]!.highlight);
      return;
    }
    if (choices.length && (key.name === "up" || key.name === "down")) {
      key.preventDefault();
      const highlight = Math.max(0, Math.min(choices.length - 1, questions()[index()]!.highlight + (key.name === "up" ? -1 : 1)));
      update(index(), { highlight });
      optionsScroll?.scrollChildIntoView(`question-option-${index()}-${highlight}`);
    }
  });
  return <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
    <Show when={props.schema.title}><text fg={props.theme.text}>{props.schema.title}</text></Show>
    <Show when={props.schema.description}><text fg={props.theme.muted}>{props.schema.description}</text></Show>
    <Show when={form.schemaError}><text fg={props.theme.error}>{form.schemaError}</text></Show>
    <Show when={json()} fallback={<>
      <text fg={props.theme.muted} flexShrink={0}>Question {form.fields.length ? index() + 1 : 0}/{form.fields.length} · {questions().filter(question => question.confirmed).length} answered</text>
      <Show when={form.fields[index()]} keyed fallback={<text fg={props.theme.text}>No questions. Press Enter to submit.</text>}>{field => {
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
              keyBindings={[{ name: "return", shift: true, action: "newline" }, { name: "return", meta: true, action: "newline" },
                { name: "b", ctrl: true, action: "move-left" }, { name: "f", ctrl: true, action: "move-right" }]}
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
          <Show when={field.type === "array"}><text fg={props.theme.muted} flexShrink={0}>{selected().length} selected · Ctrl+U {field.required ? "clear" : "skip"}</text></Show>
          <text fg={props.theme.muted} flexShrink={0}>{field.type === "array" ? "Up/Down options · Space toggle · Enter confirm" : choices.length ? "Up/Down options · Enter select" : "Enter confirm · Ctrl+U " + (field.required ? "clear" : "skip")}</text>
          <Show when={!choices.length}><text fg={props.theme.muted} flexShrink={0}>Ctrl+B/F cursor{field.type === "string" ? " · Shift/Alt+Enter newline" : ""}</text></Show>
        </box>;
      }}</Show>
      <text fg={props.theme.muted} flexShrink={0}>Left/Right questions · Ctrl+E JSON</text>
    </>}>
      <Show when={fallback().length}><text fg={props.theme.warning}>JSON required for: {fallback().join(", ")}</text></Show>
      <scrollbox maxHeight={3} scrollY>
        <For each={Object.entries(props.schema.properties ?? {})}>{([name, schema]) => <text fg={props.theme.muted}>{name}: {JSON.stringify(schema)}</text>}</For>
      </scrollbox>
      <textarea ref={jsonEditor} focused flexGrow={1} minHeight={2} maxHeight={6} initialValue={jsonText} textColor={props.theme.text} backgroundColor={props.theme.bg} focusedBackgroundColor={props.theme.bg} />
      <For each={Object.entries(errors().fields)}>{([name, error]) => <text fg={props.theme.error}>{name}: {error}</text>}</For>
      <text fg={props.theme.muted} flexShrink={0}>Ctrl+E questions · Ctrl+Enter submit</text>
    </Show>
    <Show when={errors().summary}><text fg={props.theme.error}>{errors().summary}</text></Show>
    <text fg={props.theme.muted} flexShrink={0}>Ctrl+D decline · Esc cancel</text>
  </box>;
}
