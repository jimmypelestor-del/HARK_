export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=900');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=8000&premium_proxy=false&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();

    // ── TOTAL — "24h Liquidation" (toutes cryptos, toutes exchanges)
    let total = 0;
    const totalMatch = html.match(/24h Liquidation[\s\S]{0,200}?\$([\d,]+)/);
    if (totalMatch) total = parseFloat(totalMatch[1].replace(/,/g,''));

    // ── LONG / SHORT — aria-label dans la zone "24h Rekt"
    // Format exact : aria-label="112,670,xxx">$112.67M (Long) puis aria-label="32,720,xxx">$32.72M (Short)
    let longVal = 0, shortVal = 0;
    const rektIdx = html.indexOf('24h Rekt');
    if (rektIdx >= 0) {
      const zone = html.slice(rektIdx, rektIdx + 800);
      const ariaVals = [...zone.matchAll(/aria-label="([\d,.]+)"/g)]
        .map(m => parseFloat(m[1].replace(/,/g,'')));
      // Position 0 = total BTC rekt, 1 = Long BTC, 2 = Short BTC
      if (ariaVals.length >= 3) {
        longVal  = ariaVals[1];
        shortVal = ariaVals[2];
      } else if (ariaVals.length === 2) {
        longVal  = ariaVals[0];
        shortVal = ariaVals[1];
      }
    }

    if (total < 1e6) throw new Error('Total trop faible: ' + total);

    // Si long/short non trouvés, fallback proportionnel
    if (longVal === 0 && shortVal === 0) {
      longVal  = total * 0.5;
      shortVal = total * 0.5;
    }

    const tot     = longVal + shortVal || total;
    const lPct    = (longVal  / tot * 100).toFixed(1);
    const sPct    = (shortVal / tot * 100).toFixed(1);
    const dom     = longVal > shortVal ? 'longs' : 'shorts';
    const domPct  = dom === 'longs' ? lPct : sPct;

    return res.status(200).json({
      source:   'CoinGlass · ScrapingBee',
      total:    fmtUsd(total),
      long:     fmtUsd(longVal),
      short:    fmtUsd(shortVal),
      longPct:  lPct,
      shortPct: sPct,
      dom, domPct,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function fmtUsd(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M';
  return '$' + Math.round(n/1e3) + 'K';
}
