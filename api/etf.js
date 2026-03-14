export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  // ── Tentative 1 : DefiLlama ETF API (gratuit, CORS ouvert) ──
  const llamaEndpoints = [
    'https://api.llama.fi/etfs/bitcoin',
    'https://api.llama.fi/etf/bitcoin',
    'https://api.llama.fi/etfs',
  ];

  for (const url of llamaEndpoints) {
    try {
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const d = await r.json();

      // DefiLlama retourne flows: [[timestamp, net, inflow, outflow, usdValue, usdValueOfNet], ...]
      const flows = d.flows || d.data?.flows || [];
      if (!flows.length) continue;

      // Trier par timestamp décroissant
      flows.sort((a, b) => b[0] - a[0]);
      const last10 = flows.slice(0, 10).reverse();
      const latest = flows[0];

      const totalUsd  = latest[5] || latest[4] || 0; // usdValueOfNet ou usdValue
      const netBtc    = latest[1] || 0;
      const inflowBtc = latest[2] || 0;
      const outBtc    = latest[3] || 0;
      const ts        = new Date(latest[0]).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });

      // Historique 10 jours pour le graphique (en USD millions)
      const history = last10.map(f => ({
        date:  new Date(f[0]).toLocaleDateString('fr-FR', { day:'numeric', month:'short' }),
        total: Math.round((f[5] || f[4] || 0) / 1e6),
      }));

      return res.status(200).json({
        source: 'DefiLlama',
        date:   ts,
        total:  (totalUsd / 1e6).toFixed(1),
        netBtc: netBtc.toFixed(0),
        inflow: (inflowBtc * (latest[4] / (inflowBtc || 1)) / 1e6).toFixed(1),
        history,
        topFlows: [],
        ibit: '—', fbtc: '—', arkb: '—', gbtc: '—',
      });
    } catch {}
  }

  // ── Tentative 2 : Farside via proxy allorigins (scraping HTML) ──
  try {
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://farside.co.uk/bitcoin-etf-flow-all-data/');
    const r = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('proxy ' + r.status);
    const json = await r.json();
    const html = json.contents || '';
    if (!html || html.length < 500) throw new Error('empty html');

    // Parser le tableau
    const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let headers = [];
    const dataRows = [];

    for (const match of trMatches) {
      const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').replace(/\s+/g,' ').trim());

      if (cells.some(c => c === 'IBIT') && cells.some(c => c === 'Total' || c === 'GBTC')) {
        headers = cells; continue;
      }
      if (cells.length > 3 && cells[0] && /\d/.test(cells[0]) && cells[0].length >= 3) {
        dataRows.push(cells);
      }
    }

    if (!dataRows.length) throw new Error('no rows — ' + html.slice(0,200));

    const getIdx = n => headers.findIndex(h => h === n);
    const ti = getIdx('Total'), ii = getIdx('IBIT'), fi = getIdx('FBTC'), gi = getIdx('GBTC'), ai = getIdx('ARKB');
    const last = dataRows[dataRows.length - 1];

    const topFlows = headers.slice(1, ti > 0 ? ti : headers.length)
      .map((h, i) => ({ name: h, val: parseFloat(last[i+1]) || 0 }))
      .filter(f => f.val !== 0)
      .sort((a,b) => Math.abs(b.val) - Math.abs(a.val));

    const history = dataRows.slice(-10).map(row => ({
      date:  row[0],
      total: ti >= 0 ? (parseFloat(row[ti]) || 0) : 0,
    }));

    return res.status(200).json({
      source: 'Farside',
      date:   last[0] || '—',
      total:  ti >= 0 ? (last[ti] || '—') : '—',
      ibit:   ii >= 0 ? (last[ii] || '—') : '—',
      fbtc:   fi >= 0 ? (last[fi] || '—') : '—',
      gbtc:   gi >= 0 ? (last[gi] || '—') : '—',
      arkb:   ai >= 0 ? (last[ai] || '—') : '—',
      topFlows: topFlows.slice(0, 5),
      history,
    });

  } catch (e2) {
    return res.status(500).json({
      error: e2.message,
      tip: 'DefiLlama et Farside indisponibles',
    });
  }
}
