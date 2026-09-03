// /api/stock-bars — Vercel Serverless Function
//
// Returns real historical daily price bars for one symbol, so charts show
// actual price history instead of decorative fake candles. Same security
// model as /api/stock-quote: Alpaca keys stay server-side only.
//
// Usage once deployed:
//   https://accessalertsapp.com/api/stock-bars?symbol=AAPL&limit=60

const ALPACA_BARS_URL = "https://data.alpaca.markets/v2/stocks";

function isValidSymbol(s) {
  return /^[A-Z.]{1,10}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    res.status(500).json({
      error:
        "Server is missing Alpaca credentials. Add ALPACA_KEY_ID and ALPACA_SECRET_KEY in Vercel's Environment Variables, then redeploy.",
    });
    return;
  }

  const symbol = (req.query.symbol || "").toString().toUpperCase().trim();
  if (!symbol || !isValidSymbol(symbol)) {
    res.status(400).json({ error: "Pass a valid ?symbol=AAPL" });
    return;
  }

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 5) limit = 60;
  if (limit > 500) limit = 500;

  const timeframe = req.query.timeframe === "1Hour" ? "1Hour" : "1Day";

  // Without an explicit "start" date, Alpaca's bars endpoint only returns
  // bars from the current trading day onward — which looks like "1 bar"
  // for a daily chart. Explicitly ask for a wide-enough window (6 months
  // back is plenty for a 60-bar daily chart) so real history comes back.
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);
  const start = startDate.toISOString().slice(0, 10);

  const headers = {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secretKey,
  };

  try {
    const url =
      `${ALPACA_BARS_URL}/${encodeURIComponent(symbol)}/bars` +
      `?timeframe=${timeframe}&start=${start}&limit=${limit}&adjustment=raw&sort=asc`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const body = await resp.text();
      res.status(502).json({
        error: "Alpaca API request failed",
        alpacaStatus: resp.status,
        alpacaBody: body,
      });
      return;
    }

    const data = await resp.json();
    const bars = (data.bars || []).map((b) => ({
      t: b.t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v,
    }));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ symbol, bars });
  } catch (err) {
    res.status(500).json({ error: "Unexpected server error", detail: String(err) });
  }
}
