---
name: weather
description: "Get current weather and forecasts via wttr.in. Use when: user asks about weather, temperature, or forecasts for any location. No API key needed."
allowed-tools: WebFetch, WebSearch
---

# Weather Skill

Get current weather and forecasts using `wttr.in` via `WebFetch` — no browser, no API key.

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

If the user did not specify a location, call `send_message` to ask:

> "Which city would you like the weather for?"

City names in English or Chinese both work (`Beijing`, `北京`, `New York`, `London`).

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

If `wttr.in` is unreachable or returns an error, fall back to `WebSearch`:

```text
WebSearch: "{city} weather"
```

Pick the most informative result and extract weather details from the snippet or fetch the result URL with `WebFetch`.

## Notes

- Try wttr.in first — it is significantly faster than searching
- Supports airport codes: `wttr.in/PVG`, `wttr.in/LAX`
- Don't make redundant requests — one fetch is enough for most queries
