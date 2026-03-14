export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const SB  = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  // Essai 1 : page "all data" — HTML statique, pas de JS requis
  const urls = [
    'https://farside.co.uk/bitcoin-etf-flow-all-data/',
    'https://farside.co.uk/btc/',
  ];

  for (const target of urls) {
    try {
      const r = await fetch(
        `https://app.scrapingbee.com/api/v1/?api_key=${SB}&url=${encodeURIComponent(target)}&render_js=false`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) continue;
      const html = await r.text();
      const result = parseEtf(html);
      if (result && result.history.length > 0) {
        return res.status(200).json(result);
      }
    } catch {}
  }

  return res.status(500).json({ error: 'Farside indisponible' });
}

function parseEtf(html) {
  if (!html || html.length < 500) return null;

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  let headers = [], dataRows = [];

  for (const m of rows) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').replace(/\s+/g,' ').trim());
    if (!cells.length) continue;

    // Détecter header : contient IBIT
    if (cells.some(c => c === 'IBIT')) {
      headers = cells;
      continue;
    }

    // Ligne de données : commence par une date (ex: "13 Mar 2026" ou "13 Mar")
    const f = cells[0];
    if (f && /^\d{1,2}\s+\w{3}/.test(f) && cells.length > 3) {
      dataRows.push(cells);
    }
  }

  if (!dataRows.length || !headers.length) return null;

  const gi = n => headers.findIndex(h => h === n);
  const ii = gi('IBIT'), fi = gi('FBTC'), gi2 = gi('GBTC'), ai = gi('ARKB');

  // Dernière vraie ligne de données (ignorer les lignes footer)
  const last = dataRows[dataRows.length - 1];
  const total = last[last.length - 1] || '—';

  const topFlows = headers.slice(1, headers.length - 1)
    .map((h, i) => ({ name: h, val: parseFloat(last[i + 1]) || 0 }))
    .filter(f => f.val !== 0 && f.name && f.name.length < 10)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

  const history = dataRows.slice(-10).map(r => ({
    date:  r[0].replace(' 2026','').replace(' 2025',''),
    total: parseFloat(r[r.length - 1]) || 0,
  }));

  return {
    date:  last[0] || '—',
    total: isNaN(parseFloat(total)) ? '—' : total,
    ibit:  ii  >= 0 ? (last[ii]  || '—') : '—',
    fbtc:  fi  >= 0 ? (last[fi]  || '—') : '—',
    gbtc:  gi2 >= 0 ? (last[gi2] || '—') : '—',
    arkb:  ai  >= 0 ? (last[ai]  || '—') : '—',
    topFlows: topFlows.slice(0, 5),
    history,
  };
}
