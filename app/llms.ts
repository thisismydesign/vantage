// The vantage function renders the agent instructions with its own endpoints; the site serves that copy rather than keeping one.
export async function llmsTxt(supabaseUrl: string) {
  const upstream = await fetch(`${supabaseUrl}/functions/v1/vantage/agent`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
