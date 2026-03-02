import { describe, test, expect } from "vitest";
import { mdToHtml } from "../src/markdown";

describe("mdToHtml", () => {
  test("escapes HTML entities", () => {
    expect(mdToHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  test("converts horizontal rule to Unicode divider", () => {
    expect(mdToHtml("---")).toBe("──────────────────");
  });

  test("converts code blocks to <pre>", () => {
    expect(mdToHtml("```js\nconst x = 1;\n```")).toBe("<pre>const x = 1;\n</pre>");
  });

  test("converts inline code to <code>", () => {
    expect(mdToHtml("use `npm install`")).toBe("use <code>npm install</code>");
  });

  test("converts headings to bold", () => {
    expect(mdToHtml("# Title")).toBe("<b>Title</b>");
    expect(mdToHtml("## Subtitle")).toBe("<b>Subtitle</b>");
  });

  test("converts **bold**", () => {
    expect(mdToHtml("**bold text**")).toBe("<b>bold text</b>");
  });

  test("converts __bold__", () => {
    expect(mdToHtml("__bold text__")).toBe("<b>bold text</b>");
  });

  test("converts *italic*", () => {
    expect(mdToHtml("*italic text*")).toBe("<i>italic text</i>");
  });

  test("converts _italic_", () => {
    expect(mdToHtml("_italic text_")).toBe("<i>italic text</i>");
  });

  test("converts [links](url)", () => {
    expect(mdToHtml("[Google](https://google.com)")).toBe(
      '<a href="https://google.com">Google</a>',
    );
  });

  test("does not process markdown inside code blocks", () => {
    const input = "```\n**not bold**\n```";
    const result = mdToHtml(input);
    expect(result).toContain("<pre>");
    expect(result).not.toContain("<b>");
  });

  test("does not process markdown inside inline code", () => {
    const result = mdToHtml("`**not bold**`");
    expect(result).toContain("<code>");
    expect(result).not.toContain("<b>");
  });

  test("handles plain text unchanged", () => {
    expect(mdToHtml("hello world")).toBe("hello world");
  });
});
