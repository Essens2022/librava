// Small offline guess of a text's language (the shop's 24 languages), only to decide whether a
// review needs a "Translate" button. Short or mixed texts return null (= show the button).
const W = {
  en: 'the and is it this was for with very but not you book great good my of to',
  ro: 'și este nu cu foarte pentru carte mai din care sunt am un o ca dar pe',
  it: 'il e di che non è molto per un una con mi sono ma gli lo tutti questo consiglio bello anche perché della del ho',
  es: 'el la de que y es muy un una con por para no pero los las este recomiendo todo también porque del he',
  fr: 'le la les et est très un une livre pour pas que je de des du mais avec',
  de: 'der die das und ist sehr ein eine buch nicht ich mit für es auch aber zu',
  pt: 'o a de que e é muito um uma livro com não para os as mas do da',
  nl: 'de het een en is zeer erg boek niet ik met voor van dat maar ook',
  pl: 'i w nie jest to na bardzo się z że książka do jak ale dla',
  sv: 'och är det en att jag inte med för mycket bok på som men av',
  da: 'og er det en at jeg ikke med for meget bog på som men af til',
  no: 'og er det en at jeg ikke med for veldig bok på som men av til',
  fi: 'ja on se ei kirja erittäin hyvä että mutta kun myös tämä oli',
  cs: 'a je to na se v že velmi kniha ale pro jsem jako není s',
  sk: 'a je to na sa v že veľmi kniha ale pre som ako nie s',
  sl: 'in je da na se v zelo knjiga ne za ki pa so sem z',
  hr: 'i je da na se u vrlo knjiga ne za koji ali su sam s',
  hu: 'a az és egy nem hogy nagyon könyv is de van meg ez volt',
  et: 'ja on see ei raamat väga hea et aga kui ka oli mis',
  lv: 'un ir tas ne ļoti grāmata ar par bet kas es arī',
  lt: 'ir yra tai ne labai knyga su kad bet aš kaip taip',
};
const SETS = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, new Set(v.split(' '))]));

export function guessLang(text) {
  const s = String(text || '').toLowerCase();
  if (s.length < 12) return null;
  // scripts that point to one language straight away
  const cyr = (s.match(/[а-яёіїєґ]/g) || []).length, grk = (s.match(/[α-ωάέήίόύώ]/g) || []).length;
  if (grk > 5) return 'el';
  if (cyr > 5) return /[іїєґ]/.test(s) ? 'uk' : 'bg';
  if (/[ăâîșşțţ]/.test(s) && /\b(și|şi|este|pentru|foarte)\b/.test(s)) return 'ro';
  const words = s.match(/[\p{L}']+/gu) || [];
  if (words.length < 3) return null;
  let best = null, top = 0, second = 0;
  for (const [k, set] of Object.entries(SETS)) {
    let n = 0; for (const w of words) if (set.has(w)) n++;
    if (n > top) { second = top; top = n; best = k; } else if (n > second) second = n;
  }
  // not sure enough → unknown
  return top >= 2 && top >= second + 2 ? best : null;
}
