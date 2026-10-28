import { Badge } from "../ui.jsx";
import { Icon } from "../icons.jsx";
import { FieldsDiff, TextDiff } from "./DiffViews.jsx";

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

function BodySection({ body }) {
  if (body.presence === "none") return <p className="muted cmp-empty">No request body documented in either version.</p>;
  const generated = (side) => (body.generated[side] ? " (generated from the schema — no example documented)" : "");
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
          <TextDiff rows={body.exampleRows} oldLabel={`Older example${generated("old")}`} newLabel={`Newer example${generated("new")}`} empty="No example available in either version." />
        </div>
      )}
      <div className="cmp-block">
        <h5 className="cmp-block-title">Fields{body.fieldRows.length ? ` (${body.fieldRows.length})` : ""}</h5>
        <FieldsDiff rows={body.fieldRows} noun="field" />
      </div>
    </>
  );
}

function ResponseItem({ item }) {
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
            <TextDiff rows={item.exampleRows} oldLabel="Older example" newLabel="Newer example" empty="No example documented for this response." />
          </div>
        )}
        {item.fieldRows.length > 0 && (
          <div className="cmp-block">
            <h5 className="cmp-block-title">Fields ({item.fieldRows.length})</h5>
            <FieldsDiff rows={item.fieldRows} />
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

function DocsSection({ docs }) {
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
            {item.rows.length ? <TextDiff rows={item.rows} oldLabel="Older" newLabel="Newer" context={2} /> : <span className="muted">none in either version</span>}
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

/** The detailed, side-by-side change sections for one endpoint (see lib/compare.js buildComparison). */
export default function ChangeSections({ comparison }) {
  const { body, parameters, responses, docs, summary } = comparison;
  const text = Object.fromEntries(summary.map((s) => [s.id, s.text]));
  return (
    <div className="cmp-sections">
      <Section id="body" title="Request body" changed={body.changed} text={text.body}>
        <BodySection body={body} />
      </Section>
      <Section id="parameters" title="Parameters" changed={parameters.changed} text={text.parameters}>
        <FieldsDiff rows={parameters.rows} labelOf={parameterLabel} noun="parameter" />
      </Section>
      <Section id="responses" title="Responses" changed={responses.changed} text={text.responses}>
        {responses.items.length === 0 ? <p className="muted cmp-empty">No responses documented in either version.</p> : responses.items.map((item) => <ResponseItem key={item.status} item={item} />)}
      </Section>
      <Section id="docs" title="Documentation" changed={docs.changed} text={text.docs}>
        <DocsSection docs={docs} />
      </Section>
    </div>
  );
}
