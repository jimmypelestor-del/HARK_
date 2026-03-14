export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const CG_KEY = 'af63e657b0204335bf8cc2dc8ecc487e';

  const endpoints = [
    'https://open-api.coinglass.com/api/etf/bitcoin/flow/history?limit=10',
    'https://open-api.coinglass.com/api/etf/bitcoin/flows/history?limit=10',
    'https://open-api.coinglass.com/api/etf/bitcoin/net-flow/history?limit=10',
    'https://open-api.coinglass.com/api/etf/bitcoin/flow-history?limit=10',
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        headers: { 'CG-API-KEY': CG_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();

      // Si pas d'erreur 404 et qu'on a des données
      if (r.status === 404) continue;
      if (d.code !== '0' && d.code !== 0) {
        // Retourner quand même pour debug
        return res.status(200).json({ debug: true, url, status: r.status, response: d });
      }

      const raw = d.data || [];
      if (!raw.length) continue;

      // Format attendu : { timestamp, flow_usd, price_usd, etf_flows: [{etf_ticker, flow_usd}] }
      const sorted = [...raw].sort((a, b) => b.timestamp - a.timestamp);
      const latest = sorted[0];
      const totalUsd = latest.flow_usd || 0;
      const date = new Date(latest.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

      // Extraire IBIT, FBTC, GBTC, ARKB depuis etf_flows[]
      const getFlow = ticker => {
        const f = (latest.etf_flows || []).find(e => e.etf_ticker === ticker);
        return f ? (f.flow_usd / 1e6).toFixed(1) : '—';
      };

      // Top flux
      const topFlows = (latest.etf_flows || [])
        .filter(f => f.flow_usd)
        .map(f => ({ name: f.etf_ticker, val: parseFloat((f.flow_usd / 1e6).toFixed(1)) }))
        .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
        .slice(0, 5);

      // Historique 10 jours
      const history = sorted.slice(0, 10).reverse().map(d => ({
        date: new Date(d.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        total: parseFloat((d.flow_usd / 1e6).toFixed(1)),
      }));

      return res.status(200).json({
        source: 'CoinGlass',
        date,
        total: (totalUsd / 1e6).toFixed(1),
        ibit: getFlow('IBIT'),
        fbtc: getFlow('FBTC'),
        gbtc: getFlow('GBTC'),
        arkb: getFlow('ARKB'),
        topFlows,
        history,
      });

    } catch (e) {
      continue;
    }
  }

  return res.status(500).json({ error: 'Aucun endpoint ETF CoinGlass disponible avec ce plan' });
}
