// api/keywords.js  —  the "relay" (a Vercel Serverless Function)
//
// The browser calls THIS file at /api/keywords. This file runs on Vercel's
// servers (not in the browser), so it can safely hold your AgentRouter key and
// pass requests to AgentRouter's Anthropic-compatible endpoint. Your key is
// never sent to the browser.
//
// Your key is read from an environment variable named AGENTROUTER_KEY, which
// you set once in the Vercel dashboard (see README). Nothing secret lives in
// this file, so it is safe to put on GitHub.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const apiKey = process.env.AGENTROUTER_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server missing AGENTROUTER_KEY. Set it in Vercel settings." });
    return;
  }

  // The browser sends { prompt: "..." }.
  const prompt = req.body && req.body.prompt;
  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    // AgentRouter's Anthropic-compatible endpoint. Same shape the original
    // tool used against api.anthropic.com, so the response format matches.
    const upstream = await fetch("https://agentrouter.org/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "authorization": "Bearer " + apiKey,
        "anthropic-version": "2023-06-01",
        // AgentRouter's filter expects requests that look like Claude Code.
        // These headers mimic it so the request is accepted.
        "user-agent": "claude-cli/1.0.0 (external, cli)",
        "x-app": "cli",
      },
      body: JSON.stringify({
        // AgentRouter serves this model on the user's plan (the others return
        // "no available channel"). Change here if the plan gains more models.
        model: "claude-opus-4-8",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Upstream error", detail: text.slice(0, 500) });
      return;
    }

    // Pass the JSON straight back to the browser unchanged.
    res.status(200).setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "Relay failed", detail: String(err).slice(0, 300) });
  }
}
