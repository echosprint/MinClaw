---
name: scheduling
description: "Schedule recurring or one-time tasks using cron expressions. Use when: user wants reminders, scheduled alerts, recurring tasks, or asks to list/cancel scheduled jobs."
allowed-tools: mcp__minclaw__schedule_job, mcp__minclaw__list_tasks, mcp__minclaw__cancel_task, mcp__minclaw__get_local_time
---

# Scheduling Skill

## Key rules

- For relative times ("in X minutes"), call `get_local_time` first, then calculate the target cron.
- Always tell the user the scheduled time in local time (e.g. "Scheduled for 3:30 PM"), not UTC.
- Use `one_shot: true` for one-time reminders.

## Listing and cancelling

The `[job_id:N]` in `list_tasks` output is for internal use — show only the `#1`, `#2`... index and task name to the user.

When cancelling, **always follow this workflow**:

1. Call `list_tasks` to fetch all active tasks
2. Identify the most relevant task based on the user's description
3. Confirm with the user via `send_message` before cancelling
4. Extract the `job_id` from `[job_id:N]` and call `cancel_task` after confirmation
