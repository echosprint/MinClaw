---
name: apply-mirror
description: Configure China-friendly mirrors for npm and Debian apt in MinClaw Docker builds. Use when Docker builds are slow or fail with network errors in China. Triggers on "apply mirror", "mirror config", "npm mirror", "debian mirror", "china mirror", "slow build".
---

# Apply Mirror Configuration

Switch Docker builds to use Chinese mirrors (Tsinghua for Debian, npmmirror for npm).

## Diagnostic

```bash
echo "=== Mirror Diagnostic ==="

echo -e "\n1. Dockerfile.base Debian mirror?"
grep -oP 'deb\.debian\.org|mirrors\.\S+' agent/Dockerfile.base | head -1 || echo "(not found)"

echo -e "\n2. Dockerfile.base npm registry?"
grep -q "registry.npmmirror.com" agent/Dockerfile.base && echo "npmmirror" || echo "default"

echo -e "\n3. Dockerfile npm registry?"
grep -q "registry.npmmirror.com" agent/Dockerfile && echo "npmmirror" || echo "default"

echo -e "\n4. Host pnpm registry?"
pnpm config get registry 2>/dev/null || echo "(pnpm not found)"
```

## Merge

Saves originals to `bases/` (first time only), then three-way merges — user edits outside the patched regions are preserved.

```bash
SKILL=.claude/skills/apply-mirror

for f in agent/Dockerfile.base agent/Dockerfile; do
  [ -f "bases/$f" ] || { mkdir -p "bases/$(dirname "$f")"; cp "$f" "bases/$f"; }
done

git merge-file agent/Dockerfile.base bases/agent/Dockerfile.base "$SKILL/files/Dockerfile.base"
git merge-file agent/Dockerfile      bases/agent/Dockerfile      "$SKILL/files/Dockerfile"
```

If exit code is non-zero, conflict markers (`<<<<<<<`) were inserted — resolve before continuing.

| File                    | What changes                                         |
|-------------------------|------------------------------------------------------|
| `agent/Dockerfile.base` | Tsinghua Debian mirror + npmmirror npm registry      |
| `agent/Dockerfile`      | npmmirror npm registry                               |

## Optional: pnpm mirror (host)

```bash
pnpm config set registry https://registry.npmmirror.com
```

To reset: `pnpm config delete registry`

## Rebuild

```bash
pnpm build:fresh
```

## Mirror tables

| Debian mirror   | Host                           |
|-----------------|--------------------------------|
| Tsinghua (TUNA) | `mirrors.tuna.tsinghua.edu.cn` |
| Alibaba Cloud   | `mirrors.aliyun.com`           |
| USTC            | `mirrors.ustc.edu.cn`          |

| npm mirror         | Registry URL                                   |
|--------------------|-------------------------------------------------|
| npmmirror (Taobao) | `https://registry.npmmirror.com`                |
| Huawei Cloud       | `https://repo.huaweicloud.com/repository/npm/`  |
