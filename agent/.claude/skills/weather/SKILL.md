---
name: weather
description: "Get current weather and forecasts by browsing weather websites. Use when: user asks about weather, temperature, or forecasts for any location."
allowed-tools: Bash(agent-browser:*), WebSearch, WebFetch
---

# Weather Skill

Use `WebSearch` to find the right weather page, then `agent-browser` to open it and extract the information.

## Location

If the user did not specify a location, call `send_message` to ask first:

> "Which city would you like the weather for?"

## Which Site to Use

Check the timezone from `mcp__minclaw__get_local_time`:

- **Asia/Shanghai** → browse **weather.com.cn**
- **All other timezones** → browse **weather.com**

## Workflow

### Step 1 — Find the weather page URL via WebSearch

For **Asia/Shanghai**:

```text
WebSearch: "{city}天气 site:weather.com.cn"
```

For **other timezones**:

```text
WebSearch: "{city} weather site:weather.com"
```

Pick the most relevant result URL from the search results.

### Step 2 — Open and read the page

```bash
agent-browser open "<url from search results>"
agent-browser snapshot
```

Read the snapshot and extract the weather information.

## What to Extract

Read the snapshot and extract:

- Current temperature and condition
- Feels like temperature
- Wind speed and direction
- Humidity
- Today's high/low
- Next few days forecast if available

Report results via `send_message` in a concise, readable format.
