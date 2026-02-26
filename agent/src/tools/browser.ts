import { execSync } from 'child_process'

// agent-browser is installed globally in the Docker container
// CLI: agent-browser <url>  →  outputs page text to stdout
export function browser(url: string): string {
  const output = execSync(`agent-browser ${url}`, {
    encoding: 'utf-8',
    timeout: 30_000,
  })
  return output.trim()
}

export const browserTool = {
  name: 'browser',
  description: 'Fetch and read the content of a web page',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'Full URL to fetch' },
    },
    required: ['url'],
  },
}
