/**
 * Convert a subset of Markdown to Telegram-compatible HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a>, <u>, <s>
 *
 * Code spans are extracted into placeholders before other conversions so that
 * italic/bold regexes never process their contents — preventing crossed tags
 * like <i>...<code>...</i></code> which Telegram rejects.
 */
export function mdToHtml(text: string): string {
  // 1. Escape HTML entities
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Horizontal rules --- → Unicode divider (Telegram has no <hr>)
  result = result.replace(/^[ \t]*---+[ \t]*$/gm, "──────────────────");

  // 3. Extract code blocks and inline code into placeholders so subsequent
  //    italic/bold regexes cannot match inside them or across their boundaries.
  const slots: string[] = [];
  const stash = (html: string) => {
    const marker = `\x00${slots.length}\x00`;
    slots.push(html);
    return marker;
  };

  // code blocks ```lang\n...\n``` (must come before inline code)
  result = result.replace(/```[\w]*\n?([\s\S]+?)```/g, (_, code) =>
    stash(`<pre>${code}</pre>`)
  );

  // inline code `text`
  result = result.replace(/`([^`\n]+)`/g, (_, code) =>
    stash(`<code>${code}</code>`)
  );

  // 4. Apply remaining conversions (safe — no code content in result)
  result = result
    // headings # ## ### → bold
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    // bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>")
    .replace(/__(.+?)__/gs, "<b>$1</b>")
    // italic *text* (not **) — no dotAll: don't cross line boundaries
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>")
    // italic _text_ (not __) — no dotAll: don't cross line boundaries
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<i>$1</i>")
    // links [label](url)
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // 5. Restore placeholders
  result = result.replace(/\x00(\d+)\x00/g, (_, i) => slots[Number(i)]);

  return result;
}
