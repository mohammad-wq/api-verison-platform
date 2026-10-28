import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons.jsx";

const MAX_HITS = 5000;

/**
 * Find-in-text state: every (non-overlapping) occurrence of `query` in `text`, and a "current" one
 * that next/prev move through. Shared by the read-only JSON view and the JSON editor.
 */
export function useFind(text) {
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);

  const hits = useMemo(() => {
    if (!query) return [];
    const haystack = matchCase ? text : text.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    const out = [];
    let from = 0;
    while (out.length < MAX_HITS) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      out.push(at);
      from = at + needle.length;
    }
    return out;
  }, [text, query, matchCase]);

  // A new search always starts at the first match.
  useEffect(() => setIndex(0), [query, matchCase]);

  const count = hits.length;
  const current = count ? Math.min(index, count - 1) : 0;
  const go = (delta) => count > 0 && setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);

  return {
    query,
    setQuery,
    matchCase,
    setMatchCase,
    hits,
    length: query.length,
    count,
    index: current,
    capped: count >= MAX_HITS,
    next: () => go(1),
    prev: () => go(-1),
  };
}

/**
 * The search bar above a JSON box: query input, match counter, previous/next, match-case toggle and an
 * optional "jump to" list (used to land on one endpoint of a big OpenAPI document).
 */
export function FindBar({ find, inputRef, jumpOptions, onJump, onEscape, onAccept, hint }) {
  // Keeps the chosen endpoint visible after jumping; picking "Endpoint…" clears it again.
  const [jumpTarget, setJumpTarget] = useState("");
  const jumpValue = jumpOptions?.[Number(jumpTarget)] !== undefined ? jumpTarget : "";
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === "F3") {
      event.preventDefault();
      if (event.shiftKey) find.prev();
      else find.next();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (find.query) find.setQuery("");
      onEscape?.();
    }
  };

  return (
    <div className="findbar" role="search">
      <div className="findbar-input">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          value={find.query}
          onChange={(e) => find.setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          aria-label="Find in document"
          spellCheck={false}
        />
      </div>
      <div className="findbar-controls">
        <span className={`findbar-count${find.query && find.count === 0 ? " none" : ""}`} aria-live="polite">
          {find.query ? (find.count ? `${find.index + 1} of ${find.count}${find.capped ? "+" : ""}` : "No matches") : ""}
        </span>
        <button type="button" className="icon-btn findbar-nav-btn" onClick={find.prev} disabled={!find.count} title="Previous match (Shift+Enter)" aria-label="Previous match">
          <Icon name="up" />
        </button>
        <button type="button" className="icon-btn findbar-nav-btn" onClick={find.next} disabled={!find.count} title="Next match (Enter)" aria-label="Next match">
          <Icon name="down" />
        </button>
      </div>
      <button
        type="button"
        className={`findbar-toggle${find.matchCase ? " on" : ""}`}
        onClick={() => find.setMatchCase(!find.matchCase)}
        disabled={!find.query}
        title={find.query ? "Match case" : "Enter a search term to enable match case"}
        aria-label="Match case"
        aria-pressed={find.matchCase}
      >
        <span className="findbar-toggle-glyph" aria-hidden="true">Aa</span>
        <span>Match case</span>
      </button>
      {onAccept && (
        <button type="button" className="btn btn-small" onClick={onAccept} disabled={!find.count} title="Put the cursor on this match so you can edit it (Esc)">
          <Icon name="edit" /> Edit match
        </button>
      )}
      {jumpOptions?.length > 0 && (
        <label className="findbar-jump">
          <span>Jump to</span>
          <select
            aria-label="Jump to endpoint"
            value={jumpValue}
            onChange={(e) => {
              const value = e.target.value;
              setJumpTarget(value);
              if (value === "") return;
              onJump(jumpOptions[Number(value)]);
            }}
          >
            <option value="">Endpoint…</option>
            {jumpOptions.map((option, i) => (
              <option key={option.label} value={i}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {hint && <span className="muted findbar-hint">{hint}</span>}
    </div>
  );
}

/** Key handler for the box wrapper: Ctrl/Cmd+F (or F3) while the focus is inside the box focuses its find bar instead of the browser's page search. */
export const findShortcut = (inputRef) => (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    inputRef.current?.focus();
    inputRef.current?.select();
  } else if (event.key === "F3") {
    event.preventDefault();
    inputRef.current?.focus();
  }
};

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * HTML for `text` with JSON syntax colours (when `json`) and <mark> elements on every search hit.
 * `hits` are ascending start offsets of matches that are `length` characters long.
 */
export function highlightedHtml(text, { json = true, hits = [], length = 0, current = 0 } = {}) {
  let out = "";
  let h = 0;

  const emit = (start, end, cls) => {
    const open = cls ? `<span class="${cls}">` : "";
    const close = cls ? "</span>" : "";
    while (start < end) {
      while (h < hits.length && hits[h] + length <= start) h++;
      if (h >= hits.length || hits[h] >= end) {
        out += open + escapeHtml(text.slice(start, end)) + close;
        return;
      }
      const hitStart = Math.max(start, hits[h]);
      const hitEnd = Math.min(end, hits[h] + length);
      if (hitStart > start) out += open + escapeHtml(text.slice(start, hitStart)) + close;
      out += `${open}<mark class="find-hit${h === current ? " find-current" : ""}" data-hit="${h}">${escapeHtml(text.slice(hitStart, hitEnd))}</mark>${close}`;
      start = hitEnd;
    }
  };

  if (!json) {
    emit(0, text.length, null);
    return out;
  }
  let pos = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > pos) emit(pos, match.index, null);
    const token = match[0];
    let cls = "j-num";
    if (token.startsWith('"')) cls = match[2] ? "j-key" : "j-str";
    else if (token === "true" || token === "false") cls = "j-bool";
    else if (token === "null") cls = "j-null";
    emit(match.index, match.index + token.length, cls);
    pos = match.index + token.length;
  }
  if (pos < text.length) emit(pos, text.length, null);
  return out;
}

/** Scrolls the <pre> so the current hit sits mid-box (only the box scrolls, never the page). */
export function useScrollToHit(preRef, deps) {
  useEffect(() => {
    const pre = preRef.current;
    const mark = pre?.querySelector("mark.find-current");
    if (mark) pre.scrollTop = Math.max(0, mark.offsetTop - pre.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
