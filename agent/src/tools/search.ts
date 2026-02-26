const SEARCH_API_KEY = process.env.SEARCH_API_KEY ?? ''

interface TavilyResult {
  title: string
  url: string
  content: string
}

interface TavilyResponse {
  results: TavilyResult[]
}

export async function search(query: string): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: SEARCH_API_KEY, query, max_results: 5 }),
  })

  if (!res.ok) throw new Error(`Search API error: ${res.status}`)

  const data = await res.json() as TavilyResponse
  return data.results
    .map(r => `${r.title}\n${r.url}\n${r.content}`)
    .join('\n\n')
}

export const searchTool = {
  name: 'search',
  description: 'Search the web for current information',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
}
