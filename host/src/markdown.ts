/**
 * Convert a subset of Markdown to Telegram-compatible HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a>, <u>, <s>
 */
export function mdToHtml(text: string): string {
  return text
    // escape HTML entities first so we don't double-process
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // headings # ## ### → bold
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    // code blocks ```lang\n...\n```
    .replace(/```[\w]*\n?([\s\S]+?)```/g, '<pre>$1</pre>')
    // inline code `text`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // bold **text** or __text__
    .replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>')
    .replace(/__(.+?)__/gs, '<b>$1</b>')
    // italic *text* (not **)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '<i>$1</i>')
    // italic _text_ (not __)
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/gs, '<i>$1</i>')
    // links [label](url)
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
}
