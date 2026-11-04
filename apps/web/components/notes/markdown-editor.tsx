"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, MatchDecorator, placeholder, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { useEffect, useRef } from "react";

/**
 * Editor Markdown (CodeMirror 6). Se carga de forma diferida solo en la página de nota.
 * Resaltado propio a partir del árbol sintáctico de lang-markdown (clases `cm-md-*` con tokens del tema),
 * más decoraciones para [[wikilinks]], @menciones / #proyectos y el frontmatter YAML.
 */

const NODE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h4",
  ATXHeading6: "cm-md-h4",
  SetextHeading1: "cm-md-h1",
  SetextHeading2: "cm-md-h2",
  Emphasis: "cm-md-em",
  StrongEmphasis: "cm-md-strong",
  Strikethrough: "cm-md-del",
  InlineCode: "cm-md-code",
  FencedCode: "cm-md-codeblock",
  CodeBlock: "cm-md-codeblock",
  Link: "cm-md-link",
  Image: "cm-md-link",
  URL: "cm-md-url",
  Autolink: "cm-md-url",
  Blockquote: "cm-md-quote",
  HeaderMark: "cm-md-mark",
  EmphasisMark: "cm-md-mark",
  CodeMark: "cm-md-mark",
  CodeInfo: "cm-md-mark",
  LinkMark: "cm-md-mark",
  QuoteMark: "cm-md-mark",
  ListMark: "cm-md-list",
  TaskMarker: "cm-md-list",
  HorizontalRule: "cm-md-mark",
};

const decoCache = new Map<string, Decoration>();
const mark = (cls: string) => {
  let d = decoCache.get(cls);
  if (!d) {
    d = Decoration.mark({ class: cls });
    decoCache.set(cls, d);
  }
  return d;
};

function frontmatterEnd(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return -1;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) if (doc.line(i).text.trim() === "---") return doc.line(i).to;
  return -1;
}

function buildMarkdownDecos(view: EditorView): DecorationSet {
  const fmEnd = frontmatterEnd(view);
  const ranges: { from: number; to: number; cls: string }[] = [];
  if (fmEnd > 0) ranges.push({ from: 0, to: fmEnd, cls: "cm-md-frontmatter" });
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.to <= fmEnd) return false;
        const cls = NODE_CLASS[node.name];
        if (cls && node.to > node.from) ranges.push({ from: Math.max(node.from, fmEnd + 1), to: node.to, cls });
        return undefined;
      },
    });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const b = new RangeSetBuilder<Decoration>();
  for (const r of ranges) if (r.to > r.from) b.add(r.from, r.to, mark(r.cls));
  return b.finish();
}

const markdownHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkdownDecos(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.decorations = buildMarkdownDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const linkMatcher = new MatchDecorator({
  regexp: /!?\[\[[^[\]\n]+\]\]|(?<=^|[\s([{"«])[@#](?:\[[^\]\n]+\]|[\p{L}\p{N}][\p{L}\p{N}_-]*)/gu,
  decoration: (m) => mark(m[0].startsWith("@") || m[0].startsWith("#") ? "cm-md-mention" : "cm-md-wikilink"),
});
const linkHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = linkMatcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = linkMatcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "16px" },
  "@media (min-width: 768px)": { "&": { fontSize: "15px" } },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.7", overflow: "visible" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-md-h1": { fontSize: "1.45em", fontWeight: "650", color: "var(--text)" },
  ".cm-md-h2": { fontSize: "1.25em", fontWeight: "650", color: "var(--text)" },
  ".cm-md-h3": { fontSize: "1.1em", fontWeight: "650", color: "var(--text)" },
  ".cm-md-h4": { fontWeight: "650", color: "var(--text)" },
  ".cm-md-strong": { fontWeight: "700", color: "var(--text)" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-del": { textDecoration: "line-through", color: "var(--text-muted)" },
  ".cm-md-code, .cm-md-codeblock": {
    color: "var(--accent-2)",
    backgroundColor: "var(--surface-2)",
    borderRadius: "4px",
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
  },
  ".cm-md-link": { color: "var(--accent-2)" },
  ".cm-md-url": { color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-md-quote": { color: "var(--text-muted)", fontStyle: "italic" },
  ".cm-md-mark": { color: "var(--text-faint)" },
  ".cm-md-list": { color: "var(--accent)", fontWeight: "600" },
  ".cm-md-frontmatter": { color: "var(--text-muted)", backgroundColor: "color-mix(in srgb, var(--surface-2) 70%, transparent)" },
  ".cm-md-wikilink, .cm-md-wikilink .cm-md-link, .cm-md-link .cm-md-wikilink": {
    color: "var(--accent)",
    backgroundColor: "var(--accent-soft)",
    borderRadius: "4px",
  },
  ".cm-md-frontmatter, .cm-md-frontmatter *": { fontFamily: "var(--font-mono)", fontSize: "0.92em" },
  ".cm-md-mention": { color: "var(--success)", fontWeight: "500" },
});

export type MarkdownEditorProps = {
  /** Valor inicial (el editor es no controlado). */
  value: string;
  /** Reemplazo externo del contenido (restaurar versión, enlazar mención…): cambia `nonce` para aplicarlo. */
  replace?: { text: string; nonce: number } | null;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholderText?: string;
};

export default function MarkdownEditor({ value, replace, onChange, onBlur, label = "Contenido de la nota (Markdown)", placeholderText }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onBlur });
  cb.current = { onChange, onBlur };

  // biome-ignore lint/correctness/useExhaustiveDependencies: el editor se crea una sola vez; el valor externo se sincroniza abajo
  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage }),
      markdownHighlight,
      linkHighlight,
      EditorView.lineWrapping,
      theme,
      placeholder(placeholderText ?? "Escribí en Markdown. [[Nota]] enlaza, @cliente y #proyecto mencionan."),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true", autocapitalize: "sentences" }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) cb.current.onChange(u.state.doc.toString());
        if (u.focusChanged && !u.view.hasFocus) cb.current.onBlur?.();
      }),
    ];
    const v = new EditorView({ doc: value, extensions, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && replace && v.state.doc.toString() !== replace.text) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: replace.text } });
  }, [replace]);

  return <div ref={host} className="min-h-[55vh] md:min-h-[60vh]" data-testid="note-editor" />;
}
