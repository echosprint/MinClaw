---
name: weather
description: "Get current weather and forecasts. Use when: user asks about weather, temperature, or forecasts for any location. No API key needed."
allowed-tools: WebFetch, WebSearch
---

# Weather Skill

**Weather should be a quick answer: one search, one message.**

## Location

**Check memory first.** Read `/workspace/memory/preferences.md` (if it exists) for a saved home city. If found, use it silently.

If no location is found and the user didn't specify one, call `send_message` to ask.

**Save location to memory.** Whenever you learn the user's city, save it to `/workspace/memory/preferences.md`:

```markdown
## Location
Home city: Shanghai
```

## How to fetch weather

Use `get_local_time` to determine the timezone, then choose the source:

**Asia/Shanghai** — search on `weather.com.cn`:

```text
WebSearch: "{city}天气 site:weather.com.cn"
```

**All other timezones** — general search:

```text
WebSearch: "{city} weather"
```

Fetch the most relevant result URL with `WebFetch` and extract current conditions.

## Reply Format

Write a short, conversational message — **no tables, no bullet lists**. Cover:

1. Today's conditions (temperature, feels-like, condition)
2. The week ahead in one sentence (trend: warmer/cooler, rain expected, etc.)

Target **50–80 words**. Example:

> Shanghai today: ⛅ 18°C (feels 16°C), light breeze. Expect clouds this afternoon with a small chance of rain by evening. The rest of the week stays mild — temperatures holding around 17–20°C with a brief sunny stretch Wednesday before another rainy period Thursday into Friday.

## Notes

- Do NOT include source links in weather replies — just give the weather
- One search + one fetch is enough for most queries
- Call `send_message` only ONCE with the final weather answer — do not send progress updates or intermediate steps
