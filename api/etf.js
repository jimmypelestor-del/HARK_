export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';
  const TARGET = 'https://farside.co.uk/btc/';

  // Essai 1 : sans JS (rapide ~2s)
  try {
    const url1 = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(TARGET)}&render_js=false`;
    const r1 = await fetch(url1, { signal: AbortSignal.timeout(8000) });
    if (r1.ok) {
      const html = await r1.text();
      const result = parseEtf(html);
      if (result) return res.status(200).json(result);
    }
  } catch {}

  // Essai 2 : avec JS + wait court (5s)
  try {
    const url2 = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(TARGET)}&render_js=true&wait=3000`;
    const r2 = await fetch(url2, { signal: AbortSignal.timeout(9000) });
    if (r2.ok) {
      const html = await r2.text();
      const result = parseEtf(html);
      if (result) return res.status(200).json(result);
    }
  } catch {}

  return res.status(500).json({ error: 'ETF indisponible' });
}

function parseEtf(html) {
  if (!html || html.length < 500) return null;

  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  let headers = [];
  const dataRows = [];

  for (const match of trMatches) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').replace(/\s+/g,' ').trim());
    if (!cells.length) continue;
    if (cells.some(c => c === 'IBIT') && cells.some(c => c === 'GBTC' || c === 'Total')) {
      headers = cells; continue;
    }
    const first = cells[0];
    const isData = first && first.length >= 3 && (
      /\d{1,2}\s+\w{3}/.test(first) || /\w{3}\s+\d/.test(first) ||
      /\d{2}\/\d{2}/.test(first)    || /\d{4}-\d{2}/.test(first)
    );
    if (isData && cells.length > 3) dataRows.push(cells);
  }

  if (!dataRows.length) return null;

  const getIdx = n => headers.findIndex(h => h === n);
  const ii = getIdx('IBIT'), fi = getIdx('FBTC'), gi = getIdx('GBTC'), ai = getIdx('ARKB');
  const last = dataRows[dataRows.length - 1];
  const totalVal = last[last.length - 1] || '—';

  const topFlows = [];
  headers.slice(1, headers.length - 1).forEach((h, i) => {
    if (!h) return;
    const val = parseFloat(last[i + 1]) || 0;
    if (val !== 0) topFlows.push({ name: h, val });
  });
  topFlows.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

  const history = dataRows.slice(-10).map(row => ({
    date:  row[0],
    total: parseFloat(row[row.length - 1]) || 0,
  }));

  return {
    source: 'Farside · ScrapingBee',
    date:   last[0] || '—',
    total:  totalVal,
    ibit:   ii >= 0 ? (last[ii] || '—') : '—',
    fbtc:   fi >= 0 ? (last[fi] || '—') : '—',
    gbtc:   gi >= 0 ? (last[gi] || '—') : '—',
    arkb:   ai >= 0 ? (last[ai] || '—') : '—',
    topFlows: topFlows.slice(0, 5),
    history,
  };
}
