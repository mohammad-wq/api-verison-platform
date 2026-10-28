/*
 * Helpers for inline Markdown (code spans, emphasis) inside a single block.
 */
export function codeSpans(text) {
    const spans = [];
    const pattern = /`([^`]*)`/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        spans.push({
            code: match[1],
            start: match.index,
            end: match.index + match[0].length
        });
    }
    return spans;
}
/* Removes inline Markdown markup and collapses whitespace. */
export function stripInline(text) {
    return text
        .replace(/^>\s?/gm, "")
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*([^*\n]+)\*/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}
/* Removes bold/italic markers but keeps code spans. */
export function stripEmphasis(text) {
    return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}
export function firstSentence(text, maxLength = 120) {
    const match = text.match(/^(.+?[.!?])(\s|$)/);
    const sentence = (match ? match[1] : text).trim();
    return sentence.length > maxLength
        ? sentence.slice(0, maxLength - 1).trimEnd() + "…"
        : sentence;
}
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
