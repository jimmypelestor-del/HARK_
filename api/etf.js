export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1h pour économiser les crédits

  const SB_KEY = 'bb4bb63c8eb64f9f8e2eb40ed80aced17b5a5488157';
  const TARGET = 'https://farside.co.uk/btc/';

  try {
    // ScrapingBee — lance un vrai Chrome, contourne le 403
    const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(TARGET)}&render_js=false&premium_proxy=false`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('ScrapingBee HTTP ' + r.status);
    const html = await r.text();

    if (!html || html.length < 500) throw new Error('HTML vide — ' + html.slice(0, 100));
    if (!html.includes('<table') && !html.includes('<tr')) throw new Error('Pas de tableau dans le HTML');

    // Parser le tableau
    const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    let headers = [];
    const dataRows = [];

    for (const match of trMatches) {
      const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, '')
          .replace(/&#[0-9]+;/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        );

      if (!cells.length) continue;

      // En-tête — contient IBIT et Total
      if (cells.some(c => c === 'IBIT') && cells.some(c => c === 'Total' || c === 'GBTC')) {
        headers = cells;
        continue;
      }

      // Ligne de données — première cellule = date
      const first = cells[0];
      const isData = first && first.length >= 3 && (
        /\d{1,2}\s+\w{3}/.test(first) ||   // "13 Mar"
        /\w{3}\s+\d{1,2}/.test(first) ||   // "Mar 13"
        /\d{2}\/\d{2}/.test(first) ||       // "13/03"
        /\d{4}-\d{2}/.test(first)           // "2026-03"
      );

      if (isData && cells.length > 3) {
        dataRows.push(cells);
      }
    }

    if (!dataRows.length) {
      // Debug : retourner un extrait du HTML pour diagnostiquer
      return res.status(500).json({
        error: 'Aucune ligne de données trouvée',
        headersFound: headers,
        rowCount: trMatches.length,
        htmlSample: html.slice(0, 800),
      });
    }

    const getIdx = n => headers.findIndex(h => h === n);
    const ti = getIdx('Total');
    const ii = getIdx('IBIT');
    const fi = getIdx('FBTC');
    const gi = getIdx('GBTC');
    const ai = getIdx('ARKB');

    const last = dataRows[dataRows.length - 1];

    // Top flux du jour
    const topFlows = [];
    if (headers.length > 0 && ti > 0) {
      headers.slice(1, ti).forEach((h, i) => {
        const val = parseFloat(last[i + 1]) || 0;
        if (val !== 0 && h) topFlows.push({ name: h, val });
      });
      topFlows.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
    }

    // Historique 10 derniers jours
    const history = dataRows.slice(-10).map(row => ({
      date:  row[0],
      total: ti >= 0 ? (parseFloat(row[ti]) || 0) : 0,
    }));

    return res.status(200).json({
      source: 'Farside via ScrapingBee',
      date:   last[0] || '—',
      total:  ti >= 0 ? (last[ti] || '—') : '—',
      ibit:   ii >= 0 ? (last[ii] || '—') : '—',
      fbtc:   fi >= 0 ? (last[fi] || '—') : '—',
      gbtc:   gi >= 0 ? (last[gi] || '—') : '—',
      arkb:   ai >= 0 ? (last[ai] || '—') : '—',
      topFlows: topFlows.slice(0, 5),
      history,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
