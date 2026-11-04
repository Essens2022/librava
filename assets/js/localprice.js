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
const TZ = {
  'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT', 'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Helsinki': 'FI', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Luxembourg': 'LU', 'Europe/Malta': 'MT', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR', 'Asia/Nicosia': 'CY', 'Europe/Nicosia': 'CY', 'Europe/Andorra': 'AD', 'Europe/Monaco': 'MC', 'Europe/San_Marino': 'SM', 'Europe/Vatican': 'VA', 'Europe/Podgorica': 'ME', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT', 'Europe/Mariehamn': 'FI',
 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Zurich': 'CH', 'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Chisinau': 'MD', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Istanbul': 'TR', 'Europe/Belgrade': 'RS',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU', 'Australia/Darwin': 'AU', 'Australia/Canberra': 'AU', 'Australia/Lord_Howe': 'AU', 'Australia/ACT': 'AU', 'Australia/NSW': 'AU', 'Australia/Victoria': 'AU', 'Australia/Queensland': 'AU', 'Pacific/Auckland': 'NZ', 'NZ': 'NZ',
  'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US', 'America/Menominee': 'US', 'America/Kentucky/Louisville': 'US', 'America/Louisville': 'US', 'America/Indianapolis': 'US', 'America/Nome': 'US', 'America/Sitka': 'US', 'US/Eastern': 'US', 'US/Central': 'US', 'US/Mountain': 'US', 'US/Pacific': 'US', 'US/Arizona': 'US', 'US/Alaska': 'US', 'US/Hawaii': 'US',
  'America/Montreal': 'CA', 'America/Regina': 'CA', 'America/St_Johns': 'CA', 'America/Moncton': 'CA', 'America/Glace_Bay': 'CA', 'America/Iqaluit': 'CA', 'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA', 'America/Thunder_Bay': 'CA', 'America/Nipigon': 'CA', 'America/Rainy_River': 'CA', 'America/Swift_Current': 'CA', 'America/Dawson': 'CA', 'America/Dawson_Creek': 'CA', 'America/Fort_Nelson': 'CA', 'America/Cambridge_Bay': 'CA', 'Canada/Eastern': 'CA', 'Canada/Pacific': 'CA', 'Canada/Central': 'CA', 'Canada/Mountain': 'CA', 'Canada/Atlantic': 'CA', 'Canada/Newfoundland': 'CA',
  'Europe/Belfast': 'GB', 'Europe/Jersey': 'GB', 'Europe/Guernsey': 'GB', 'Europe/Isle_of_Man': 'GB', 'GB': 'GB', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG', 'Asia/Riyadh': 'SA', 'Asia/Taipei': 'TW', 'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Lima': 'PE',
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
// Approximate rates for 1 EUR (autumn 2026). They are only the starting point: the page shows the visitor's own currency from the very first
// paint, with no flash of euros. Today's real rates are downloaded in the background and kept for the next visit (12 hours).
const FALLBACK = { USD: 1.16, GBP: 0.87, CAD: 1.62, AUD: 1.78, NZD: 1.99, CHF: 0.93, NOK: 11.7, SEK: 11.0, DKK: 7.46, ISK: 143, PLN: 4.25, CZK: 24.3, HUF: 390, RON: 5.08, BGN: 1.956,
  RSD: 117.2, BAM: 1.956, MKD: 61.5, ALL: 97, MDL: 19.5, UAH: 48, TRY: 48, GEL: 3.15, AMD: 445, AZN: 1.97, ILS: 3.85, AED: 4.26, SAR: 4.35, QAR: 4.22, KWD: 0.355, BHD: 0.437,
  OMR: 0.446, JOD: 0.82, EGP: 55, MAD: 10.8, TND: 3.4, DZD: 150, ZAR: 20.1, NGN: 1700, KES: 150, GHS: 12.5, UGX: 4200, TZS: 3000, INR: 101, PKR: 325, BDT: 141, LKR: 350, NPR: 162,
  JPY: 178, KRW: 1650, CNY: 8.3, HKD: 9.0, TWD: 36, SGD: 1.5, MYR: 4.9, THB: 37.5, IDR: 19000, PHP: 67, VND: 30500, KZT: 590, UZS: 14000, MXN: 21.3, BRL: 6.2, ARS: 1650,
  CLP: 1090, COP: 4450, PEN: 4.0, UYU: 46, PYG: 8200, BOB: 8.0, CRC: 590, GTQ: 8.9, DOP: 73, JMD: 183, TTD: 7.9 };
const KEY = 'lp:rates';
// the rates used in this visit are fixed at the start (saved real rates, however old, else the built-in ones): prices never change under the visitor's eyes
let rates = FALLBACK, savedAt = 0;
try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && r.rates && r.rates.USD) { rates = { ...FALLBACK, ...r.rates }; savedAt = r.t || 0; } } catch { }
let loading = null;
export function loadRates() {
  if (loading || visitorCurrency() === 'EUR' || Date.now() - savedAt < 12 * 3600e3) return;
  // only saved for the next visit; the page already on screen is not redrawn
  loading = fetch('https://open.er-api.com/v6/latest/EUR').then(r => r.json()).then(j => {
    if (!j || !j.rates || !j.rates.USD) return;
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), rates: j.rates })); } catch { }
  }).catch(() => { });
}
// EUR cents -> { cents, currency } in the visitor's currency, or null when no conversion applies
export function localize(cents) {
  const cur = visitorCurrency();
  if (cur === 'EUR' || !rates[cur]) return null;
  const v = (cents / 100) * rates[cur] * 1.03;
  const zero = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG', 'UGX', 'ISK', 'HUF', 'COP', 'KZT', 'UZS', 'TZS'].includes(cur);
  // the same amount the payment page will ask (no rounding up)
  const nice = zero ? Math.max(1, Math.round(v)) : Math.round(v * 100) / 100;
  return { amount: nice, currency: cur };
}
