// Prices in the visitor's own currency (approximate), like the payment page (Stripe Adaptive Pricing).
// The shop sells in EUR; visitors outside the euro area see the amount converted with today's rate
// plus about 3 % (the conversion fee the payment page adds), so the number matches what they pay.
const EURO = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK';
const CUR = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', LI: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK',
  HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', MD: 'MDL', UA: 'UAH', TR: 'TRY', GE: 'GEL', AM: 'AMD', AZ: 'AZN',
  IL: 'ILS', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD', EG: 'EGP', MA: 'MAD', TN: 'TND', DZ: 'DZD', ZA: 'ZAR',
  NG: 'NGN', KE: 'KES', GH: 'GHS', UG: 'UGX', TZ: 'TZS', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', JP: 'JPY', KR: 'KRW', CN: 'CNY',
  HK: 'HKD', TW: 'TWD', SG: 'SGD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND', KZ: 'KZT', UZ: 'UZS', MX: 'MXN', BR: 'BRL', AR: 'ARS',
  CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU', PY: 'PYG', BO: 'BOB', CR: 'CRC', GT: 'GTQ', DO: 'DOP', JM: 'JMD', TT: 'TTD', PA: 'USD', EC: 'USD',
  SV: 'USD', PR: 'USD', IE: 'EUR'
};
// a time zone tells the country when the browser language does not (e.g. "en" without a region)
const TZ = { 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Zurich': 'CH', 'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Chisinau': 'MD', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Istanbul': 'TR', 'Europe/Belgrade': 'RS',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE',
  'Asia/Jerusalem': 'IL', 'Africa/Johannesburg': 'ZA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR' };

export function visitorCountry() {
  try { const o = localStorage.getItem('lp:country'); if (o) return o; } catch { }
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { }
  if (TZ[tz]) return TZ[tz];
  for (const l of navigator.languages || [navigator.language]) { const m = /-([A-Z]{2})\b/.exec(l || ''); if (m) return m[1]; }
  return '';
}
export function visitorCurrency() {
  const c = visitorCountry();
  if (!c || EURO.includes(c)) return 'EUR';
  return CUR[c] || 'EUR';
}
const KEY = 'lp:rates';
let rates = null;
try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && Date.now() - r.t < 12 * 3600e3) rates = r.rates; } catch { }
let loading = null;
export function loadRates(onFirst) {
  if (rates || loading || visitorCurrency() === 'EUR') return;
  loading = fetch('https://open.er-api.com/v6/latest/EUR').then(r => r.json()).then(j => {
    if (!j || !j.rates) return;
    rates = j.rates; try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), rates })); } catch { }
    onFirst && onFirst();
  }).catch(() => { });
}
// EUR cents -> { cents, currency } in the visitor's currency, or null when no conversion applies
export function localize(cents) {
  const cur = visitorCurrency();
  if (cur === 'EUR' || !rates || !rates[cur]) return null;
  const v = (cents / 100) * rates[cur] * 1.03;
  const zero = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG', 'UGX', 'ISK', 'HUF', 'COP', 'KZT', 'UZS', 'TZS'].includes(cur);
  // the same amount the payment page will ask (no rounding up)
  const nice = zero ? Math.max(1, Math.round(v)) : Math.round(v * 100) / 100;
  return { amount: nice, currency: cur };
}
