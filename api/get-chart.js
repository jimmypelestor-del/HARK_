// Récupère un graphique depuis GitHub
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const GH_TOKEN = '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';
  const GH_REPO  = 'hark-delta';

  try {
    const { key } = req.query;
    if (!key || !/^(btc|eth|sol)_c[12]$/.test(key)) return res.status(400).json({ error: 'Invalid key' });

    const userR = await fetch('https://api.github.com/user', {
      headers: { Authorization: 'token ' + GH_TOKEN }
    });
    const user = await userR.json();
    const owner = user.login;

    const apiUrl = `https://api.github.com/repos/${owner}/${GH_REPO}/contents/charts/${key}.txt`;
    const r = await fetch(apiUrl, { headers: { Authorization: 'token ' + GH_TOKEN } });

    if (r.status === 404) return res.status(404).json({ error: 'not found' });
    if (!r.ok) throw new Error('GitHub ' + r.status);

    const d = await r.json();
    const base64Data = Buffer.from(d.content.replace(/\n/g,''), 'base64').toString('utf8');

    return res.status(200).json({ ok: true, data: 'data:image/png;base64,' + base64Data });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
