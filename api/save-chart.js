// Sauvegarde un graphique base64 sur GitHub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GH_TOKEN = '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';
  const GH_REPO  = 'hark-delta';

  try {
    const { chartKey, imageBase64 } = req.body;
    if (!chartKey || !imageBase64) return res.status(400).json({ error: 'Missing params' });

    // Sanitize key : btc_c1, eth_c1, sol_c1, btc_c2, etc.
    if (!/^(btc|eth|sol)_c[12]$/.test(chartKey)) return res.status(400).json({ error: 'Invalid key' });

    // Get GitHub owner
    const userR = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + GH_TOKEN }
    });
    const user = await userR.json();
    const owner = user.login;

    const filePath = `charts/${chartKey}.txt`;
    const apiUrl   = `https://api.github.com/repos/${owner}/${GH_REPO}/contents/${filePath}`;

    // Check if file exists (need SHA to update)
    let sha = null;
    const check = await fetch(apiUrl, { headers: { Authorization: 'token ' + GH_TOKEN } });
    if (check.ok) { const d = await check.json(); sha = d.sha; }

    // Strip data:image/...;base64, prefix for storage
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const body = {
      message: `📊 Chart update: ${chartKey}`,
      content: btoa(unescape(encodeURIComponent(base64Data))),
      ...(sha ? { sha } : {})
    };

    const r = await fetch(apiUrl, {
      method: 'PUT',
      headers: { Authorization: 'token ' + GH_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) throw new Error('GitHub error ' + r.status);
    return res.status(200).json({ ok: true, key: chartKey });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
