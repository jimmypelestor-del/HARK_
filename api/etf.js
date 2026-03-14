export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const SB  = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';
  const URL = 'https://farside.co.uk/btc/';

  try {
    const r = await fetch(
      `https://app.scrapingbee.com/api/v1/?api_key=${SB}&url=${encodeURIComponent(URL)}&render_js=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error('SB ' + r.status);
    const html = await r.text();

    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let headers = [], dataRows = [];

    for (const m of rows) {
      const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').replace(/\s+/g,' ').trim());
      if (!cells.length) continue;
      if (cells.some(c => c==='IBIT') && cells.some(c => c==='GBTC'||c==='Total')) { headers=cells; continue; }
      const f = cells[0];
      if (f && f.length>=3 && (/\d{1,2}\s+\w{3}/.test(f)||/\w{3}\s+\d/.test(f)||/\d{2}\/\d{2}/.test(f))) {
        dataRows.push(cells);
      }
    }

    if (!dataRows.length) throw new Error('no rows');

    const gi = n => headers.findIndex(h=>h===n);
    const last = dataRows[dataRows.length-1];

    const topFlows = headers.slice(1, headers.length-1)
      .map((h,i) => ({ name:h, val: parseFloat(last[i+1])||0 }))
      .filter(f => f.val!==0 && f.name)
      .sort((a,b) => Math.abs(b.val)-Math.abs(a.val));

    const history = dataRows.slice(-10).map(r => ({
      date: r[0],
      total: parseFloat(r[r.length-1])||0
    }));

    return res.status(200).json({
      date: last[0]||'—',
      total: last[last.length-1]||'—',
      ibit: gi('IBIT')>=0 ? last[gi('IBIT')]||'—' : '—',
      fbtc: gi('FBTC')>=0 ? last[gi('FBTC')]||'—' : '—',
      gbtc: gi('GBTC')>=0 ? last[gi('GBTC')]||'—' : '—',
      arkb: gi('ARKB')>=0 ? last[gi('ARKB')]||'—' : '—',
      topFlows: topFlows.slice(0,5),
      history,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
