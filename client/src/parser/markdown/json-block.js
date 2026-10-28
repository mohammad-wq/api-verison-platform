/*
 * Lenient JSON reader for documentation examples.
 *
 * Accepts `//` line comments (used as segment labels) and trailing commas,
 * and keeps the raw text of numbers so `50000.00` is typed as a number,
 * not an integer.
 */
export class JsonBlockError extends Error {
}
/* Splits a block into `// Label` + value segments and parses each one. */
export function parseJsonSegments(source) {
    const segments = [];
    let current = { lines: [] };
    for (const line of source.split(/\r?\n/)) {
        const comment = line.trim().match(/^\/\/\s*(.*)$/);
        if (comment) {
            if (current.lines.some((l) => l.trim() !== "") || current.label) {
                segments.push(current);
            }
            current = { label: comment[1].trim(), lines: [] };
            continue;
        }
        current.lines.push(line);
    }
    if (current.lines.some((l) => l.trim() !== "") || current.label) {
        segments.push(current);
    }
    return segments.map((segment) => ({
        label: segment.label,
        node: parseJsonValue(segment.lines.join("\n"))
    }));
}
export function parseJsonValue(source) {
    const reader = new Reader(source);
    reader.skipWhitespace();
    const node = reader.value();
    reader.skipWhitespace();
    if (!reader.done()) {
        throw new JsonBlockError(`Unexpected content after JSON value at offset ${reader.offset}`);
    }
    return node;
}
export function tryParseJsonValue(source) {
    try {
        return parseJsonValue(source);
    }
    catch {
        return undefined;
    }
}
export function toPlain(node) {
    switch (node.t) {
        case "object":
            return Object.fromEntries(node.entries.map(([key, value]) => [key, toPlain(value)]));
        case "array":
            return node.items.map(toPlain);
        case "null":
            return null;
        default:
            return node.v;
    }
}
class Reader {
    text;
    offset = 0;
    constructor(text) {
        this.text = text;
    }
    done() {
        return this.offset >= this.text.length;
    }
    skipWhitespace() {
        while (!this.done()) {
            const char = this.text[this.offset];
            if (/\s/.test(char)) {
                this.offset++;
            }
            else if (this.text.startsWith("//", this.offset)) {
                while (!this.done() && this.text[this.offset] !== "\n") {
                    this.offset++;
                }
            }
            else {
                break;
            }
        }
    }
    value() {
        const char = this.text[this.offset];
        if (char === "{")
            return this.object();
        if (char === "[")
            return this.array();
        if (char === '"')
            return { t: "string", v: this.string() };
        if (char === "-" || (char >= "0" && char <= "9"))
            return this.number();
        for (const [word, node] of [
            ["true", { t: "boolean", v: true }],
            ["false", { t: "boolean", v: false }],
            ["null", { t: "null" }]
        ]) {
            if (this.text.startsWith(word, this.offset)) {
                this.offset += word.length;
                return node;
            }
        }
        throw new JsonBlockError(`Unexpected character ${JSON.stringify(char ?? "EOF")} at offset ${this.offset}`);
    }
    object() {
        const entries = [];
        this.offset++;
        this.skipWhitespace();
        while (this.text[this.offset] !== "}") {
            if (this.text[this.offset] !== '"') {
                throw new JsonBlockError(`Expected key at offset ${this.offset}`);
            }
            const key = this.string();
            this.skipWhitespace();
            this.expect(":");
            this.skipWhitespace();
            const value = this.value();
            this.readInlineComment(value);
            entries.push([key, value]);
            this.skipWhitespace();
            if (this.text[this.offset] === ",") {
                this.offset++;
                this.skipWhitespace();
            }
            else if (this.text[this.offset] !== "}") {
                throw new JsonBlockError(`Expected , or } at offset ${this.offset}`);
            }
        }
        this.offset++;
        return { t: "object", entries };
    }
    readInlineComment(node) {
        let end = this.offset;
        while (this.text[end] === " " || this.text[end] === "\t") end++;
        if (this.text[end] === ",") {
            end++;
            while (this.text[end] === " " || this.text[end] === "\t") end++;
        }
        if (!this.text.startsWith("//", end)) return;
        const lineEnd = this.text.indexOf("\n", end + 2);
        const commentEnd = lineEnd === -1 ? this.text.length : lineEnd;
        const comment = this.text.slice(end + 2, commentEnd).trim();
        if (comment) node.comment = comment;
    }
    array() {
        const items = [];
        this.offset++;
        this.skipWhitespace();
        while (this.text[this.offset] !== "]") {
            items.push(this.value());
            this.skipWhitespace();
            if (this.text[this.offset] === ",") {
                this.offset++;
                this.skipWhitespace();
            }
            else if (this.text[this.offset] !== "]") {
                throw new JsonBlockError(`Expected , or ] at offset ${this.offset}`);
            }
        }
        this.offset++;
        return { t: "array", items };
    }
    string() {
        const start = this.offset;
        this.offset++;
        while (!this.done() && this.text[this.offset] !== '"') {
            if (this.text[this.offset] === "\\")
                this.offset++;
            this.offset++;
        }
        if (this.done()) {
            throw new JsonBlockError(`Unterminated string at offset ${start}`);
        }
        this.offset++;
        return JSON.parse(this.text.slice(start, this.offset));
    }
    number() {
        const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.text.slice(this.offset));
        if (!match) {
            throw new JsonBlockError(`Invalid number at offset ${this.offset}`);
        }
        this.offset += match[0].length;
        return { t: "number", v: Number(match[0]), raw: match[0] };
    }
    expect(char) {
        if (this.text[this.offset] !== char) {
            throw new JsonBlockError(`Expected ${char} at offset ${this.offset}`);
        }
        this.offset++;
    }
}
