export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900');

  const SB = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB}&url=${encodeURIComponent(target)}&render_js=true&wait=8000&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();

    // ── Total depuis "24h Liquidation" dans la barre du haut
    let total = 0;
    const totalMatch = html.match(/24h Liquidation[\s\S]{0,200}?\$([\d,]+)/);
    if (totalMatch) total = parseFloat(totalMatch[1].replace(/,/g, ''));

    // ── Long/Short depuis aria-label dans la zone "24h Rekt"
    let longVal = 0, shortVal = 0;
    const rektIdx = html.indexOf('24h Rekt');
    if (rektIdx >= 0) {
      const zone = html.slice(rektIdx, rektIdx + 800);
      const ariaVals = [...zone.matchAll(/aria-label="([\d,.]+)"/g)]
        .map(m => parseFloat(m[1].replace(/,/g, '')));
      // [0]=total BTC, [1]=Long, [2]=Short
      if (ariaVals.length >= 3) { longVal = ariaVals[1]; shortVal = ariaVals[2]; }
    }

    // ── Fallback ratio depuis "24h Long/Short xx%/yy%"
    if (!longVal && !shortVal && total > 0) {
      const lsMatch = html.match(/24h Long\/Short[\s\S]{0,100}?([\d.]+)%\/([\d.]+)%/);
      if (lsMatch) {
        longVal  = total * parseFloat(lsMatch[1]) / 100;
        shortVal = total * parseFloat(lsMatch[2]) / 100;
      }
    }

    if (total < 1e6) throw new Error('Données insuffisantes');

    if (longVal > 0 && shortVal > 0) {
      // recalculer le total depuis long+short si plus précis
      const tot2 = longVal + shortVal;
      if (Math.abs(tot2 - total) / total < 0.3) total = tot2;
    }

    const tot     = longVal + shortVal || total;
    const lPct    = tot > 0 && longVal  > 0 ? (longVal  / tot * 100).toFixed(1) : '—';
    const sPct    = tot > 0 && shortVal > 0 ? (shortVal / tot * 100).toFixed(1) : '—';
    const dom     = longVal > shortVal ? 'longs' : 'shorts';
    const domPct  = dom === 'longs' ? lPct : sPct;

    return res.status(200).json({
      source: 'CoinGlass',
      total:  fmtUsd(total),
      long:   fmtUsd(longVal),
      short:  fmtUsd(shortVal),
      longPct: lPct, shortPct: sPct, dom, domPct,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function fmtUsd(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M';
  return '$' + Math.round(n/1e3) + 'K';
}
