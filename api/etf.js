export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1h pour économiser les crédits

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';
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

    const getIdx = n => headers.findIndex(h => h.trim() === n || h.includes(n));
    const ii = getIdx('IBIT');
    const fi = getIdx('FBTC');
    const gi = getIdx('GBTC');
    const ai = getIdx('ARKB');

    const last = dataRows[dataRows.length - 1];

    // La dernière cellule = Total (colonne sans header sur Farside)
    const totalVal = last[last.length - 1] || '—';

    // Historique 10 jours — dernière cellule = total
    const history = dataRows.slice(-10).map(row => ({
      date:  row[0],
      total: parseFloat(row[row.length - 1]) || 0,
    }));

    // Top flux du jour — toutes colonnes sauf date (idx 0) et total (dernière)
    const topFlows = [];
    headers.slice(1, headers.length - 1).forEach((h, i) => {
      if (!h) return;
      const val = parseFloat(last[i + 1]) || 0;
      if (val !== 0) topFlows.push({ name: h, val });
    });
    topFlows.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

    return res.status(200).json({
      source: 'Farside · ScrapingBee',
      date:   last[0] || '—',
      total:  totalVal,
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
