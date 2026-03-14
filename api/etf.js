export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800');

  try {
    const r = await fetch('https://farside.co.uk/btc/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://farside.co.uk/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) {
      return res.status(500).json({ error: `HTTP ${r.status}`, debug: 'fetch failed' });
    }

    const html = await r.text();

    // Debug : retourner un extrait si pas de tableau trouvé
    if (!html.includes('<table') && !html.includes('<tr')) {
      return res.status(500).json({
        error: 'No table found',
        debug: html.slice(0, 500),
        length: html.length,
      });
    }

    // Stratégie 1 : chercher les lignes <tr> contenant des cellules numériques
    const allRows = [];
    const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    let headers = [];

    for (const match of trMatches) {
      const inner = match[1];
      const cells = [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, '')
          .replace(/&#[0-9]+;/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        );

      if (!cells.length) continue;

      // Détecter l'en-tête — contient IBIT ou Total
      if (cells.some(c => c === 'IBIT') && cells.some(c => c === 'Total' || c === 'GBTC')) {
        headers = cells;
        continue;
      }

      // Ligne de données — première cellule est une date (ex: "13 Mar", "2026-03-13", "13/03")
      const firstCell = cells[0];
      const isDataRow = firstCell && firstCell.length >= 3 && (
        /\d{1,2}[\s\/\-]\w/.test(firstCell) ||  // "13 Mar" ou "13/03"
        /\w{3,}\s+\d/.test(firstCell) ||          // "Mar 13"
        /^\d{4}/.test(firstCell)                   // "2026-03-13"
      );

      if (isDataRow && cells.length > 3) {
        allRows.push(cells);
      }
    }

    if (!allRows.length) {
      // Stratégie 2 : chercher des patterns numériques dans le HTML
      const numPatterns = html.match(/>\s*[-]?\d+\.?\d*\s*</g) || [];
      return res.status(500).json({
        error: 'No data rows found',
        headersFound: headers,
        rowCount: trMatches.length,
        numSamples: numPatterns.slice(0, 10),
        htmlSample: html.slice(1000, 2000),
      });
    }

    // Utiliser les headers trouvés ou déduire depuis la position
    const getIdx = (name) => headers.findIndex(h => h === name);
    const totalIdx = getIdx('Total');
    const ibitIdx  = getIdx('IBIT');
    const fbtcIdx  = getIdx('FBTC');
    const gbtcIdx  = getIdx('GBTC');
    const arkbIdx  = getIdx('ARKB');
    const bitbIdx  = getIdx('BITB');

    const lastRow = allRows[allRows.length - 1];

    // Top flux du jour
    const topFlows = [];
    if (headers.length > 0) {
      headers.forEach((h, i) => {
        if (h === 'Total' || h === '' || i === 0) return;
        const val = parseFloat(lastRow[i]) || 0;
        if (val !== 0) topFlows.push({ name: h, val });
      });
      topFlows.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    }

    // Historique 10 derniers jours
    const history = allRows.slice(-10).map(row => ({
      date:  row[0],
      total: totalIdx >= 0 ? (parseFloat(row[totalIdx]) || 0) : 0,
    }));

    return res.status(200).json({
      date:  lastRow[0] || '—',
      total: totalIdx >= 0 ? (lastRow[totalIdx] || '—') : '—',
      ibit:  ibitIdx  >= 0 ? (lastRow[ibitIdx]  || '—') : '—',
      fbtc:  fbtcIdx  >= 0 ? (lastRow[fbtcIdx]  || '—') : '—',
      gbtc:  gbtcIdx  >= 0 ? (lastRow[gbtcIdx]  || '—') : '—',
      arkb:  arkbIdx  >= 0 ? (lastRow[arkbIdx]  || '—') : '—',
      bitb:  bitbIdx  >= 0 ? (lastRow[bitbIdx]  || '—') : '—',
      topFlows: topFlows.slice(0, 5),
      history,
      debug: {
        headersFound: headers,
        rowsFound: allRows.length,
        lastRowRaw: lastRow,
      }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 300) });
  }
}
