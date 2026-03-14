export default async function handler(req, res) {
  // CORS — autorise ton domaine Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 min

  const feeds = [
    'https://coinacademy.fr/actu/gn',
    'https://coinacademy.fr/actu?feed=gn',
    'https://cryptoast.fr/feed/',
  ];

  for (const url of feeds) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HarKBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.length < 200) continue;

      // Vérifier que c'est bien du XML RSS
      if (!text.includes('<item>') && !text.includes('<item ')) continue;

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(text);

    } catch {}
  }

  // Fallback Cointelegraph si tous les feeds FR échouent
  try {
    const r = await fetch('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(text);
  } catch {}

  return res.status(503).json({ error: 'Toutes les sources sont indisponibles' });
}
