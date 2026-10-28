import readmeTemplate from "./templates/API_README_TEMPLATE.md?raw";

/** Saves `text` as a file through the browser's download mechanism. */
export function downloadText(filename, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The README template users start from so this platform's parser reads their API docs correctly. */
export const downloadReadmeTemplate = () => downloadText("API_README_TEMPLATE.md", readmeTemplate);

function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function printableLines(text) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/<!--|-->/g, "")
    .replace(/^```.*$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  const ascii = normalized.replace(/[^\x20-\x7e\n\t]/g, "?");
  return ascii.split("\n").flatMap((line) => {
    if (!line.trim()) return [""];
    const wrapped = [];
    let current = "";
    for (const word of line.trim().split(/\s+/)) {
      if (current && `${current} ${word}`.length > 96) {
        wrapped.push(current);
        current = "";
      }
      current = current ? `${current} ${word}` : word;
    }
    if (current) wrapped.push(current);
    return wrapped;
  });
}

function createPdf(text) {
  const lines = printableLines(text);
  const pages = Array.from({ length: Math.ceil(lines.length / 58) }, (_, index) => lines.slice(index * 58, (index + 1) * 58));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const page of pages) {
    const commands = page.map((line) => `(${pdfEscape(line)}) Tj T*`).join("\n");
    const stream = `BT\n/F1 8 Tf\n48 744 Td\n11 TL\n${commands}\nET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`);
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return output;
}

export const downloadReadmeTemplatePdf = () =>
  downloadText("API_README_TEMPLATE.pdf", createPdf(readmeTemplate), "application/pdf");
