---
name: github
description: "GitHub operations via `gh` CLI: issues, PRs, CI runs, code review, API queries. Use when: (1) checking PR status or CI, (2) creating/commenting on issues, (3) listing/filtering PRs or issues, (4) viewing run logs. NOT for: local git operations, cloning repos, or complex web UI flows."
allowed-tools: Bash(gh:*)
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub repositories, issues, PRs, and CI.

## Authentication in Docker

This agent runs inside a Docker container. **`gh auth login` is not available** — it requires an interactive browser session which the container cannot provide.

Authentication is handled via the `GH_TOKEN` environment variable, which is passed into the container at startup. `gh` picks it up automatically with no configuration needed.

**Before using gh for the first time, always verify it works:**

```bash
gh auth status
```

Expected output:

```text
github.com
  ✓ Logged in to github.com account <username> (GH_TOKEN)
  - Active account: true
  - Token scopes: ...
```

If it fails, diagnose and fix using `GH_TOKEN` directly — **never run `gh auth login`**, it requires a browser and will hang in Docker:

**Token missing or invalid:**

```bash
# Check if the variable is set
echo $GH_TOKEN

# Test it directly against the API
curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | grep login
```

Tell the user to run this on their local machine (where `gh` is already authenticated):

```bash
gh auth token
```

Copy the output and add it to `.env` as `GH_TOKEN=...`, then restart the container (`docker compose restart agent`).

**Token set but wrong scopes:**

For **classic tokens** (produced by `gh auth token`), the API returns scopes in a response header:

```bash
curl -sI -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user \
  | grep -i x-oauth-scopes
```

For **fine-grained PATs**, this header is not returned — the user must check permissions on GitHub.com under **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.

Tell the user which scopes are missing and ask them to regenerate the token with the required permissions (e.g. `repo`, `read:org`).

## When to Use

✅ **USE this skill when:**

- Checking PR status, reviews, or merge readiness
- Viewing CI/workflow run status and logs
- Creating, closing, or commenting on issues
- Creating or merging pull requests
- Querying GitHub API for repository data
- Listing repos, releases, or collaborators

## When NOT to Use

❌ **DON'T use this skill when:**

- Local git operations (commit, push, pull, branch) → use `git` directly
- Cloning repositories → use `git clone`
- Non-GitHub repos → different CLIs

## Environment Variables

Set these to avoid repeating `--repo` on every command:

```bash
export GH_REPO=owner/repo       # default repo for all commands
export GH_HOST=github.com       # override for GitHub Enterprise
export NO_COLOR=1               # disable color in piped output
# Note: do NOT set GH_FORCE_TTY — any non-empty value forces TTY mode
```

`GH_TOKEN` is already set in the container — check with `gh auth status`.

## Common Commands

### Pull Requests

```bash
# List PRs
gh pr list --repo owner/repo

# Check CI status on a PR
gh pr checks 55 --repo owner/repo

# View PR details
gh pr view 55 --repo owner/repo

# Checkout PR locally (must be inside the repo's git directory)
gh pr checkout 55

# View PR diff
gh pr diff 55 --repo owner/repo

# Create PR
gh pr create --title "feat: add feature" --body "Description"

# Merge PR
gh pr merge 55 --squash --repo owner/repo
```

### Issues

```bash
# List open issues
gh issue list --repo owner/repo --state open

# Create issue
gh issue create --title "Bug: something broken" --body "Details..." --label bug

# Comment on an issue
gh issue comment 42 --body "Investigating..." --repo owner/repo

# Close issue
gh issue close 42 --repo owner/repo
```

### CI/Workflow Runs

```bash
# List recent runs
gh run list --repo owner/repo --limit 10

# Watch a run in real-time
gh run watch <run-id> --repo owner/repo

# View full logs
gh run view <run-id> --repo owner/repo --log

# View failed step logs only
gh run view <run-id> --repo owner/repo --log-failed

# Re-run failed jobs
gh run rerun <run-id> --failed --repo owner/repo
```

### Search (cross-repo)

```bash
# Search PRs across GitHub
gh search prs 'author:@me is:open'

# Search issues
gh search issues 'label:bug is:open repo:owner/repo'

# Search code
gh search code 'function name' --repo owner/repo
```

### API Queries

```bash
# REST API — GET by default, auto-POST when fields are added
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'

# Paginate through all results and merge into one array
gh api repos/owner/repo/issues --paginate --slurp --jq 'add | length'

# GraphQL
gh api graphql -f query='{ viewer { login } }'

# Pass fields
gh api repos/owner/repo/issues -f title="New issue" -f body="Details" --method POST
```

## JSON Output & jq Filtering

Most commands support `--json` + `--jq`. Built-in jq — no external dependency needed.

```bash
# Specific fields only
gh pr list --json number,title,state

# Filter open mergeable PRs
gh pr list --json number,title,state,mergeable \
  --jq '.[] | select(.mergeable == "MERGEABLE")'

# Format as table
gh issue list --json number,title,labels \
  --jq '.[] | "\(.number)\t\(.title)\t\([.labels[].name] | join(", "))"'

# Count open issues
gh issue list --state open --json number --jq 'length'

# Filter by label (any() avoids duplicates when issues have multiple labels)
gh issue list --json number,title,labels \
  --jq 'map(select(any(.labels[]; .name == "bug"))) | .[].title'

# Sort by field
gh pr list --json number,title,createdAt \
  --jq 'sort_by(.createdAt) | reverse | .[].title'
```

## Template Formatting

Use `--template` for custom human-readable output:

```bash
gh pr list --template '{{range .}}#{{.number}} {{.title}} ({{.state}}){{"\n"}}{{end}}'

# With color and relative time
gh run list --template '{{range .}}{{.status}} {{.name}} — {{timeago .createdAt}}{{"\n"}}{{end}}'
```

## Error Handling

Exit codes:

- `0` — success
- `1` — command failed
- `2` — cancelled
- `4` — authentication required

Check auth before running other commands if in doubt:

```bash
gh auth status && gh pr list --repo owner/repo
```

## Notes

- Always specify `--repo owner/repo` when not in a git directory, or set `GH_REPO`
- Accept URLs directly: `gh pr view https://github.com/owner/repo/pull/55`
- Use `--cache 1h` on `gh api` to avoid hitting rate limits for repeated queries
- Use `--paginate --slurp` together to collect all pages as a single JSON array
