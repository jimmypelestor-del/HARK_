export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const CG_KEY = 'af63e657b0204335bf8cc2dc8ecc487e';

  // Endpoints CoinGlass ETF à tester
  const endpoints = [
    'https://open-api.coinglass.com/api/etf/bitcoin/flow/chart?timeType=1',
    'https://open-api.coinglass.com/api/etf/bitcoin/flow',
    'https://open-api.coinglass.com/api/pro/v1/etf/bitcoin/flow',
    'https://open-api.coinglass.com/public/v2/etf?symbol=BTC',
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: {
          'CG-API-KEY': CG_KEY,
          'coinglassSecret': CG_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      const text = await r.text();
      let d;
      try { d = JSON.parse(text); } catch { continue; }

      // Retourner le JSON brut pour debug
      return res.status(200).json({
        source: 'CoinGlass',
        endpoint: url,
        status: r.status,
        data: d,
      });

    } catch (e) {
      continue;
    }
  }

  return res.status(500).json({ error: 'Tous les endpoints CoinGlass ont échoué' });
}
