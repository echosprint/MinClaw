---
name: news
description: "Get latest news and tech/AI updates. Use when: user asks about news, what's happening, tech developments, AI research, or wants updates from Karpathy, LeCun, Amodei, Bengio, Fei-Fei Li, or Hacker News."
allowed-tools: WebFetch, WebSearch
---

# News Skill

Fetch and summarize the latest news. **Tech/AI queries should check authoritative sources first — one or two fetches, one clear summary.**

## When to Use

✅ **USE this skill when:**

- "What's in the news?"
- "Any tech news today?"
- "What's Karpathy been posting?"
- "Latest AI news"
- "What's on Hacker News?"
- "Anything new from LeCun / Dario / Bengio / Fei-Fei?"
- "What happened in AI this week?"

## When NOT to Use

❌ **DON'T use this skill when:**

- Weather → use the `weather` skill
- GitHub/code repo news → use the `github` skill
- Specific company stock or financial data → use `WebSearch`

---

## Source Routing

### General news

Use `WebSearch`:

```text
WebSearch: "latest news today"
```

Or fetch a news digest directly:

```text
WebFetch: https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en
Prompt: extract the top 10 headlines with their sources and links
```

---

### Tech/AI news — Hacker News

Hacker News front page via the Algolia API — **fastest source, no auth needed**:

```text
WebFetch: https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10
Prompt: extract title, url, points, and num_comments for each hit; return as a numbered list
```

For AI-specific HN stories:

```text
WebFetch: https://hn.algolia.com/api/v1/search?query=AI+LLM+machine+learning&tags=story&hitsPerPage=8
Prompt: extract title, url, points for each hit; return as a numbered list
```

---

### Tech figures — what they've been posting

For each person, **try their primary blog/Substack first via `WebFetch`** before falling back to `WebSearch`. Their main writing homes:

| Person | Primary URL | Notes |
| ------ | ----------- | ----- |
| Karpathy | [karpathy.bearblog.dev](https://karpathy.bearblog.dev) | New blog (2025+); older essays at karpathy.github.io |
| LeCun | [linkedin.com/in/yann-lecun](https://www.linkedin.com/in/yann-lecun/) | LinkedIn is his most active long-form platform |
| Amodei | [darioamodei.com](https://www.darioamodei.com/) | Personal site for major essays |
| Bengio | [yoshuabengio.org](https://yoshuabengio.org/) | Personal blog for AI safety / research writing |
| Fei-Fei Li | [drfeifei.substack.com](https://drfeifei.substack.com/) | Substack is her primary writing platform |
| Sam Altman | [blog.samaltman.com](https://blog.samaltman.com) | Personal blog; major essays also at ia.samaltman.com |

#### Andrej Karpathy

Fetch his bearblog first:

```text
WebFetch: https://karpathy.bearblog.dev
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

Older technical essays:

```text
WebFetch: http://karpathy.github.io/
Prompt: list posts with titles and dates
```

Fallback:

```text
WebSearch: "Karpathy site:karpathy.bearblog.dev OR site:karpathy.github.io 2026"
```

#### Yann LeCun

LeCun writes primarily on LinkedIn — use WebSearch since direct LinkedIn fetch requires login:

```text
WebSearch: "Yann LeCun site:linkedin.com 2026"
```

```text
WebSearch: "LeCun AI post OR essay 2026"
```

Also active on Threads:

```text
WebSearch: "LeCun site:threads.com 2026"
```

#### Dario Amodei

Fetch his personal site directly:

```text
WebFetch: https://www.darioamodei.com/
Prompt: list all essays/posts with titles, dates, and one-line summaries
```

Fallback:

```text
WebSearch: "Dario Amodei essay OR post 2026"
```

#### Yoshua Bengio

Fetch his blog directly:

```text
WebFetch: https://yoshuabengio.org/
Prompt: list the most recent blog posts with titles, dates, and one-line summaries
```

Fallback:

```text
WebSearch: "Bengio site:yoshuabengio.org 2026"
```

#### Fei-Fei Li

Fetch her Substack directly:

```text
WebFetch: https://drfeifei.substack.com/
Prompt: list recent posts with titles, dates, and one-line summaries
```

Fallback:

```text
WebSearch: "Fei-Fei Li site:drfeifei.substack.com 2026"
```

#### Sam Altman

Fetch his blog directly:

```text
WebFetch: https://blog.samaltman.com
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

For major essays (e.g. "The Intelligence Age"):

```text
WebFetch: https://ia.samaltman.com/
Prompt: summarize the main points of this essay
```

Fallback:

```text
WebSearch: "Sam Altman site:blog.samaltman.com 2026"
```

---

### Big 7 company blogs

When the user asks what a specific company has been publishing, fetch their blog directly.

#### OpenAI

```text
WebFetch: https://openai.com/news
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

#### Anthropic

```text
WebFetch: https://www.anthropic.com/news
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

#### Google DeepMind

```text
WebFetch: https://deepmind.google/discover/blog/
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

#### Meta AI

```text
WebFetch: https://ai.meta.com/blog/
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

#### Microsoft AI

```text
WebFetch: https://blogs.microsoft.com/ai/
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

#### NVIDIA

```text
WebFetch: https://nvidianews.nvidia.com/
Prompt: list the most recent news items with titles and dates
```

#### xAI

```text
WebFetch: https://x.ai/news
Prompt: list the most recent posts with titles, dates, and one-line summaries
```

Fallback for any company if direct fetch fails:

```text
WebSearch: "[Company] AI announcement OR blog post 2026"
```

---

### Combined AI roundup

When the user wants a broad "AI news" summary, run these in sequence (max 4 fetches):

1. **HN front page** (tech pulse):

   ```text
   WebFetch: https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10
   Prompt: extract title, url, points, num_comments for each hit
   ```

2. **Karpathy's bearblog** (most likely to have fresh writing):

   ```text
   WebFetch: https://karpathy.bearblog.dev
   Prompt: return the most recent 3 post titles and dates
   ```

3. **Amodei's personal site**:

   ```text
   WebFetch: https://www.darioamodei.com/
   Prompt: return the most recent 2–3 essay titles and dates
   ```

4. **One broad WebSearch** to catch anything recent from LeCun, Bengio, Fei-Fei Li, Sam Altman:

   ```text
   WebSearch: "LeCun OR Bengio OR 'Fei-Fei Li' OR 'Sam Altman' AI 2026"
   ```

5. **Big 7 company news** — one search covering the major AI/tech companies:

   ```text
   WebSearch: "OpenAI OR Anthropic OR Google DeepMind OR Meta AI OR Microsoft OR NVIDIA OR xAI news 2026"
   ```

   For a specific company's latest announcements, fetch their blog directly:

   | Company | Blog URL |
   | ------- | -------- |
   | OpenAI | [openai.com/news](https://openai.com/news) |
   | Anthropic | [anthropic.com/news](https://www.anthropic.com/news) |
   | Google DeepMind | [deepmind.google/discover/blog](https://deepmind.google/discover/blog/) |
   | Meta AI | [ai.meta.com/blog](https://ai.meta.com/blog/) |
   | Microsoft AI | [blogs.microsoft.com/ai](https://blogs.microsoft.com/ai/) |
   | NVIDIA | [nvidianews.nvidia.com](https://nvidianews.nvidia.com/) |
   | xAI | [x.ai/news](https://x.ai/news) |

Synthesize into a single message with sections: **Top HN Stories**, **From the Field** (researchers), **Company News**, **Recent Essays**.

---

## Output Format

Keep it scannable:

```text
**Top Tech Stories** (Hacker News)
1. [Title](url) — X points, Y comments
2. ...

**From the Field**
- **Karpathy**: ...
- **LeCun**: ...
- **Bengio**: ...

**Company News**
- **OpenAI**: ...
- **Anthropic**: ...
- **Google DeepMind**: ...
- **NVIDIA**: ...

**What to read**: [best link](url)
```

## Notes

- HN Algolia API is fast and reliable — prefer it over scraping ycombinator.com
- For Twitter/X content, `WebFetch` on individual tweet URLs often fails; use `WebSearch` instead and summarize what comes up
- If a source returns no useful results, skip it silently and note it in `<internal>` tags — don't report failures to the user unless all sources fail
- For a full roundup, up to 5–6 fetches/searches is acceptable; for a quick update, keep it to 3
- When asked about a specific company, fetch their blog URL directly rather than searching
