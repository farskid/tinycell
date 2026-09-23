const KEY =
  /^(?:as|async|await|break|case|catch|class|const|continue|default|else|export|extends|false|for|from|function|if|import|in|interface|let|new|null|of|return|switch|throw|true|try|type|typeof|void|while)$/;

export function highlight(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest.startsWith("//")) {
      const end = src.indexOf("\n", i);
      const j = end < 0 ? src.length : end;
      out += span("c", src.slice(i, j));
      i = j;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? src.length : end + 2;
      out += span("c", src.slice(i, j));
      i = j;
      continue;
    }
    const quote = src[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      out += span("s", src.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(quote ?? "")) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j] ?? "")) j++;
      const word = src.slice(i, j);
      out += KEY.test(word) ? span("k", word) : esc(word);
      i = j;
      continue;
    }
    out += esc(quote ?? "");
    i++;
  }
  return out;
}

function span(kind: "c" | "s" | "k", text: string): string {
  return `<span class="${kind}">${esc(text)}</span>`;
}

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
