export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=0');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=8000&premium_proxy=false&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();

    // Trouver TOUTES les occurrences de "Rekt" et "24h"
    const rektPositions = [];
    let pos = 0;
    while ((pos = html.indexOf('Rekt', pos)) !== -1) {
      rektPositions.push({ pos, ctx: html.slice(Math.max(0,pos-20), pos+200) });
      pos++;
    }

    const h24positions = [];
    pos = 0;
    while ((pos = html.indexOf('24h', pos)) !== -1) {
      h24positions.push({ pos, ctx: html.slice(Math.max(0,pos-10), pos+150) });
      pos++;
      if (h24positions.length >= 5) break;
    }

    // Chercher "147" ou "148" dans le HTML (le vrai total)
    const has147 = html.includes('147') || html.includes('148') || html.includes('149');

    return res.status(200).json({
      debug: true,
      htmlLength: html.length,
      has147inHtml: has147,
      rektOccurrences: rektPositions.slice(0, 5),
      h24Occurrences: h24positions,
      // Chercher le texte autour de "24h Rekt" précisément
      zone24hRekt: (() => {
        const i = html.indexOf('24h Rekt');
        return i >= 0 ? html.slice(i, i + 400) : 'NOT FOUND';
      })(),
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
