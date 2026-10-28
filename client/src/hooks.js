import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async loader on mount and whenever `deps` change.
 * Returns { data, error, loading, reload }. Stale responses are ignored.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const counter = useRef(0);

  const run = useCallback(() => {
    const id = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => id === counter.current && setState({ data, error: null, loading: false }))
      .catch((error) => id === counter.current && setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    return () => {
      counter.current++;
    };
  }, [run]);

  return { ...state, reload: run };
}

/** Wraps a submit-style async action with a busy flag and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

/* ------------------------------------------------------------------ *
 * Persistent drafts
 *
 * Form inputs survive switching tabs/pages (kept in memory) and reloads
 * (kept in localStorage, per user). Values that look secret are blanked
 * before they are written to localStorage, so passwords never hit disk.
 * ------------------------------------------------------------------ */

const STORAGE_PREFIX = "apvp.draft.";
const SESSION_PREFIX = "apvp.session.";
const memory = new Map();
let scope = "anon";

/** Namespaces drafts per user. Called by the auth provider whenever the user changes. */
export function setDraftScope(userId) {
  scope = String(userId ?? "anon");
}

/** Forgets in-memory drafts and session values such as API tokens (used on logout). Saved, sanitised drafts remain for the next login. */
export function clearMemoryDrafts() {
  memory.clear();
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const fullKey = (key) => `${scope}.${key}`;

function readStored(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + fullKey(key));
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeStored(key, value) {
  try {
    const text = JSON.stringify(value);
    if (text === undefined || text.length > 1_000_000) return; // too large to keep
    localStorage.setItem(STORAGE_PREFIX + fullKey(key), text);
  } catch {
    /* storage full or unavailable: the draft just stays in memory */
  }
}

/** Removes a draft from memory and storage (e.g. after the form was submitted). */
export function discardDraft(key) {
  memory.delete(fullKey(key));
  try {
    localStorage.removeItem(STORAGE_PREFIX + fullKey(key));
  } catch {
    /* ignore */
  }
}

const SECRET_KEY = /pass(word|wd|phrase)|^pass$|pwd|secret|token|authorization|cookie|api[-_]?key|^(pin|otp|auth)$/i;

/** Blanks string values whose key looks secret, at any depth. */
export function maskSecrets(value) {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) && typeof v === "string" ? "" : maskSecrets(v)]),
    );
  }
  return value;
}

/** Like maskSecrets, but for [{ key, value }] rows (headers, query parameters). */
export const maskSecretRows = (rows) => rows.map((row) => (SECRET_KEY.test(row.key) ? { ...row, value: "" } : row));

/** Masks secrets inside a JSON text (e.g. a login payload); invalid JSON is dropped. */
export function maskSecretsInJson(text, fallback = "") {
  try {
    return JSON.stringify(maskSecrets(JSON.parse(text)), null, 2);
  } catch {
    return fallback;
  }
}

/**
 * useState that remembers its value under `key`.
 * - Survives navigation (memory) and, unless `memoryOnly`, reloads (localStorage).
 * - `sanitize(value)` is applied before writing to localStorage only.
 * The key is read once per mount: give components a `key` prop when the draft key changes.
 */
export function usePersistentState(key, initial, { sanitize = (v) => v, memoryOnly = false } = {}) {
  const [value, setValue] = useState(() => {
    const fk = fullKey(key);
    if (memory.has(fk)) return memory.get(fk);
    const stored = memoryOnly ? undefined : readStored(key);
    return stored !== undefined ? stored : typeof initial === "function" ? initial() : initial;
  });
  const sanitizeRef = useRef(sanitize);
  sanitizeRef.current = sanitize;

  useEffect(() => {
    memory.set(fullKey(key), value);
    if (!memoryOnly) writeStored(key, sanitizeRef.current(value));
  }, [key, value, memoryOnly]);

  return [value, setValue];
}

function readSession(fk, initial) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + fk);
    return raw == null ? initial : JSON.parse(raw);
  } catch {
    return initial;
  }
}

function writeSession(fk, value) {
  try {
    if (value == null) sessionStorage.removeItem(SESSION_PREFIX + fk);
    else sessionStorage.setItem(SESSION_PREFIX + fk, JSON.stringify(value));
  } catch {
    /* storage unavailable: the value lives until the page is reloaded */
  }
}

/**
 * useState backed by sessionStorage (per user): the value survives reloads but is gone when the tab closes.
 * Unlike usePersistentState, a change of `key` switches to the value stored under the new key.
 */
export function useSessionState(key, initial = null) {
  const fk = fullKey(key);
  const [state, setState] = useState(() => ({ fk, value: readSession(fk, initial) }));
  const current = state.fk === fk ? state.value : readSession(fk, initial);
  if (state.fk !== fk) setState({ fk, value: current });
  const setValue = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(readSession(fk, initial)) : next;
      writeSession(fk, value);
      setState({ fk, value });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fk],
  );
  return [current, setValue];
}
