export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  try {
    const r = await fetch('https://farside.co.uk/btc/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();

    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let headers = [];
    const dataRows = [];

    for (const row of rows) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g,' ').trim());

      if (cells.some(c => c === 'IBIT' || c === 'Total')) {
        headers = cells;
        continue;
      }
      if (cells.length > 3 && cells[0] && /\d/.test(cells[0]) && cells[0].length > 2) {
        dataRows.push(cells);
      }
    }

    if (!dataRows.length || !headers.length) throw new Error('Parsing failed');

    const totalIdx = headers.findIndex(h => h === 'Total' || h === 'TOTAL');
    const ibitIdx  = headers.findIndex(h => h === 'IBIT');
    const fbtcIdx  = headers.findIndex(h => h === 'FBTC');
    const gbtcIdx  = headers.findIndex(h => h === 'GBTC');
    const arkbIdx  = headers.findIndex(h => h === 'ARKB');

    const lastRow = dataRows[dataRows.length - 1];

    const flows = headers.slice(1, totalIdx > 0 ? totalIdx : headers.length)
      .map((h, i) => ({ name: h, val: parseFloat(lastRow[i+1]) || 0 }))
      .filter(f => f.val !== 0)
      .sort((a,b) => Math.abs(b.val) - Math.abs(a.val));

    // 10 derniers jours pour le graphique (jours ouvrés uniquement)
    const history = dataRows.slice(-10).map(row => ({
      date:  row[0],
      total: parseFloat(totalIdx >= 0 ? row[totalIdx] : 0) || 0,
    }));

    return res.status(200).json({
      date:  lastRow[0] || '—',
      total: totalIdx >= 0 ? lastRow[totalIdx] : '—',
      ibit:  ibitIdx  >= 0 ? lastRow[ibitIdx]  : '—',
      fbtc:  fbtcIdx  >= 0 ? lastRow[fbtcIdx]  : '—',
      gbtc:  gbtcIdx  >= 0 ? lastRow[gbtcIdx]  : '—',
      arkb:  arkbIdx  >= 0 ? lastRow[arkbIdx]  : '—',
      topFlows: flows.slice(0, 5),
      history,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
