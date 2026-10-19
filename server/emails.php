<?php
// Email texts. The visitor's interface language is sent by the site (X-Librava-Lang);
// languages without a template fall back to English.
declare(strict_types=1);

function mail_lang(): string {
    $l = strtolower(substr($_SERVER['HTTP_X_LIBRAVA_LANG'] ?? 'en', 0, 2));
    return in_array($l, ['en', 'ro', 'it', 'fr', 'de', 'es'], true) ? $l : 'en';
}

function mail_text(string $key, array $v = []): array {
    $T = [
        'reset' => [
            'en' => ['Reset your Librava password', "Hello {name},\n\nTo choose a new password, open this link (valid for 1 hour):\n{link}\n\nIf you did not ask for this, ignore this email: your password stays the same.\n\nLibrava"],
            'ro' => ['Resetează parola Librava', "Bună, {name},\n\nCa să alegi o parolă nouă, deschide acest link (valabil 1 oră):\n{link}\n\nDacă nu ai cerut tu asta, ignoră emailul: parola ta rămâne aceeași.\n\nLibrava"],
            'it' => ['Reimposta la password di Librava', "Ciao {name},\n\nPer scegliere una nuova password apri questo link (valido 1 ora):\n{link}\n\nSe non l'hai richiesto tu, ignora questa email: la password resta invariata.\n\nLibrava"],
            'fr' => ['Réinitialisez votre mot de passe Librava', "Bonjour {name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n{link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\nLibrava"],
            'de' => ['Librava-Passwort zurücksetzen', "Hallo {name},\n\num ein neues Passwort zu wählen, öffne diesen Link (1 Stunde gültig):\n{link}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.\n\nLibrava"],
            'es' => ['Restablece tu contraseña de Librava', "Hola {name}:\n\nPara elegir una contraseña nueva, abre este enlace (válido 1 hora):\n{link}\n\nSi no lo has pedido tú, ignora este correo.\n\nLibrava"],
        ],
        'bank' => [
            'en' => ['Your Librava order {ref}', "Hello {name},\n\nThank you for your order {ref}.\n\nBooks:\n{items}\n\nTotal: {amount}\n\nPlease make a bank transfer:\nAccount holder: {holder}\nIBAN: {iban}\nBIC / SWIFT: {bic}\nBank: {bank}\nPayment details: {ref}\n\nYour books will appear in your library as soon as we receive the payment.\n\nLibrava"],
            'ro' => ['Comanda ta Librava {ref}', "Bună, {name},\n\nÎți mulțumim pentru comanda {ref}.\n\nCărți:\n{items}\n\nTotal: {amount}\n\nTe rugăm să faci un transfer bancar:\nBeneficiar: {holder}\nIBAN: {iban}\nBIC / SWIFT: {bic}\nBanca: {bank}\nDetaliile plății: {ref}\n\nCărțile vor apărea în biblioteca ta imediat ce primim plata.\n\nLibrava"],
            'it' => ['Il tuo ordine Librava {ref}', "Ciao {name},\n\ngrazie per l'ordine {ref}.\n\nLibri:\n{items}\n\nTotale: {amount}\n\nEffettua un bonifico:\nIntestatario: {holder}\nIBAN: {iban}\nBIC / SWIFT: {bic}\nBanca: {bank}\nCausale: {ref}\n\nI libri appariranno nella tua libreria appena riceviamo il pagamento.\n\nLibrava"],
        ],
        'paid' => [
            'en' => ['Your books are ready — order {ref}', "Hello {name},\n\nWe received the payment for order {ref}. Your books are now in your library:\n{link}\n\nHappy reading!\nLibrava"],
            'ro' => ['Cărțile tale sunt gata — comanda {ref}', "Bună, {name},\n\nAm primit plata pentru comanda {ref}. Cărțile sunt acum în biblioteca ta:\n{link}\n\nLectură plăcută!\nLibrava"],
            'it' => ['I tuoi libri sono pronti — ordine {ref}', "Ciao {name},\n\nabbiamo ricevuto il pagamento dell'ordine {ref}. I libri sono ora nella tua libreria:\n{link}\n\nBuona lettura!\nLibrava"],
        ],
        'admin_order' => [
            'en' => ['New order {ref} — {amount}', "New order {ref} from {email}\nMethod: {method}\nTotal: {amount}\n\n{items}\n\nConfirm bank transfers in the admin panel: {link}"],
        ],
    ];
    $lang = mail_lang();
    $tpl = $T[$key][$lang] ?? $T[$key]['en'];
    $rep = [];
    foreach ($v as $k => $val) $rep['{' . $k . '}'] = (string)$val;
    return [strtr($tpl[0], $rep), strtr($tpl[1], $rep)];
}

function money_text(int $cents, string $cur): string { return number_format($cents / 100, 2, ',', '.') . ' ' . $cur; }
