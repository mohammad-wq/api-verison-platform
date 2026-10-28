import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collapseRows, describeEntry, sideText, unifiedRows } from "../../lib/diff.js";
import { Badge } from "../ui.jsx";
import { Icon } from "../icons.jsx";

/** Diff reading preferences, provided by the dialog: layout (split | unified), fold unchanged lines, wrap long lines. */
export const DiffPrefs = createContext({ layout: "split", fold: true, wrap: true });

function Text({ text, mark }) {
  if (!mark || mark[1] <= mark[0]) return <>{text || " "}</>;
  return (
    <>
      {text.slice(0, mark[0])}
      <mark className="cmp-mark">{text.slice(mark[0], mark[1])}</mark>
      {text.slice(mark[1])}
    </>
  );
}

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      /* clipboard unavailable (insecure context): nothing to do */
    }
  };
  return (
    <button type="button" className="cmp-copy" onClick={copy} disabled={!text} title={`Copy the ${label.toLowerCase()}`} aria-label={`Copy the ${label.toLowerCase()}`}>
      <Icon name={done ? "check" : "copy"} size="14px" />
      <span>{done ? "Copied" : `Copy ${label.split(" ")[0].toLowerCase()}`}</span>
    </button>
  );
}

function Line({ row }) {
  return (
    <tr className={`cmp-line cmp-${row.type}`}>
      <td className="cmp-no">{row.left?.no}</td>
      <td className="cmp-code cmp-old">{row.left && <Text text={row.left.text} mark={row.marks?.left} />}</td>
      <td className="cmp-no">{row.right?.no}</td>
      <td className="cmp-code cmp-new">{row.right && <Text text={row.right.text} mark={row.marks?.right} />}</td>
    </tr>
  );
}

const SIGN = { same: " ", del: "-", add: "+" };

function UnifiedLine({ row }) {
  return (
    <tr className={`cmp-uline cmp-u-${row.type}`}>
      <td className="cmp-no">{row.oldNo}</td>
      <td className="cmp-no">{row.newNo}</td>
      <td className="cmp-sign" aria-hidden="true">
        {SIGN[row.type]}
      </td>
      <td className="cmp-code">
        <Text text={row.text} mark={row.mark} />
      </td>
    </tr>
  );
}

/**
 * The older and newer text as an aligned diff. Layout "split": two columns (older left, newer right);
 * "unified": one column of -/+ lines. Removed lines are red, added lines green, edited lines highlight the
 * changed characters, and (when folding is on) long unchanged stretches collapse into a "N unchanged lines"
 * row that expands on click. Each side can be copied whole.
 */
export function TextDiff({ rows, oldLabel, newLabel, context = 3, empty = "Nothing documented in either version.", copyable = true }) {
  const { layout, fold, wrap } = useContext(DiffPrefs);
  const [expanded, setExpanded] = useState(() => new Set());
  const unified = layout === "unified";
  const source = useMemo(() => (unified ? unifiedRows(rows) : rows), [rows, unified]);
  const folded = useMemo(() => (fold ? collapseRows(source, context) : source), [source, context, fold]);
  const oldText = useMemo(() => sideText(rows, "left"), [rows]);
  const newText = useMemo(() => sideText(rows, "right"), [rows]);
  if (rows.length === 0) return <p className="muted cmp-empty">{empty}</p>;
  const Row = unified ? UnifiedLine : Line;
  const cols = unified ? 4 : 4;
  const changed = source.some((r) => r.type !== "same");
  return (
    <div className={`cmp-diff${wrap ? " is-wrap" : ""}${unified ? " is-unified" : ""}`}>
      <div className="cmp-diff-bar">
        {unified ? (
          <>
            <span className="cmp-side older">{oldLabel}</span>
            <span className="cmp-side newer">{newLabel}</span>
          </>
        ) : null}
        <span className="grow" />
        {copyable && (
          <>
            <CopyButton text={oldText} label="Older example" />
            <CopyButton text={newText} label="Newer example" />
          </>
        )}
      </div>
      <div className="cmp-diff-scroll">
        <table>
          <colgroup>
            <col className="cmp-col-no" />
            <col className={unified ? "cmp-col-no" : undefined} />
            {unified && <col className="cmp-col-sign" />}
            {!unified && <col className="cmp-col-no" />}
            <col />
          </colgroup>
          {!unified && (
            <thead>
              <tr>
                <th colSpan={2} className="older">
                  {oldLabel}
                </th>
                <th colSpan={2} className="newer">
                  {newLabel}
                </th>
              </tr>
            </thead>
          )}
          <tbody>
            {folded.map((row, i) =>
              row.type !== "gap" ? (
                <Row key={i} row={row} />
              ) : expanded.has(i) ? (
                row.rows.map((inner, k) => <Row key={`${i}-${k}`} row={inner} />)
              ) : (
                <tr key={i} className="cmp-gap">
                  <td colSpan={cols}>
                    <button type="button" onClick={() => setExpanded(new Set(expanded).add(i))}>
                      ⋯ {row.count} unchanged line{row.count === 1 ? "" : "s"} — show
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {!changed && <p className="cmp-same-note">No differences — both versions are identical.</p>}
    </div>
  );
}

const STATUS_BADGE = {
  added: ["ok", "Added"],
  removed: ["danger", "Removed"],
  changed: ["warn", "Changed"],
};

/** A field-by-field table: Older | Newer | Change, unchanged rows tucked behind a toggle. */
export function FieldsDiff({ rows, labelOf = (key) => key, oldLabel = "Older", newLabel = "Newer", noun = "field" }) {
  const changedRows = rows.filter((r) => r.status !== "same");
  const [showSame, setShowSame] = useState(false);
  if (rows.length === 0) return <p className="muted cmp-empty">No {noun}s documented in either version.</p>;
  const visible = showSame || changedRows.length === 0 ? rows : changedRows;
  const hidden = rows.length - changedRows.length;
  return (
    <div className="cmp-fields">
      <table>
        <thead>
          <tr>
            <th>{noun[0].toUpperCase() + noun.slice(1)}</th>
            <th>{oldLabel}</th>
            <th>{newLabel}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.key} className={`cmp-frow cmp-f-${row.status}`}>
              <td>
                <code>{labelOf(row.key)}</code>
              </td>
              <td className={row.old ? "" : "cmp-none"}>{row.old ? describeEntry(row.old) : "—"}</td>
              <td className={row.new ? "" : "cmp-none"}>{row.new ? describeEntry(row.new) : "—"}</td>
              <td className="cmp-fstatus">{STATUS_BADGE[row.status] && <Badge kind={STATUS_BADGE[row.status][0]}>{STATUS_BADGE[row.status][1]}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {changedRows.length > 0 && hidden > 0 && (
        <button type="button" className="link cmp-toggle" onClick={() => setShowSame(!showSame)}>
          {showSame ? "Hide unchanged" : `Show ${hidden} unchanged ${noun}${hidden === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
