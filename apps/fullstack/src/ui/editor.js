/**
 * Редактор коду. CodeMirror вантажиться ліниво — лише на рівнях із кодом і SQL,
 * тож мапа й довідник не платять за нього ні байтом. Якщо чанк не завантажився
 * (офлайн, заблокований CDN компанії), лишається звичайна textarea: писати код
 * можна й без підсвітки, а от без поля вводу — ні.
 */

import { el } from "@edu/pixel-ui";

let loading = null;

function loadCodeMirror() {
  loading ??= Promise.all([
    import("codemirror"),
    import("@codemirror/view"),
    import("@codemirror/commands"),
    import("@codemirror/lang-javascript"),
    import("@codemirror/lang-sql"),
  ]);
  return loading;
}

function textareaEditor({ parent, doc, onChange, onRun, readOnly }) {
  const area = el("textarea", "editor-fallback");
  area.value = doc;
  area.spellcheck = false;
  area.readOnly = readOnly;
  area.rows = Math.max(10, doc.split("\n").length + 2);
  area.addEventListener("input", () => onChange?.(area.value));
  area.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun?.();
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const { selectionStart: start, selectionEnd: end } = area;
      area.setRangeText("  ", start, end, "end");
      onChange?.(area.value);
    }
  });
  parent.append(area);
  return {
    kind: "textarea",
    getValue: () => area.value,
    setValue(text) {
      area.value = text;
      onChange?.(text);
    },
    focus: () => area.focus(),
    destroy: () => area.remove(),
  };
}

/**
 * @returns {Promise<{ kind, getValue, setValue, focus, destroy }>}
 */
export async function createEditor({ parent, doc = "", lang = "js", onChange, onRun, readOnly = false, label = "Редактор коду" }) {
  let modules;
  try {
    modules = await loadCodeMirror();
  } catch (error) {
    console.warn("CodeMirror не завантажився, працюємо з textarea", error);
    return textareaEditor({ parent, doc, onChange, onRun, readOnly });
  }
  const [{ minimalSetup, EditorView }, view, commands, js, sql] = modules;
  const { lineNumbers, keymap, highlightActiveLine, highlightActiveLineGutter } = view;
  const language = lang === "sql" ? sql.sql({ dialect: sql.PostgreSQL, upperCaseKeywords: true }) : js.javascript();
  const theme = EditorView.theme({
    "&": { fontSize: "13px", backgroundColor: "#f7f0dc", color: "#1b1610", border: "2px solid #2a2018" },
    ".cm-content": { fontFamily: "var(--font)", caretColor: "#1b1610", padding: "8px 0" },
    ".cm-gutters": { backgroundColor: "#e6dcc4", color: "#8a7c62", borderRight: "2px solid #c9bb9a" },
    ".cm-activeLine": { backgroundColor: "#efe3c3" },
    ".cm-activeLineGutter": { backgroundColor: "#d9cba6" },
    "&.cm-focused": { outline: "2px solid var(--accent-light)" },
    ".cm-scroller": { minHeight: "220px", maxHeight: "60vh" },
  });
  const editor = new EditorView({
    doc,
    parent,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      minimalSetup,
      keymap.of([{ key: "Mod-Enter", run: () => (onRun?.(), true) }, commands.indentWithTab]),
      language,
      theme,
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": label }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
      }),
    ],
  });
  return {
    kind: "codemirror",
    getValue: () => editor.state.doc.toString(),
    setValue(text) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
    },
    focus: () => editor.focus(),
    destroy: () => editor.destroy(),
  };
}
