import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { basename, relative } from "node:path";
import { Controller, type Snapshot } from "../controller";
import { changedFiles, type Message } from "../state";
import { sessionMode } from "../modes";
import { modelOption, optionChoices, optionValueLabel } from "../session-options";
import { projectFiles } from "../files";
import { appPaths } from "../config";
import {
  formatKey,
  matchesKey,
  resolveKeybindings,
  type KeyAction,
  type KeyContext,
  type KeyStroke,
} from "../keybindings";
import { consumeKey, suppressEditorFallback } from "./keybindings";
import { syntaxStyle, editorColors, scrollbarColors, selectionColors } from "./theme";
import { initialTheme, resolveThemes } from "../themes";
import { Picker, type Choice } from "./picker";
import { InteractionView } from "./interaction";
import { TimelineEntry } from "./timeline";
import { formatCost, usageSummary } from "./usage";
import { StatusBar } from "./status-bar";
import { KeyboardHelp } from "./help";

export function App(props: { controller: Controller; quit: () => void; autoConnect?: boolean }) {
  const controller = props.controller;
  const keys = resolveKeybindings(controller.config.keybindings, controller.config.leader);
  const hint = keys.hint;
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [state, setState] = createStore<Snapshot>(controller.snapshot());
  const registry = resolveThemes(controller.config);
  const [themeName, setThemeName] = createSignal(
    initialTheme(controller.config, controller.storage.setting("theme", "dark"), registry),
  );
  const theme = () => registry[themeName()]!.theme;
  // Lazily allocate native styles; keep visited styles alive until all consumers unmount.
  const styles = new Map<string, ReturnType<typeof syntaxStyle>>();
  const style = createMemo(() => {
    const name = themeName();
    if (!styles.has(name)) styles.set(name, syntaxStyle(renderer, theme()));
    return styles.get(name)!;
  });
  const [sidebar, setSidebar] = createSignal(controller.storage.setting("sidebar", true));
  const [expanded, setExpanded] = createSignal(false);
  const [thoughts, setThoughts] = createSignal(false);
  const [limit, setLimit] = createSignal(200);
  const [draft, setDraft] = createSignal("");
  const [attachments, setAttachments] = createSignal<string[]>([]);
  const [palette, setPalette] = createSignal<{ title: string; choices: Choice[] }>();
  const [help, setHelp] = createSignal<KeyContext>();
  const [formContext, setFormContext] = createSignal<KeyContext>("form.text");
  const [prefix, setPrefix] = createSignal<{ key: KeyStroke; context: KeyContext }>();
  let prefixTimer: ReturnType<typeof setTimeout> | undefined;
  const clearPrefix = () => {
    if (prefixTimer) clearTimeout(prefixTimer);
    prefixTimer = undefined;
    setPrefix(undefined);
  };
  const context = (): KeyContext =>
    state.interaction
      ? state.interaction.form
        ? formContext()
        : "permission"
      : palette()
        ? "picker"
        : "composer";
  const showHelp = () => setHelp(context());
  const [notice, setNotice] = createSignal("");
  let editor: TextareaRenderable | undefined;
  let scroll: ScrollBoxRenderable | undefined;
  let historyIndex = -1;
  let savedDraft = { text: "", attachments: [] as string[] };
  let replacementText: string | undefined;
  let draftRevision = 0;
  const drafts = new Map<string, { text: string; attachments: string[] }>();
  const busy = () => ["working", "connecting", "cancelling"].includes(state.status);
  const mode = createMemo(() => sessionMode(state.session));
  const run = (action: () => unknown) => {
    try {
      void Promise.resolve(action()).catch(error => controller.report(error));
    } catch (error) {
      controller.report(error);
    }
  };
  const replaceDraft = (text: string) => {
    draftRevision++;
    replacementText = text;
    editor?.setText(text);
    editor?.gotoBufferEnd();
    setDraft(text);
  };
  const listener = (snapshot: Snapshot) => {
    const previousId = state.session.id;
    if (previousId !== snapshot.session.id) {
      clearPrefix();
      setNotice("");
      drafts.set(
        previousId,
        historyIndex === -1 ? { text: draft(), attachments: attachments() } : savedDraft,
      );
      const saved = drafts.get(snapshot.session.id);
      replaceDraft(saved?.text ?? "");
      setAttachments(saved?.attachments ?? []);
      historyIndex = -1;
      setLimit(200);
    }
    if (snapshot.interaction) {
      clearPrefix();
      setPalette(undefined);
    }
    setState(reconcile(snapshot));
  };
  onMount(() => {
    controller.on("change", listener);
    if (props.autoConnect !== false) run(() => controller.open());
  });
  onCleanup(() => {
    clearPrefix();
    controller.off("change", listener);
    for (const style of styles.values()) style.destroy();
  });

  const showAgents = () =>
    setPalette({
      title: "Choose agent · opens a new session",
      choices: Object.entries(controller.config.agents).map(([name, agent]) => ({
        id: name,
        label: name,
        detail: `${agent.command} ${agent.args.join(" ")}`,
        run: () => controller.open(undefined, name),
      })),
    });
  const showSessions = () => {
    const issues: string[] = [];
    const sessions = controller.storage.list(controller.cwd, issue => issues.push(issue.id));
    if (issues.length)
      setNotice(
        `Could not read ${issues.length} saved session(s): ${issues.join(", ")}. Records remain in the history database.`,
      );
    setPalette({
      title: `Sessions · ${basename(controller.cwd)}`,
      choices: sessions.map(session => ({
        id: session.id,
        label: session.title,
        detail: `${session.agent} · ${new Date(session.updatedAt).toLocaleString()}`,
        run: () => (session.id === state.session.id ? undefined : controller.open(session)),
      })),
    });
  };
  const showFiles = async () => {
    setNotice("Finding project files…");
    const files = await projectFiles(controller.cwd);
    setNotice("");
    setPalette({
      title: "Attach a text file",
      choices: files.map(path => ({
        id: path,
        label: path,
        run: () => {
          historyIndex = -1;
          setAttachments(previous => [...new Set([...previous, path])]);
          if (draft() === "@") replaceDraft("");
        },
      })),
    });
  };
  const showConfigOption = (
    option: Snapshot["session"]["configOptions"][number],
    title = option.name,
  ) => {
    if (option.type === "boolean") return controller.setConfig(option.id, !option.currentValue);
    const values = optionChoices(option);
    setPalette({
      title,
      choices: values.map(value => ({
        id: value.value,
        label: value.name,
        detail: value.description ?? undefined,
        run: () => controller.setConfig(option.id, value.value),
      })),
    });
  };
  const showModel = () => {
    const option = modelOption(state.session.configOptions);
    if (option) showConfigOption(option, "Choose model");
    else setNotice("This agent does not advertise a model selector.");
  };
  const showConfig = () =>
    setPalette({
      title: "Agent session settings",
      choices: [
        ...state.session.configOptions.map(option => ({
          id: option.id,
          label: option.name,
          detail: optionValueLabel(option),
          run: () => showConfigOption(option),
        })),
        ...(state.session.configOptions.length
          ? []
          : (state.session.modes?.availableModes ?? [])
        ).map(mode => ({
          id: `mode:${mode.id}`,
          label: `Mode: ${mode.name}`,
          detail: mode.description ?? undefined,
          run: () => controller.setMode(mode.id),
        })),
      ],
    });
  const toggleSidebar = () => {
    setSidebar(value => !value);
    controller.storage.setSetting("sidebar", sidebar());
  };
  const showThemes = () =>
    setPalette({
      title: "Choose theme",
      choices: Object.entries(registry).map(([id, preset]) => ({
        id,
        label: preset.label,
        detail: [
          id,
          id === themeName() ? "current" : "",
          Object.hasOwn(controller.config.themes ?? {}, id) ? "custom" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        run: () => {
          setThemeName(id);
          controller.storage.setSetting("theme", id);
        },
      })),
    });
  const clientCommands = (): Choice[] =>
    [
      { id: "help", label: "Keyboard shortcuts", run: showHelp },
      { id: "new", label: "New session", run: () => controller.open() },
      { id: "sessions", label: "Switch session", run: showSessions },
      { id: "agents", label: "Switch agent", run: showAgents },
      {
        id: "config",
        label: "Model, mode and agent settings",
        detail: "advertised by the agent",
        run: showConfig,
      },
      { id: "model", label: "Choose model", run: showModel },
      {
        id: "cycle-mode",
        label: "Cycle mode",
        detail: "next agent mode",
        run: () => controller.cycleMode(),
      },
      {
        id: "usage",
        label: "Show session usage",
        detail: "last reported cost and context",
        run: () => {
          controller.clearError();
          setNotice(usageSummary(state.session));
        },
      },
      { id: "files", label: "Attach file", run: showFiles },
      {
        id: "clear-attachments",
        label: "Clear attachments",
        run: () => {
          historyIndex = -1;
          setAttachments([]);
        },
      },
      {
        id: "reconnect",
        label: "Reconnect current session",
        run: () => controller.open(state.session.remoteId ? controller.session : undefined),
      },
      { id: "sidebar", label: "Toggle sidebar", run: toggleSidebar },
      {
        id: "tools",
        label: "Expand / collapse tool details",
        run: () => setExpanded(value => !value),
      },
      { id: "thoughts", label: "Show / hide reasoning", run: () => setThoughts(value => !value) },
      { id: "theme", label: "Choose theme", run: showThemes },
      { id: "earlier", label: "Show earlier messages", run: () => setLimit(value => value + 200) },
      {
        id: "export",
        label: "Export transcript to Markdown",
        run: async () => setNotice(`Exported ${await controller.exportTranscript()}`),
      },
      {
        id: "paths",
        label: "Show configuration and data paths",
        run: () => setNotice(`Config: ${appPaths().config} · Data: ${appPaths().data}`),
      },
      ...(controller.client?.info?.authMethods ?? [])
        .filter(method => !("type" in method && method.type === "terminal"))
        .map(method => ({
          id: `auth:${method.id}`,
          label: `Authenticate: ${method.name}`,
          detail: method.description ?? undefined,
          run: () => controller.authenticate(method.id),
        })),
      { id: "quit", label: "Quit", run: props.quit },
    ].map(command => {
      const id = `app.${command.id}` as KeyAction;
      const shortcut = Object.hasOwn(keys.bindings, id) ? keys.label(id) : "";
      return {
        ...command,
        detail: [shortcut, command.detail].filter(Boolean).join(" · ") || undefined,
      };
    });
  const agentCommands = (): Choice[] =>
    state.session.commands.map(command => ({
      id: `agent:${command.name}`,
      label: `/${command.name}`,
      detail: `${command.description}${command.input?.hint ? ` · ${command.input.hint}` : ""}`,
      run: () => replaceDraft(`/${command.name} `),
    }));
  const showCommands = () =>
    setPalette({ title: "Command palette", choices: [...clientCommands(), ...agentCommands()] });
  const completions = createMemo(() =>
    draft().startsWith("/") && !draft().includes(" ")
      ? [
          ...clientCommands().map(c => `/tui:${c.id}`),
          ...state.session.commands.map(c => `/${c.name}`),
        ]
          .filter(name => name.startsWith(draft()))
          .slice(0, 5)
      : [],
  );
  const submit = () => {
    // Key events can arrive in one terminal read; the editor is ahead of content-change signals.
    const text = (editor?.plainText ?? draft()).trim();
    if (!text && !attachments().length) return;
    if (text.startsWith("/tui:")) {
      const command = clientCommands().find(c => `/tui:${c.id}` === text);
      if (!command) {
        controller.report(
          `Unknown client command. Open the command palette: ${hint("app.commands", "commands")}.`,
        );
        return;
      }
      controller.recordInput(text);
      replaceDraft("");
      historyIndex = -1;
      run(command.run);
      return;
    }
    if (
      text.startsWith("/") &&
      !state.session.commands.some(
        command => text === `/${command.name}` || text.startsWith(`/${command.name} `),
      )
    ) {
      controller.report(
        `This slash command was not advertised by the agent. ${hint("composer.complete", "complete")} · ${hint("app.commands", "commands")}.`,
      );
      return;
    }
    if (state.status !== "ready") {
      controller.report(
        `The session is not ready. Reconnect or create a new session from the command palette (${hint("app.commands", "commands")}).`,
      );
      return;
    }
    const files = attachments();
    const revision = draftRevision;
    const sessionId = state.session.id;
    run(() =>
      controller.send(text, files, () => {
        if (state.session.id !== sessionId || draftRevision !== revision || attachments() !== files)
          return;
        replaceDraft("");
        setAttachments([]);
        historyIndex = -1;
        setNotice("");
        scroll?.scrollTo(Infinity);
      }),
    );
  };

  const runAppAction = (id: KeyAction) => {
    if (id === "app.commands") showCommands();
    else if (id === "app.tools") setExpanded(value => !value);
    else {
      const command = clientCommands().find(command => `app.${command.id}` === id);
      if (command) run(command.run);
    }
  };

  useKeyboard(key => {
    if (key.defaultPrevented) return;
    if (keys.matches("app.quit", key) || keys.matches("app.interrupt", key)) {
      if (!consumeKey(key)) return;
      clearPrefix();
      if (keys.matches("app.interrupt", key) && busy()) run(() => controller.cancel());
      else props.quit();
      return;
    }
    if (keys.matches("app.help", key)) {
      if (consumeKey(key)) {
        clearPrefix();
        if (help()) setHelp(undefined);
        else showHelp();
      }
      return;
    }
    if (help()) return;
    const pending = prefix();
    if (pending) {
      if (!consumeKey(key)) return;
      clearPrefix();
      if (matchesKey(key, { name: "escape" }) || keys.matches("app.cancel", key)) return;
      if (pending.context === context()) {
        const id = keys.sequence(pending.context, pending.key, key);
        if (id) runAppAction(id);
      }
      return;
    }
    if (keys.starts(context(), key)) {
      if (consumeKey(key)) {
        setPrefix({ key, context: context() });
        prefixTimer = setTimeout(clearPrefix, 2000);
      }
      return;
    }
    if (keys.matches("app.tools", key)) {
      if (consumeKey(key)) runAppAction("app.tools");
      return;
    }
    if (
      !state.interaction?.form &&
      (keys.matches("app.scrollUp", key) || keys.matches("app.scrollDown", key))
    ) {
      if (consumeKey(key, true)) scroll?.scrollBy(keys.matches("app.scrollUp", key) ? -10 : 10);
      return;
    }
    if (state.interaction) return;
    if (keys.matches("app.cancel", key)) {
      if (!consumeKey(key)) return;
      if (palette()) setPalette(undefined);
      else if (busy()) run(() => controller.cancel());
      else {
        controller.clearError();
        setNotice("");
      }
      return;
    }
    if (palette()) return;
    if (keys.matches("app.commands", key)) {
      if (consumeKey(key)) runAppAction("app.commands");
      return;
    }
    const command = clientCommands().find(command => {
      const id = `app.${command.id}` as KeyAction;
      return Object.hasOwn(keys.bindings, id) && keys.matches(id, key);
    });
    if (command) {
      if (consumeKey(key)) run(command.run);
      return;
    }
    if (keys.matches("composer.submit", key)) {
      if (consumeKey(key)) submit();
      return;
    }
    if (keys.matches("composer.newline", key)) {
      if (consumeKey(key, true)) editor?.newLine();
      return;
    }
    if (keys.matches("composer.complete", key)) {
      if (!consumeKey(key)) return;
      const prefix = editor?.plainText ?? draft();
      if (prefix.startsWith("/")) {
        setPalette({
          title: "Complete command",
          choices: [
            ...clientCommands().map(c => ({
              ...c,
              label: `/tui:${c.id}`,
              run: () => replaceDraft(`/tui:${c.id}`),
            })),
            ...agentCommands(),
          ].filter(c => c.label.startsWith(prefix)),
        });
      } else if (prefix.startsWith("@")) run(showFiles);
      return;
    }
    if (
      keys.matches("composer.historyPrevious", key) ||
      keys.matches("composer.historyNext", key)
    ) {
      const previous = keys.matches("composer.historyPrevious", key);
      // Let the textarea move through both hard and soft-wrapped lines first.
      const cursor = editor?.visualCursor;
      const view = editor?.editorView;
      const visualRow = cursor && view ? cursor.visualRow + view.getViewport().offsetY : 0;
      const lastRow = (view?.getTotalVirtualLineCount() ?? 1) - 1;
      if (previous ? visualRow > 0 : visualRow < lastRow) {
        // Arrows are native editor keys; other bindings need the same visual movement.
        if (key.name !== (previous ? "up" : "down") && consumeKey(key, true))
          previous ? editor?.moveCursorUp() : editor?.moveCursorDown();
        return;
      }
      const history =
        state.session.inputHistory ??
        state.session.items
          .filter((item): item is Message => item.type === "message" && item.role === "user")
          .map(item => ({ text: item.text, attachments: [] as string[] }));
      const next = Math.max(-1, Math.min(history.length - 1, historyIndex + (previous ? 1 : -1)));
      if (next === historyIndex) {
        if (key.name !== (previous ? "up" : "down")) consumeKey(key, true);
        return;
      }
      if (!consumeKey(key, true)) return;
      if (historyIndex === -1)
        savedDraft = { text: editor?.plainText ?? draft(), attachments: attachments() };
      historyIndex = next;
      const entry = next === -1 ? savedDraft : history[history.length - 1 - next]!;
      replaceDraft(entry.text);
      setAttachments([...entry.attachments]);
      return;
    }
    suppressEditorFallback(key);
  });

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme().background}>
      <box
        height={2}
        flexShrink={0}
        paddingX={1}
        justifyContent="space-between"
        flexDirection="row"
      >
        <text {...selectionColors(theme())} fg={theme().accent}>
          yksi / {basename(state.session.cwd)}
        </text>
        <text {...selectionColors(theme())} fg={theme().text}>
          {state.session.title}
        </text>
        <text {...selectionColors(theme())} fg={theme().muted}>
          {prefix()
            ? `${formatKey(prefix()!.key)} …`
            : `${state.agentName ?? state.session.agent} · ${state.status}`}
        </text>
      </box>
      <box flexGrow={1} minHeight={0} flexDirection="row">
        <scrollbox
          ref={scroll}
          flexGrow={1}
          minWidth={0}
          scrollY
          stickyScroll
          stickyStart="bottom"
          contentOptions={{ paddingX: 1 }}
          scrollbarOptions={scrollbarColors(theme())}
        >
          <Show when={!state.session.items.length}>
            <box flexDirection="column" padding={2} gap={1}>
              <text {...selectionColors(theme())} fg={theme().accent}>
                What would you like to build?
              </text>
              <text {...selectionColors(theme())} fg={theme().muted}>
                One interface for your coding agents.
              </text>
              <text {...selectionColors(theme())} fg={theme().text}>
                Type a prompt below. {hint("app.commands", "commands")} ·{" "}
                {hint("app.agents", "agents")}
              </text>
              <Show when={state.session.agent === "demo"}>
                <text {...selectionColors(theme())} fg={theme().warning}>
                  Offline demo · simulated edits · try /help, /question or /slow
                </text>
              </Show>
            </box>
          </Show>
          <Show when={state.session.items.length > limit()}>
            <text
              {...selectionColors(theme())}
              fg={theme().muted}
              onMouseDown={() => setLimit(value => value + 200)}
            >
              Earlier messages hidden · “Show earlier messages” in the command palette (
              {hint("app.commands", "commands")})
            </text>
          </Show>
          <For each={state.session.items.slice(-limit())}>
            {item => (
              <TimelineEntry
                item={item}
                theme={theme()}
                syntax={style()}
                expanded={expanded()}
                thoughts={thoughts()}
                streaming={state.status === "working" && item.id === state.session.items.at(-1)?.id}
                terminals={state.terminalOutput}
              />
            )}
          </For>
          <Show when={state.status === "working" || state.status === "cancelling"}>
            <text {...selectionColors(theme())} fg={theme().accent}>
              {state.status === "working"
                ? `Working… · ${hint("app.cancel", "to cancel")}`
                : `Cancelling… · ${hint("app.cancel", "to disconnect")}`}
            </text>
          </Show>
        </scrollbox>
        <Show when={sidebar() && dimensions().width >= 100}>
          <scrollbox
            width={29}
            flexShrink={0}
            border={["left"]}
            borderColor={theme().border}
            paddingX={1}
            scrollY
            scrollbarOptions={scrollbarColors(theme())}
          >
            <text {...selectionColors(theme())} fg={theme().accent}>
              {state.session.title}
            </text>
            <text {...selectionColors(theme())} fg={theme().muted}>
              {state.session.agent}
            </text>
            <For each={state.session.configOptions}>
              {option => (
                <text {...selectionColors(theme())} fg={theme().muted}>
                  {option.name}: {optionValueLabel(option)}
                </text>
              )}
            </For>
            <Show when={!state.session.configOptions.length && state.session.modes}>
              <text {...selectionColors(theme())} fg={theme().muted}>
                Mode:{" "}
                {state.session.modes?.availableModes.find(
                  mode => mode.id === state.session.modes?.currentModeId,
                )?.name ?? state.session.modes?.currentModeId}
              </text>
            </Show>
            <Show when={state.session.usage}>
              <text {...selectionColors(theme())} fg={theme().muted}>
                Context: {state.session.usage?.used.toLocaleString()} /{" "}
                {state.session.usage?.size.toLocaleString()}
              </text>
            </Show>
            <Show when={state.session.usage}>
              <text {...selectionColors(theme())} fg={theme().muted}>
                Reported cost:{"\n"}
                {formatCost(state.session.usage?.cost)}
              </text>
            </Show>
            <Show when={state.session.plan.length}>
              <text {...selectionColors(theme())} fg={theme().accent} marginTop={1}>
                Plan
              </text>
            </Show>
            <For each={state.session.plan}>
              {entry => (
                <text
                  {...selectionColors(theme())}
                  fg={entry.status === "completed" ? theme().muted : theme().text}
                >
                  {entry.status === "completed" ? "✓" : entry.status === "in_progress" ? "›" : "○"}{" "}
                  {entry.content}
                </text>
              )}
            </For>
            <Show when={changedFiles(state.session).length}>
              <text {...selectionColors(theme())} fg={theme().accent} marginTop={1}>
                Reported diffs
              </text>
            </Show>
            <For each={changedFiles(state.session)}>
              {path => (
                <text {...selectionColors(theme())} fg={theme().muted}>
                  {relative(state.session.cwd, path)}
                </text>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
      <Show when={state.error || state.persistenceError || notice()}>
        <text
          {...selectionColors(theme())}
          fg={state.error || state.persistenceError ? theme().error : theme().muted}
          paddingX={1}
          maxHeight={3}
          flexShrink={0}
        >
          {[state.error, state.persistenceError].filter(Boolean).join(" · ") || notice()}
        </text>
      </Show>
      <Show when={palette()} keyed>
        {menu => (
          <Picker
            title={menu.title}
            choices={menu.choices}
            theme={theme()}
            keys={keys}
            active={!help()}
            height={dimensions().height}
            close={() => setPalette(undefined)}
            error={error => controller.report(error)}
          />
        )}
      </Show>
      <Show when={state.interaction} keyed>
        {interaction => (
          <InteractionView
            interaction={interaction}
            theme={theme()}
            keys={keys}
            active={!help()}
            onContext={setFormContext}
            answer={(id, content) => controller.answer(id, content)}
          />
        )}
      </Show>
      <box
        border
        borderColor={busy() ? theme().focusBorder : theme().border}
        backgroundColor={theme().panel}
        flexDirection="column"
        paddingX={1}
        flexShrink={0}
      >
        <Show when={mode()}>
          {current => (
            <text {...selectionColors(theme())} fg={theme().accent} maxHeight={1}>
              {current().name}:{" "}
              {current().options.find(option => option.value === current().currentValue)?.name ??
                String(current().currentValue)}
              {current().options.length > 1 ? ` · ${hint("app.cycle-mode", "cycle mode")}` : ""}
            </text>
          )}
        </Show>
        <Show when={attachments().length}>
          <text {...selectionColors(theme())} fg={theme().accent} maxHeight={2}>
            Attached: {attachments().join(", ")}
          </text>
        </Show>
        <textarea
          ref={editor}
          focused={!help() && !palette() && !state.interaction}
          height={Math.min(5, Math.max(2, draft().split("\n").length))}
          placeholder={
            busy()
              ? "Compose your next message…"
              : `Ask anything · / commands · @ then ${hint("composer.complete", "to attach a file")}`
          }
          {...editorColors(theme())}
          onContentChange={() => {
            const text = editor?.plainText ?? "";
            setDraft(text);
            if (text !== replacementText) {
              draftRevision++;
              replacementText = undefined;
              if (historyIndex !== -1) historyIndex = -1;
            }
          }}
        />
        <Show when={completions().length}>
          <text {...selectionColors(theme())} fg={theme().muted} maxHeight={1}>
            {completions().join("  ")} · {hint("composer.complete", "complete")}
          </text>
        </Show>
      </box>
      <StatusBar
        session={state.session}
        width={dimensions().width}
        theme={theme()}
        keys={keys}
        help={() => (help() ? setHelp(undefined) : showHelp())}
      />
      <Show when={help()}>
        {context => (
          <KeyboardHelp
            context={context()}
            keys={keys}
            theme={theme()}
            width={dimensions().width}
            height={dimensions().height}
            close={() => setHelp(undefined)}
          />
        )}
      </Show>
    </box>
  );
}
