---
name: weather
description: "Get current weather and forecasts via wttr.in. Use when: user asks about weather, temperature, or forecasts for any location. No API key needed."
allowed-tools: WebFetch, WebSearch
---

# Weather Skill

Get current weather and forecasts using `wttr.in` via `WebFetch` — no browser, no API key. **Weather should be a quick answer: one fetch, one message, done in under 3 seconds.**

## When to Use

✅ **USE this skill when:**

- "What's the weather?"
- "Will it rain today/tomorrow?"
- "Temperature in [city]"
- "Weather forecast for the week"
- Travel planning weather checks

## When NOT to Use

❌ **DON'T use this skill when:**

- Historical weather data → use weather archives
- Severe weather alerts → check official sources

## Location

**Check memory first.** Before asking, read `/workspace/memory/preferences.md` (if it exists) for a saved home city.

If a home city is found, use it silently — do not announce that you're using it.

If no location is found in memory and the user didn't specify one, call `send_message` to ask:

> "Which city would you like the weather for?"

City names in English or Chinese both work (`Beijing`, `北京`, `New York`, `London`).

**Save location to memory.** Whenever you learn the user's city — from an explicit request, a casual mention ("Shanghai weather"), or any other context clue — save it to `/workspace/memory/preferences.md`:

```markdown
## Location
Home city: Shanghai
```

If the file already exists, update the `Home city` line. This way you never need to ask again.

## Commands

Use `WebFetch` with format strings — faster than fetching JSON.

### Current conditions (one-liner)

```text
WebFetch: https://wttr.in/{city}?format=%l:+%c+%t+(feels+%f),+wind+%w,+humidity+%h
Prompt: return this text as-is
```

### Will it rain?

```text
WebFetch: https://wttr.in/{city}?format=%l:+%c+%p+precipitation
Prompt: return this text as-is
```

### 3-day forecast (text)

```text
WebFetch: https://wttr.in/{city}?0
Prompt: extract and summarize the 3-day forecast
```

### Full JSON (when detail is needed)

```text
WebFetch: https://wttr.in/{city}?format=j1
Prompt: extract current temp, feels-like, humidity, wind, condition, and 3-day high/low
```

## Format Codes

| Code | Meaning |
| ---- | ------- |
| `%c` | Weather condition emoji |
| `%t` | Temperature |
| `%f` | Feels like |
| `%w` | Wind speed and direction |
| `%h` | Humidity |
| `%p` | Precipitation |
| `%l` | Location name |

## Quick Patterns

**Current weather:**

```text
WebFetch: https://wttr.in/{city}?format=3
```

Returns: `City: ⛅ +12°C`

**Multi-day forecast:**

```text
WebFetch: https://wttr.in/{city}?format=v2
```

## Fallback — if wttr.in fails

Check the timezone via `mcp__minclaw__get_local_time`, then choose the fallback site:

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

1. Today's conditions (temperature, feels-like, condition emoji)
2. The week ahead in one sentence (trend: warmer/cooler, rain expected, etc.)

Target **50–80 words**. Example:

> Shanghai today: ⛅ 18°C (feels 16°C), light breeze. Expect clouds this afternoon with a small chance of rain by evening. The rest of the week stays mild — temperatures holding around 17–20°C with a brief sunny stretch Wednesday before another rainy period Thursday into Friday.

## Notes

- Try wttr.in first — it is significantly faster than searching
- Supports airport codes: `wttr.in/PVG`, `wttr.in/LAX`
- Don't make redundant requests — one fetch is enough for most queries
