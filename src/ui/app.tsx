import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { basename, relative } from "node:path";
import { Controller, type Snapshot } from "../controller";
import { changedFiles } from "../state";
import { projectFiles } from "../files";
import { appPaths } from "../config";
import { syntaxStyle, themes, type ThemeName } from "./theme";
import { Picker, type Choice } from "./picker";
import { InteractionView } from "./interaction";
import { TimelineEntry } from "./timeline";

export function App(props: { controller: Controller; quit: () => void; autoConnect?: boolean }) {
  const controller = props.controller;
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [state, setState] = createStore<Snapshot>(controller.snapshot());
  const initialTheme = controller.storage.setting<ThemeName>("theme", "dark");
  const [themeName, setThemeName] = createSignal<ThemeName>(initialTheme in themes ? initialTheme : "dark");
  const theme = () => themes[themeName()];
  const styles = { dark: syntaxStyle(renderer, themes.dark), light: syntaxStyle(renderer, themes.light) };
  const [sidebar, setSidebar] = createSignal(controller.storage.setting("sidebar", true));
  const [expanded, setExpanded] = createSignal(false);
  const [thoughts, setThoughts] = createSignal(false);
  const [limit, setLimit] = createSignal(200);
  const [draft, setDraft] = createSignal("");
  const [attachments, setAttachments] = createSignal<string[]>([]);
  const [palette, setPalette] = createSignal<{ title: string; choices: Choice[] }>();
  const [notice, setNotice] = createSignal("");
  let editor: TextareaRenderable | undefined;
  let scroll: ScrollBoxRenderable | undefined;
  let historyIndex = -1;
  let savedDraft = "";
  const drafts = new Map<string, { text: string; attachments: string[] }>();
  const busy = () => ["working", "connecting", "cancelling"].includes(state.status);
  const run = (action: () => unknown) => {
    try { void Promise.resolve(action()).catch(error => controller.report(error)); } catch (error) { controller.report(error); }
  };
  const replaceDraft = (text: string) => { editor?.setText(text); editor?.gotoBufferEnd(); setDraft(text); };
  const listener = (snapshot: Snapshot) => {
    const previousId = state.session.id;
    if (previousId !== snapshot.session.id) {
      drafts.set(previousId, { text: draft(), attachments: attachments() });
      const saved = drafts.get(snapshot.session.id);
      replaceDraft(saved?.text ?? ""); setAttachments(saved?.attachments ?? []);
      historyIndex = -1; setLimit(200);
    }
    if (snapshot.interaction) setPalette(undefined);
    setState(reconcile(snapshot));
  };
  onMount(() => {
    controller.on("change", listener);
    if (props.autoConnect !== false) run(() => controller.open());
  });
  onCleanup(() => { controller.off("change", listener); styles.dark.destroy(); styles.light.destroy(); });

  const showAgents = () => setPalette({ title: "Choose agent · opens a new session", choices: Object.entries(controller.config.agents).map(([name, agent]) => ({ id: name, label: name, detail: `${agent.command} ${agent.args.join(" ")}`, run: () => controller.open(undefined, name) })) });
  const showSessions = () => setPalette({ title: `Sessions · ${basename(controller.cwd)}`, choices: controller.storage.list(controller.cwd).map(session => ({ id: session.id, label: session.title, detail: `${session.agent} · ${new Date(session.updatedAt).toLocaleString()}`, run: () => session.id === state.session.id ? undefined : controller.open(session) })) });
  const showFiles = async () => {
    setNotice("Finding project files…");
    const files = await projectFiles(controller.cwd);
    setNotice("");
    setPalette({ title: "Attach a text file", choices: files.map(path => ({ id: path, label: path, run: () => {
      setAttachments(previous => [...new Set([...previous, path])]);
      if (draft() === "@") replaceDraft("");
    } })) });
  };
  const showConfig = () => setPalette({ title: "Agent session settings", choices: [
    ...state.session.configOptions.map(option => ({ id: option.id, label: option.name, detail: String(option.currentValue), run: () => {
      if (option.type === "boolean") return controller.setConfig(option.id, !option.currentValue);
      const values = option.options.flatMap(value => "options" in value ? value.options : [value]);
      setPalette({ title: option.name, choices: values.map(value => ({ id: value.value, label: value.name, detail: value.description ?? undefined, run: () => controller.setConfig(option.id, value.value) })) });
    } })),
    ...(state.session.modes?.availableModes ?? []).map(mode => ({ id: `mode:${mode.id}`, label: `Mode: ${mode.name}`, detail: mode.description ?? undefined, run: () => controller.setMode(mode.id) })),
  ] });
  const toggleSidebar = () => { setSidebar(value => !value); controller.storage.setSetting("sidebar", sidebar()); };
  const toggleTheme = () => { setThemeName(name => name === "dark" ? "light" : "dark"); controller.storage.setSetting("theme", themeName()); };
  const clientCommands = (): Choice[] => [
    { id: "new", label: "New session", detail: "Ctrl+N", run: () => controller.open() },
    { id: "sessions", label: "Switch session", detail: "Ctrl+S", run: showSessions },
    { id: "agents", label: "Switch agent", detail: "Ctrl+A", run: showAgents },
    { id: "config", label: "Model, mode and agent settings", detail: "Ctrl+M · advertised by the agent", run: showConfig },
    { id: "files", label: "Attach file", detail: "Ctrl+F", run: showFiles },
    { id: "clear-attachments", label: "Clear attachments", run: () => setAttachments([]) },
    { id: "reconnect", label: "Reconnect current session", run: () => controller.open(state.session.remoteId ? controller.session : undefined) },
    { id: "sidebar", label: "Toggle sidebar", detail: "Ctrl+B", run: toggleSidebar },
    { id: "tools", label: "Expand / collapse tool details", detail: "Ctrl+O", run: () => setExpanded(value => !value) },
    { id: "thoughts", label: "Show / hide reasoning", run: () => setThoughts(value => !value) },
    { id: "theme", label: "Toggle light / dark theme", run: toggleTheme },
    { id: "earlier", label: "Show earlier messages", run: () => setLimit(value => value + 200) },
    { id: "export", label: "Export transcript to Markdown", run: async () => setNotice(`Exported ${await controller.exportTranscript()}`) },
    { id: "paths", label: "Show configuration and data paths", run: () => setNotice(`Config: ${appPaths().config} · Data: ${appPaths().data}`) },
    ...(controller.client?.info?.authMethods ?? []).filter(method => !("type" in method && method.type === "terminal")).map(method => ({ id: `auth:${method.id}`, label: `Authenticate: ${method.name}`, detail: method.description ?? undefined, run: () => controller.authenticate(method.id) })),
    { id: "quit", label: "Quit", detail: "Ctrl+Q", run: props.quit },
  ];
  const agentCommands = (): Choice[] => state.session.commands.map(command => ({ id: `agent:${command.name}`, label: `/${command.name}`, detail: `${command.description}${command.input?.hint ? ` · ${command.input.hint}` : ""}`, run: () => replaceDraft(`/${command.name} `) }));
  const showCommands = () => setPalette({ title: "Command palette", choices: [...clientCommands(), ...agentCommands()] });
  const completions = createMemo(() => draft().startsWith("/") && !draft().includes(" ") ? [...clientCommands().map(c => `/tui:${c.id}`), ...state.session.commands.map(c => `/${c.name}`)].filter(name => name.startsWith(draft())).slice(0, 5) : []);
  const submit = () => {
    // Key events can arrive in one terminal read; the editor is ahead of content-change signals.
    const text = (editor?.plainText ?? draft()).trim();
    if (!text && !attachments().length) return;
    if (text.startsWith("/tui:")) {
      const command = clientCommands().find(c => `/tui:${c.id}` === text);
      if (!command) { controller.report("Unknown client command. Press Ctrl+P to see available commands."); return; }
      replaceDraft(""); run(command.run); return;
    }
    if (text.startsWith("/") && !state.session.commands.some(command => text === `/${command.name}` || text.startsWith(`/${command.name} `))) {
      controller.report("This slash command was not advertised by the agent. Press Tab or Ctrl+P to choose a command."); return;
    }
    if (state.status !== "ready") { controller.report("The session is not ready. Reconnect or create a new session from Ctrl+P."); return; }
    const files = attachments();
    replaceDraft(""); setAttachments([]); historyIndex = -1; setNotice("");
    scroll?.scrollTo(Infinity);
    run(() => controller.send(text, files));
  };

  useKeyboard(key => {
    if (key.ctrl && (key.name === "q" || key.name === "c")) {
      key.preventDefault();
      if (key.name === "c" && busy()) run(() => controller.cancel()); else props.quit();
      return;
    }
    if (key.ctrl && key.name === "o") { key.preventDefault(); setExpanded(value => !value); return; }
    if (key.name === "pageup" || key.name === "pagedown") { key.preventDefault(); scroll?.scrollBy(key.name === "pageup" ? -10 : 10); return; }
    if (state.interaction) return;
    if (key.name === "escape") {
      key.preventDefault();
      if (palette()) setPalette(undefined);
      else if (busy()) run(() => controller.cancel());
      else { controller.clearError(); setNotice(""); }
      return;
    }
    if (palette()) return;
    if (key.ctrl) {
      const actions: Record<string, () => unknown> = { p: showCommands, s: showSessions, a: showAgents, n: () => controller.open(), b: toggleSidebar, o: () => setExpanded(value => !value), f: showFiles, m: showConfig };
      const action = actions[key.name];
      if (action) { key.preventDefault(); run(action); return; }
    }
    if (key.name === "tab" && draft().startsWith("/")) {
      key.preventDefault();
      const prefix = draft();
      setPalette({ title: "Complete command", choices: [
        ...clientCommands().map(c => ({ ...c, label: `/tui:${c.id}`, run: () => replaceDraft(`/tui:${c.id}`) })), ...agentCommands(),
      ].filter(c => c.label.startsWith(prefix)) });
    }
    if (key.name === "tab" && draft().startsWith("@")) { key.preventDefault(); run(showFiles); }
    if (key.ctrl && (key.name === "up" || key.name === "down")) {
      key.preventDefault();
      const history = state.session.items.filter(item => item.type === "message" && item.role === "user").map(item => item.type === "message" ? item.text : "").reverse();
      if (historyIndex === -1) savedDraft = draft();
      historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (key.name === "up" ? 1 : -1)));
      replaceDraft(historyIndex === -1 ? savedDraft : history[historyIndex] ?? "");
    }
  });

  return <box width="100%" height="100%" flexDirection="column" backgroundColor={theme().bg}>
    <box height={2} flexShrink={0} paddingX={1} justifyContent="space-between" flexDirection="row">
      <text fg={theme().accent}>ACP TUI / {basename(state.session.cwd)}</text>
      <text fg={theme().muted}>{state.agentName ?? state.session.agent} · {state.status}</text>
    </box>
    <box flexGrow={1} minHeight={0} flexDirection="row">
      <scrollbox ref={scroll} flexGrow={1} minWidth={0} scrollY stickyScroll stickyStart="bottom" contentOptions={{ paddingX: 1 }}>
        <Show when={!state.session.items.length}>
          <box flexDirection="column" padding={2} gap={1}>
            <text fg={theme().accent}>What would you like to build?</text>
            <text fg={theme().muted}>One interface for your coding agents.</text>
            <text fg={theme().text}>Type a prompt below. Ctrl+P opens commands, Ctrl+A selects an agent.</text>
            <Show when={state.session.agent === "demo"}><text fg={theme().warning}>Offline demo · simulated edits · try /help, /question or /slow</text></Show>
          </box>
        </Show>
        <Show when={state.session.items.length > limit()}><text fg={theme().muted} onMouseDown={() => setLimit(value => value + 200)}>Earlier messages hidden · open “Show earlier messages” in Ctrl+P</text></Show>
        <For each={state.session.items.slice(-limit())}>{item => <TimelineEntry item={item} theme={theme()} syntax={styles[themeName()]} expanded={expanded()} thoughts={thoughts()} streaming={state.status === "working" && item.id === state.session.items.at(-1)?.id} terminals={state.terminalOutput} />}</For>
        <Show when={state.status === "working" || state.status === "cancelling"}><text fg={theme().accent}>{state.status === "working" ? "Working… · Esc to cancel" : "Cancelling… · Esc to disconnect"}</text></Show>
      </scrollbox>
      <Show when={sidebar() && dimensions().width >= 100}>
        <scrollbox width={29} flexShrink={0} border={["left"]} borderColor={theme().border} paddingX={1} scrollY>
          <text fg={theme().accent}>{state.session.title}</text>
          <text fg={theme().muted}>{state.session.agent}</text>
          <For each={state.session.configOptions}>{option => <text fg={theme().muted}>{option.name}: {String(option.currentValue)}</text>}</For>
          <Show when={state.session.modes}><text fg={theme().muted}>Mode: {state.session.modes?.currentModeId}</text></Show>
          <Show when={state.session.usage}><text fg={theme().muted}>Context: {state.session.usage?.used.toLocaleString()} / {state.session.usage?.size.toLocaleString()}</text></Show>
          <Show when={state.session.plan.length}><text fg={theme().accent} marginTop={1}>Plan</text></Show>
          <For each={state.session.plan}>{entry => <text fg={entry.status === "completed" ? theme().muted : theme().text}>{entry.status === "completed" ? "✓" : entry.status === "in_progress" ? "›" : "○"} {entry.content}</text>}</For>
          <Show when={changedFiles(state.session).length}><text fg={theme().accent} marginTop={1}>Reported diffs</text></Show>
          <For each={changedFiles(state.session)}>{path => <text fg={theme().muted}>{relative(state.session.cwd, path)}</text>}</For>
          <text fg={theme().muted} marginTop={2}>Ctrl+S sessions{"\n"}Ctrl+N new session{"\n"}Ctrl+M model / mode{"\n"}Ctrl+B hide sidebar</text>
        </scrollbox>
      </Show>
    </box>
    <Show when={state.error || notice()}><text fg={state.error ? theme().error : theme().muted} paddingX={1} maxHeight={3}>{state.error ?? notice()}</text></Show>
    <Show when={palette()} keyed>{menu => <Picker title={menu.title} choices={menu.choices} theme={theme()} height={dimensions().height} close={() => setPalette(undefined)} error={error => controller.report(error)} />}</Show>
    <Show when={state.interaction} keyed>{interaction => <InteractionView interaction={interaction} theme={theme()} answer={(id, content) => controller.answer(id, content)} />}</Show>
    <box border borderColor={busy() ? theme().accent : theme().border} backgroundColor={theme().panel} flexDirection="column" paddingX={1} flexShrink={0}>
      <Show when={attachments().length}><text fg={theme().accent} maxHeight={2}>Attached: {attachments().join(", ")}</text></Show>
      <textarea ref={editor} focused={!palette() && !state.interaction} height={Math.min(5, Math.max(2, draft().split("\n").length))} placeholder={busy() ? "Compose your next message…" : "Ask anything · / commands · @ then Tab to attach a file"} textColor={theme().text} focusedTextColor={theme().text} backgroundColor={theme().panel} focusedBackgroundColor={theme().panel} cursorColor={theme().accent} keyBindings={[{ name: "return", action: "submit" }, { name: "return", shift: true, action: "newline" }, { name: "return", meta: true, action: "newline" }]} onContentChange={() => setDraft(editor?.plainText ?? "")} onSubmit={submit} />
      <Show when={completions().length}><text fg={theme().muted} maxHeight={1}>{completions().join("  ")} · Tab complete</text></Show>
    </box>
    <text height={1} flexShrink={0} paddingX={1} fg={theme().muted}>{dimensions().width < 80 ? "Enter send · Ctrl+P commands · Esc cancel" : "Enter send · Shift/Alt+Enter newline · Ctrl+P commands · Ctrl+O tools · PgUp/PgDn scroll · Ctrl+Q quit"}</text>
  </box>;
}
