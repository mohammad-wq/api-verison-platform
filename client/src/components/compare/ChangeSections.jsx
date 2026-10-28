import { useState } from "react";
import { Badge } from "../ui.jsx";
import { Icon } from "../icons.jsx";
import { FieldsDiff, STATUS_BADGE, TextDiff } from "./DiffViews.jsx";

function Section({ id, title, changed, text, children }) {
  return (
    <details id={`cmp-sec-${id}`} className={`cmp-section${changed ? " is-changed" : ""}`} open={changed}>
      <summary>
        <Icon name="chevron" className="cmp-caret" />
        <span className="cmp-section-title">{title}</span>
        <Badge kind={changed ? "warn" : "neutral"}>{changed ? "Changed" : "No changes"}</Badge>
        <span className="muted cmp-section-text">{text}</span>
      </summary>
      <div className="cmp-section-body">{children}</div>
    </details>
  );
}

const parameterLabel = (key) => {
  const [where, ...name] = key.split(":");
  return where === "header" ? `${name.join(":")} (header)` : name.join(":");
};

/** A diff column heading: the version number, plus a tag when the example was generated from the schema. */
function SideLabel({ version, generated }) {
  return (
    <span className="cmp-th">
      <code>{version}</code>
      {generated && (
        <span className="cmp-th-tag" title="No example is documented for this version, so one was generated from the schema">
          sample from schema
        </span>
      )}
    </span>
  );
}

function BodySection({ body, labels }) {
  if (body.presence === "none") return <p className="muted cmp-empty">No request body documented in either version.</p>;
  return (
    <>
      <div className="cmp-meta">
        <span>
          Content type: <code>{body.contentType.old ?? "none"}</code>
          {body.contentType.changed && (
            <>
              {" "}
              → <code>{body.contentType.new}</code> <Badge kind="warn">changed</Badge>
            </>
          )}
        </span>
        <span>
          Required:{" "}
          {body.required.changed ? (
            <>
              {body.required.old ? "yes" : "no"} → <strong>{body.required.new ? "yes" : "no"}</strong> <Badge kind="warn">changed</Badge>
            </>
          ) : (body.required.old ?? body.required.new) ? (
            "yes"
          ) : (
            "no"
          )}
        </span>
        {body.presence !== "both" && <Badge kind={body.presence === "added" ? "ok" : "danger"}>{body.presence === "added" ? "Body added in the newer version" : "Body removed in the newer version"}</Badge>}
      </div>
      {body.contentType.new !== "multipart/form-data" && body.contentType.old !== "multipart/form-data" && (
        <div className="cmp-block">
          <h5 className="cmp-block-title">Example request body</h5>
          <TextDiff
            rows={body.exampleRows}
            oldLabel={<SideLabel version={labels.old} generated={body.generated.old} />}
            newLabel={<SideLabel version={labels.new} generated={body.generated.new} />}
            empty="No example available in either version."
          />
        </div>
      )}
      <div className="cmp-block">
        <h5 className="cmp-block-title">Fields{body.fieldRows.length ? ` (${body.fieldRows.length})` : ""}</h5>
        <FieldsDiff rows={body.fieldRows} noun="field" oldLabel={labels.old} newLabel={labels.new} />
      </div>
    </>
  );
}

function ResponseItem({ item, labels }) {
  const kind = /^2/.test(item.status) ? "ok" : /^[45]/.test(item.status) ? "warn" : "neutral";
  return (
    <details className={`cmp-resp${item.changed ? " is-changed" : ""}`} open={item.changed && item.presence === "both"}>
      <summary>
        <Icon name="chevron" className="cmp-caret" />
        <Badge kind={kind}>{item.status}</Badge>
        <span className="cmp-resp-desc">{item.new?.description ?? item.old?.description ?? ""}</span>
        {item.presence === "added" && <Badge kind="ok">Added</Badge>}
        {item.presence === "removed" && <Badge kind="danger">Removed</Badge>}
        {item.presence === "both" && item.changed && <Badge kind="warn">Changed</Badge>}
        {item.presence === "both" && !item.changed && <span className="muted">no changes</span>}
      </summary>
      <div className="cmp-section-body">
        {item.descriptionChanged && (
          <p className="cmp-meta">
            Description: “{item.old.description}” → <strong>“{item.new.description}”</strong>
          </p>
        )}
        {item.hasExample && (
          <div className="cmp-block">
            <h5 className="cmp-block-title">Example response</h5>
            <TextDiff rows={item.exampleRows} oldLabel={<SideLabel version={labels.old} />} newLabel={<SideLabel version={labels.new} />} empty="No example documented for this response." />
          </div>
        )}
        {item.fieldRows.length > 0 && (
          <div className="cmp-block">
            <h5 className="cmp-block-title">Fields ({item.fieldRows.length})</h5>
            <FieldsDiff rows={item.fieldRows} oldLabel={labels.old} newLabel={labels.new} />
          </div>
        )}
        {item.fieldRows.length === 0 && !item.hasExample && !item.descriptionChanged && <p className="muted cmp-empty">No response body is documented for this status.</p>}
      </div>
    </details>
  );
}

function Chips({ list }) {
  return list.length ? (
    <span className="cmp-chips">
      {list.map((x) => (
        <Badge key={x} kind="info">
          {x}
        </Badge>
      ))}
    </span>
  ) : (
    <span className="muted">none</span>
  );
}

function DocsSection({ docs, labels }) {
  return (
    <div className="cmp-docs">
      <div className="cmp-doc-row">
        <span className="cmp-doc-label">Authentication</span>
        <span>
          {docs.auth.old === null ? "—" : docs.auth.old ? "required" : "public"}
          {docs.auth.changed && (
            <>
              {" "}
              → <strong>{docs.auth.new ? "required" : "public"}</strong> <Badge kind="warn">changed</Badge>
            </>
          )}
        </span>
      </div>
      {docs.items.map((item) =>
        item.rows ? (
          <div key={item.label} className="cmp-doc-block">
            <div className="cmp-doc-label">
              {item.label} {item.changed && <Badge kind="warn">changed</Badge>}
            </div>
            {item.rows.length ? <TextDiff rows={item.rows} oldLabel={<SideLabel version={labels.old} />} newLabel={<SideLabel version={labels.new} />} context={2} /> : <span className="muted">none in either version</span>}
          </div>
        ) : (
          <div key={item.label} className="cmp-doc-row">
            <span className="cmp-doc-label">{item.label}</span>
            <span className="cmp-doc-pair">
              <Chips list={item.old} />
              {item.changed && (
                <>
                  <span aria-hidden="true">→</span>
                  <Chips list={item.new} />
                  <Badge kind="warn">changed</Badge>
                </>
              )}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** The differences as short sentences, e.g. "Renamed · Request body field · email → identifier". */
function ChangeList({ changes }) {
  if (changes.length === 0) return <p className="cmp-nochange">No contract differences between these versions.</p>;
  return (
    <ul className="cmp-changes" aria-label="What changed">
      {changes.map((change, i) => (
        <li key={i} className={`cmp-change cmp-change-${change.kind}`}>
          <Badge kind={STATUS_BADGE[change.kind][0]}>{STATUS_BADGE[change.kind][1]}</Badge>
          <span className="cmp-change-area">{change.area}</span>
          <span className="cmp-change-what">
            {change.oldName ? (
              <span className="cmp-rename">
                <code className="cmp-rename-old">{change.oldName}</code>
                <Icon name="arrowRight" size="13px" />
                <code className="cmp-rename-new">{change.name}</code>
              </span>
            ) : (
              change.name && <code>{change.name}</code>
            )}
            {change.from !== undefined ? (
              <span className="cmp-fromto">
                <span className="cmp-from">{String(change.from ?? "—")}</span>
                <Icon name="arrowRight" size="13px" />
                <span className="cmp-to">{String(change.to ?? "—")}</span>
              </span>
            ) : (
              change.text && <span className="muted">{change.text}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The comparison of one endpoint (see lib/compare.js buildComparison): a plain list of what changed, then the
 * detailed side-by-side sections. Sections without changes are folded into one line so the changes stand out.
 * `labels` are the two version numbers, used as column headings.
 */
export default function ChangeSections({ comparison, labels = { old: "Older", new: "Newer" } }) {
  const { body, parameters, responses, docs, summary, changes } = comparison;
  const [showUnchanged, setShowUnchanged] = useState(false);
  const text = Object.fromEntries(summary.map((s) => [s.id, s.text]));
  const sections = [
    { id: "body", title: "Request body", changed: body.changed, content: <BodySection body={body} labels={labels} /> },
    {
      id: "parameters",
      title: "Parameters",
      changed: parameters.changed,
      content: <FieldsDiff rows={parameters.rows} labelOf={parameterLabel} noun="parameter" oldLabel={labels.old} newLabel={labels.new} />,
    },
    {
      id: "responses",
      title: "Responses",
      changed: responses.changed,
      content:
        responses.items.length === 0 ? (
          <p className="muted cmp-empty">No responses documented in either version.</p>
        ) : (
          responses.items.map((item) => <ResponseItem key={item.status} item={item} labels={labels} />)
        ),
    },
    { id: "docs", title: "Documentation", changed: docs.changed, content: <DocsSection docs={docs} labels={labels} /> },
  ];
  const unchanged = sections.filter((s) => !s.changed);
  const render = (s) => (
    <Section key={s.id} id={s.id} title={s.title} changed={s.changed} text={text[s.id]}>
      {s.content}
    </Section>
  );
  return (
    <div className="cmp-sections">
      <ChangeList changes={changes} />
      {sections.filter((s) => s.changed).map(render)}
      {unchanged.length > 0 && (
        <div className="cmp-unchanged">
          <span className="muted">
            <Icon name="check" size="14px" /> No changes in {unchanged.map((s) => s.title.toLowerCase()).join(", ")}
          </span>
          <button type="button" className="link cmp-toggle" onClick={() => setShowUnchanged(!showUnchanged)} aria-expanded={showUnchanged}>
            {showUnchanged ? "Hide" : "Show"}
          </button>
        </div>
      )}
      {showUnchanged && unchanged.map(render)}
    </div>
  );
}
