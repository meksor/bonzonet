<script lang="ts">
  import { onDestroy, onMount, createEventDispatcher } from "svelte";
  import {
    Annotation,
    Compartment,
    EditorState,
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Text,
    type Transaction,
  } from "@codemirror/state";
  import {
    Decoration,
    EditorView,
    keymap,
    type DecorationSet,
  } from "@codemirror/view";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
  } from "@codemirror/commands";
  import {
    lintGutter,
    setDiagnosticsEffect,
    type Diagnostic,
  } from "@codemirror/lint";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { wgsl } from "@codemirror/lang-wgsl";
  import { tags } from "@lezer/highlight";

  type ConfirmPayload = {
    text: string;
    line: number;
  };

  type LiveChangePayload = {
    text: string;
    line: number;
  };

  const dispatch = createEventDispatcher<{
    confirm: ConfirmPayload;
    livechange: LiveChangePayload;
    updateUsage: number;
  }>();

  let {
    value = "",
    charBudget = 200,
    disabled = false,
    autofocus = false,
    compileError = "",
  }: {
    value: string;
    charBudget: number;
    disabled: boolean;
    autofocus?: boolean;
    compileError?: string;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  const editableCompartment = new Compartment();
  const externalSync = Annotation.define<boolean>();
  const setEditableRangesEffect =
    StateEffect.define<Array<{ from: number; to: number }>>();

  const lockedCodeMark = Decoration.mark({ class: "cm-locked-code" });

  const editorTheme = EditorView.theme({
    "&": {
      height: "100%",
      color: "#e7f7ea",
      backgroundColor: "#08111b",
    },
    ".cm-scroller": {
      fontFamily: "JetBrains Mono, Fira Code, monospace",
      lineHeight: "1.55",
    },
    ".cm-content": {
      padding: "0.8rem 0",
      caretColor: "#7CFF6B",
    },
    ".cm-line": {
      padding: "0 0.85rem",
    },
    ".cm-gutters": {
      backgroundColor: "#0b1622",
      color: "#4f6d5a",
      borderRight: "1px solid #17311c",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "rgba(124, 255, 107, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(124, 255, 107, 0.18) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#7CFF6B",
      borderLeftWidth: "2px",
    },
    ".cm-tooltip": {
      border: "1px solid #285735",
      backgroundColor: "#0c1722",
      color: "#e7f7ea",
    },
    ".cm-diagnostic": {
      padding: "0.1rem 0.25rem",
    },
    ".cm-diagnostic-error": {
      borderLeft: "3px solid #ff6b6b",
    },
    ".cm-lintRange-error": {
      backgroundColor: "rgba(255, 107, 107, 0.14)",
      textDecoration: "underline wavy #ff6b6b",
      textUnderlineOffset: "0.18rem",
    },
    ".cm-locked-code": {
      opacity: "0.52",
      filter: "saturate(0.55)",
    },
  });

  const editorHighlightStyle = HighlightStyle.define([
    {
      tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword],
      color: "#ff8a65",
    },
    { tag: [tags.typeName, tags.standard(tags.typeName)], color: "#4dd0e1" },
    { tag: [tags.variableName, tags.propertyName], color: "#d7f9de" },
    { tag: [tags.number, tags.bool, tags.null], color: "#ffd166" },
    { tag: [tags.string], color: "#c3e88d" },
    { tag: [tags.comment], color: "#6c8a75", fontStyle: "italic" },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: "#82aaff",
    },
    { tag: [tags.punctuation, tags.bracket], color: "#9bc2a6" },
  ]);

  const buildLockedDecorations = (
    doc: Text,
    editableRanges: Array<{ from: number; to: number }>,
  ) => {
    const builder = new RangeSetBuilder<Decoration>();
    let cursor = 0;

    for (const range of normalizeRanges(editableRanges)) {
      if (range.from > cursor) {
        builder.add(cursor, range.from, lockedCodeMark);
      }
      cursor = Math.max(cursor, range.to);
    }

    if (cursor < doc.length) {
      builder.add(cursor, doc.length, lockedCodeMark);
    }

    return builder.finish();
  };

  const lockedCodeField = StateField.define<{
    editableRanges: Array<{ from: number; to: number }>;
    decorations: DecorationSet;
  }>({
    create(state) {
      return {
        editableRanges: [],
        decorations: buildLockedDecorations(state.doc, []),
      };
    },
    update(value, transaction) {
      let editableRanges = value.editableRanges
        .map((range) => ({
          from: transaction.changes.mapPos(range.from, 1),
          to: transaction.changes.mapPos(range.to, -1),
        }))
        .filter((range) => range.to > range.from);

      for (const effect of transaction.effects) {
        if (effect.is(setEditableRangesEffect)) {
          editableRanges = normalizeRanges(effect.value);
        }
      }

      return {
        editableRanges,
        decorations: buildLockedDecorations(
          transaction.state.doc,
          editableRanges,
        ),
      };
    },
    provide(field) {
      return EditorView.decorations.from(field, (value) => value.decorations);
    },
  });

  let currentValue = $state("");
  let baselineValue = $state("");
  let insertionLine = $state(1);
  let charsUsed = $state(0);
  let turnAddedRanges: Array<{ from: number; to: number }> = [];

  const countNonWhitespace = (s: string) => s.replace(/\s/g, "").length;

  const updateUsage = () => {
    charsUsed = Math.max(0, countNonWhitespace(currentValue) - countNonWhitespace(baselineValue));
    dispatch("updateUsage", charsUsed);
  };

  const parseCompileDiagnostics = (
    errorText: string,
    doc: Text,
  ): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const lines = errorText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const webglMatch = line.match(/^ERROR:\s*\d+:(\d+):\s*(.+)$/i);
      if (webglMatch) {
        const lineNumber = Number(webglMatch[1]);
        const docLine = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
        diagnostics.push({
          from: docLine.from,
          to: Math.max(docLine.from + 1, docLine.to),
          severity: "error",
          message: webglMatch[2],
          source: "WebGL",
        });
        continue;
      }

      const angleMatch = line.match(/^(\d+):(\d+):\s*(.+)$/);
      if (angleMatch) {
        const lineNumber = Number(angleMatch[1]);
        const columnNumber = Number(angleMatch[2]);
        const docLine = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
        const from = Math.min(
          docLine.to,
          docLine.from + Math.max(columnNumber - 1, 0),
        );
        diagnostics.push({
          from,
          to: Math.max(from + 1, docLine.to),
          severity: "error",
          message: angleMatch[3],
          source: "Compiler",
        });
      }
    }

    if (diagnostics.length > 0) {
      return diagnostics;
    }

    if (!errorText.trim()) {
      return [];
    }

    const fallbackLine = doc.line(1);
    return [
      {
        from: fallbackLine.from,
        to: Math.max(fallbackLine.from + 1, fallbackLine.to),
        severity: "error",
        message: errorText.trim(),
        source: "Compiler",
      },
    ];
  };

  const normalizeRanges = (ranges: Array<{ from: number; to: number }>) => {
    if (ranges.length === 0) return [];

    const sorted = [...ranges]
      .filter((range) => range.to > range.from)
      .sort((a, b) => a.from - b.from);

    if (sorted.length === 0) return [];

    const merged: Array<{ from: number; to: number }> = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const last = merged[merged.length - 1];
      if (current.from <= last.to) {
        last.to = Math.max(last.to, current.to);
      } else {
        merged.push({ ...current });
      }
    }

    return merged;
  };

  const isRangeCovered = (
    from: number,
    to: number,
    ranges: Array<{ from: number; to: number }>,
  ) => {
    let cursor = from;
    for (const range of ranges) {
      if (range.to <= cursor) continue;
      if (range.from > cursor) return false;
      cursor = Math.max(cursor, range.to);
      if (cursor >= to) return true;
    }
    return cursor >= to;
  };

  const canApplyDeletion = (transaction: Transaction): boolean => {
    let valid = true;
    transaction.changes.iterChanges((fromA, toA) => {
      if (!valid) return;
      if (toA > fromA && !isRangeCovered(fromA, toA, turnAddedRanges)) {
        valid = false;
      }
    });
    return valid;
  };

  const mapRangesThroughTransaction = (
    transaction: Transaction,
    ranges: Array<{ from: number; to: number }>,
  ) => {
    const mapped = ranges
      .map((range) => {
        const from = transaction.changes.mapPos(range.from, 1);
        const to = transaction.changes.mapPos(range.to, -1);
        return { from, to };
      })
      .filter((range) => range.to > range.from);

    transaction.changes.iterChanges((_fromA, _toA, fromB, toB) => {
      if (toB > fromB) {
        mapped.push({ from: fromB, to: toB });
      }
    });

    return normalizeRanges(mapped);
  };

  const createState = (initialText: string) =>
    EditorState.create({
      doc: initialText,
      extensions: [
        history(),
        keymap.of([
          {
            key: "Shift-Enter",
            run: () => {
              if (disabled || charsUsed > charBudget) return true;
              onConfirm();
              return true;
            },
          },
          indentWithTab,
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        wgsl(),
        syntaxHighlighting(editorHighlightStyle),
        editorTheme,
        lintGutter(),
        editableCompartment.of(EditorView.editable.of(!disabled)),
        lockedCodeField,
        EditorState.transactionFilter.of((transaction) => {
          if (transaction.annotation(externalSync)) {
            return transaction;
          }

          if (!canApplyDeletion(transaction)) {
            return [];
          }

          return transaction;
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;

          let hasLocalChange = false;

          update.transactions.forEach((transaction) => {
            if (transaction.annotation(externalSync)) return;
            hasLocalChange = true;
            turnAddedRanges = mapRangesThroughTransaction(
              transaction,
              turnAddedRanges,
            );
          });

          currentValue = update.state.doc.toString();
          update.transactions.forEach((transaction) => {
            transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
              if (toA === fromA && toB > fromB) {
                insertionLine = transaction.startState.doc.lineAt(fromA).number;
              }
            });
          });
          updateUsage();

          if (hasLocalChange) {
            view?.dispatch({
              effects: setEditableRangesEffect.of(turnAddedRanges),
            });

            dispatch("livechange", {
              text: currentValue,
              line: insertionLine,
            });
          }
        }),
      ],
    });

  onMount(() => {
    currentValue = value;
    baselineValue = value;
    updateUsage();
    view = new EditorView({
      state: createState(value),
      parent: host,
    });
  });

  $effect(() => {
    if (!view) return;

    view.dispatch({
      effects: editableCompartment.reconfigure(
        EditorView.editable.of(!disabled),
      ),
    });
  });

  $effect(() => {
    if (!view || !autofocus) return;
    view.focus();
  });

  $effect(() => {
    if (!view) return;

    const doc = view.state.doc.toString();
    if (value === doc) return;

    baselineValue = value;
    currentValue = value;
    turnAddedRanges = [];
    insertionLine = 1;
    updateUsage();

    view.dispatch({
      annotations: externalSync.of(true),
      effects: setEditableRangesEffect.of([]),
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  });

  $effect(() => {
    if (!view) return;

    view.dispatch({
      effects: setDiagnosticsEffect.of(
        parseCompileDiagnostics(compileError, view.state.doc),
      ),
    });
  });

  const onConfirm = () => {
    dispatch("confirm", {
      text: currentValue,
      line: insertionLine,
    });

    baselineValue = currentValue;
    turnAddedRanges = [];
    updateUsage();
  };

  onDestroy(() => {
    view?.destroy();
  });
</script>

<div class="editor" class:turn-active={!disabled}>
  <div bind:this={host} class="editor-surface"></div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 100%;
    opacity: .75;
  }

  .editor-surface {
    border: 1px solid #244134;
    border-radius: 0.3rem;
    min-height: 100%;
    max-height: none;
    overflow: auto;
    background: rgba(8, 17, 27, 0.38);
    backdrop-filter: blur(2px);
  }

  .turn-active .editor-surface {
    border-color: #44d35a;
    box-shadow:
      0 0 0 1px rgba(68, 211, 90, 0.4),
      inset 0 0 0 1px rgba(68, 211, 90, 0.08);
  }

</style>
