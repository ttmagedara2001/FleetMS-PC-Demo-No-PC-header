const fs = require("fs");
const path = require("path");

const headerPath = path.join(__dirname, "src/components/layout/Header.jsx");
const cssPath = path.join(__dirname, "src/index.css");

let content = fs.readFileSync(headerPath, "utf8");

const startMarker = "<style>{`";
const endMarker = "`}</style>";

const si = content.indexOf(startMarker);
const ei = content.indexOf(endMarker);

if (si >= 0 && ei >= 0) {
  // Extract CSS content between the backticks
  const css = content.substring(si + startMarker.length, ei);
  const cleanCss = css
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s{16}/.test(line)) return line.substring(16);
      if (/^\s*$/.test(line)) return "";
      return line;
    })
    .join("\n")
    .trim();

  // Append to index.css with section header
  const section =
    "\n\n/* ================================================================\n   HEADER COMPONENT \u2014 Moved from embedded <style>\n   ================================================================ */\n" +
    cleanCss +
    "\n";
  fs.appendFileSync(cssPath, section);

  // Remove style block from Header.jsx
  // Find the line start for <style>{` (go back to start of that line)
  let lineStart = si;
  while (lineStart > 0 && content[lineStart - 1] !== "\n") lineStart--;

  // Also remove the blank line before <style> if present
  if (lineStart > 0 && content[lineStart - 1] === "\n") {
    let prevLineStart = lineStart - 1;
    while (prevLineStart > 0 && content[prevLineStart - 1] !== "\n")
      prevLineStart--;
    const prevLine = content.substring(prevLineStart, lineStart - 1);
    if (prevLine.trim() === "") lineStart = prevLineStart;
  }

  // Find the end of the `}</style> line
  let lineEnd = ei + endMarker.length;
  while (lineEnd < content.length && content[lineEnd] !== "\n") lineEnd++;
  if (lineEnd < content.length) lineEnd++; // include the newline

  const before = content.substring(0, lineStart);
  const after = content.substring(lineEnd);
  fs.writeFileSync(headerPath, before + after);

  console.log("Done! CSS lines extracted:", cleanCss.split("\n").length);
  console.log(
    "Header.jsx reduced from",
    content.split("\n").length,
    "to",
    (before + after).split("\n").length,
    "lines",
  );
} else {
  console.log("ERROR: Style block not found");
}
