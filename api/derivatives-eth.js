export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');

  const SYM_BYBIT   = 'ETHUSDT';
  const SYM_BINANCE = 'ETHUSDT';

  const result = { fr: null, frRaw: null, oi: null, lp: null, sp: null, error: null };

  // ── Bybit : Funding Rate + Open Interest ──
  try {
    const r = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${SYM_BYBIT}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error('Bybit ' + r.status);
    const d = await r.json();
    const ticker = d?.result?.list?.[0];
    if (ticker) {
      result.frRaw = parseFloat(ticker.fundingRate);
      result.fr    = (result.frRaw * 100).toFixed(4);
      const oi     = parseFloat(ticker.openInterestValue);
      if (oi) result.oi = oi >= 1e9
        ? '$' + (oi / 1e9).toFixed(2) + 'B'
        : '$' + (oi / 1e6).toFixed(0) + 'M';
    }
  } catch (e) {
    result.error = 'Bybit: ' + e.message;
  }

  // ── Binance : Long / Short Ratio ──
  try {
    const r = await fetch(
      `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${SYM_BINANCE}&period=5m&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error('Binance ' + r.status);
    const d = await r.json();
    const row = d?.[0];
    if (row) {
      result.lp = (parseFloat(row.longAccount) * 100).toFixed(1);
      result.sp = (100 - parseFloat(row.longAccount) * 100).toFixed(1);
    }
  } catch (e) {
    result.error = (result.error ? result.error + ' | ' : '') + 'Binance: ' + e.message;
  }

  return res.status(200).json(result);
}
