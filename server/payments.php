<?php
// Orders: bank transfer (confirmed by the admin) and Stripe Checkout (confirmed by Stripe's webhook).
declare(strict_types=1);

function order_out(array $o): array {
    return ['id' => (int)$o['id'], 'reference' => $o['reference'], 'amount_cents' => (int)$o['amount_cents'], 'currency' => $o['currency'],
            'method' => $o['method'], 'status' => $o['status'], 'items' => json_decode($o['items'], true) ?: [], 'created_at' => iso($o['created_at'])];
}

function new_reference(): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $r = 'LIB-';
        for ($i = 0; $i < 6; $i++) $r .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    } while (one('SELECT 1 FROM orders WHERE reference = ?', [$r]));
    return $r;
}

function checkout(array $u): never {
    rate_limit('checkout:' . $u['id'], 20, 3600);
    $ids = body()['book_ids'] ?? [];
    $method = (string)(body()['method'] ?? '');
    if (!is_array($ids) || !$ids) fail('cart.empty');
    $ids = array_slice(array_values(array_unique(array_filter($ids, fn($x) => is_string($x) && preg_match('/^[0-9a-zA-Z-]{1,40}$/', $x)))), 0, 50);
    if (!$ids) fail('cart.empty');
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $books = all("SELECT * FROM books WHERE id IN ($marks) AND status = 'published' AND deleted_at IS NULL", $ids);
    $cfg = config();
    $paid = [];
    foreach ($books as $b) {
        if (owns((int)$u['id'], $b['id'])) continue;
        if ((int)$b['price_cents'] === 0) grant((int)$u['id'], $b['id'], null, 0);
        else $paid[] = $b;
    }
    if (!$paid) out(['mode' => 'done']);

    $hasCard = !empty($cfg['stripe']['secret_key']);
    $hasBank = !empty($cfg['bank']['iban']);
    if ($method === '') $method = $hasCard ? 'card' : 'bank';
    if (($method === 'card' && !$hasCard) || ($method === 'bank' && !$hasBank) || !in_array($method, ['card', 'bank'], true)) fail('pay.notConfigured', 503);

    $items = array_map(fn($b) => ['book_id' => $b['id'], 'title' => $b['title'], 'price_cents' => (int)$b['price_cents']], $paid);
    $amount = array_sum(array_column($items, 'price_cents'));
    $ref = new_reference();
    q('INSERT INTO orders (user_id, reference, items, amount_cents, currency, method) VALUES (?, ?, ?, ?, ?, ?)',
      [$u['id'], $ref, json_encode($items, JSON_UNESCAPED_UNICODE), $amount, $cfg['currency'], $method]);
    $orderId = (int)db()->lastInsertId();
    $itemsText = implode("\n", array_map(fn($i) => '• ' . $i['title'] . ' — ' . money_text($i['price_cents'], $cfg['currency']), $items));

    if ($method === 'bank') {
        $bank = ['holder' => $cfg['bank']['holder'] ?? '', 'iban' => $cfg['bank']['iban'] ?? '', 'bic' => $cfg['bank']['bic'] ?? '', 'bank' => $cfg['bank']['bank'] ?? ''];
        [$s, $t] = mail_text('bank', $bank + ['name' => $u['name'], 'ref' => $ref, 'items' => $itemsText, 'amount' => money_text($amount, $cfg['currency'])]);
        $sent = send_mail($u['email'], $s, $t);
        notify_admin($ref, $u['email'], 'bank', $amount, $itemsText);
        out(['mode' => 'bank', 'order' => ['reference' => $ref, 'amount_cents' => $amount, 'currency' => $cfg['currency'], 'items' => $items], 'bank' => $bank, 'emailed' => $sent]);
    }

    // Stripe Checkout
    $base = rtrim($cfg['site_url'], '/');
    $p = [
        'mode' => 'payment', 'client_reference_id' => (string)$u['id'], 'customer_email' => $u['email'], 'locale' => 'auto',
        'success_url' => $base . '/library?paid=1', 'cancel_url' => $base . '/cart',
        'metadata[order_id]' => (string)$orderId, 'payment_intent_data[metadata][order_id]' => (string)$orderId,
    ];
    foreach ($items as $i => $it) {
        $p["line_items[$i][quantity]"] = '1';
        $p["line_items[$i][price_data][currency]"] = strtolower($cfg['currency']);
        $p["line_items[$i][price_data][unit_amount]"] = (string)$it['price_cents'];
        $p["line_items[$i][price_data][product_data][name]"] = mb_substr($it['title'], 0, 250);
    }
    $session = stripe_api('POST', '/v1/checkout/sessions', $p);
    q('UPDATE orders SET stripe_session = ? WHERE id = ?', [$session['id'], $orderId]);
    out(['mode' => 'redirect', 'url' => $session['url']]);
}

function notify_admin(string $ref, string $email, string $method, int $amount, string $itemsText): void {
    $cfg = config();
    $to = array_unique(array_merge($cfg['admin_emails'], $cfg['mail']['notify'] ?? []));
    [$s, $t] = mail_text('admin_order', ['ref' => $ref, 'email' => $email, 'method' => $method, 'amount' => money_text($amount, $cfg['currency']), 'items' => $itemsText, 'link' => rtrim($cfg['site_url'], '/') . '/admin/sales']);
    foreach ($to as $a) send_mail($a, $s, $t);
}

function mark_paid(array $o): void {
    $db = db();
    $db->beginTransaction();
    try {
        $fresh = one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$o['id']]);
        if (!$fresh || $fresh['status'] !== 'pending') { $db->commit(); return; }
        foreach (json_decode($fresh['items'], true) ?: [] as $it) grant((int)$fresh['user_id'], $it['book_id'], (int)$fresh['id'], (int)$it['price_cents'], $fresh['currency']);
        q("UPDATE orders SET status = 'paid', paid_at = UTC_TIMESTAMP() WHERE id = ?", [$fresh['id']]);
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    $u = one('SELECT * FROM users WHERE id = ?', [$o['user_id']]);
    if ($u) {
        [$s, $t] = mail_text('paid', ['name' => $u['name'], 'ref' => $o['reference'], 'link' => rtrim(config()['site_url'], '/') . '/library']);
        send_mail($u['email'], $s, $t);
    }
}

function stripe_api(string $method, string $path, array $params = []): array {
    $key = config()['stripe']['secret_key'] ?? '';
    $ch = curl_init('https://api.stripe.com' . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
        CURLOPT_USERPWD => $key . ':',
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_POSTFIELDS => $method === 'POST' ? http_build_query($params) : null,
    ]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $j = json_decode((string)$raw, true);
    if ($raw === false || $code >= 400 || !is_array($j)) {
        error_log('[librava] stripe error ' . $code . ' ' . $err . ' ' . substr((string)$raw, 0, 500));
        fail($j['error']['message'] ?? 'Payment provider error.', 502);
    }
    return $j;
}

// Stripe → POST /api/stripe/webhook  (events: checkout.session.completed, checkout.session.async_payment_succeeded)
function stripe_webhook(): never {
    $secret = config()['stripe']['webhook_secret'] ?? '';
    $raw = file_get_contents('php://input');
    if (!$secret || !stripe_signature_ok($raw, $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '', $secret)) { http_response_code(400); exit('bad signature'); }
    $ev = json_decode($raw, true);
    $type = $ev['type'] ?? '';
    if (in_array($type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true)) {
        $s = $ev['data']['object'] ?? [];
        if (($s['payment_status'] ?? '') === 'paid') {
            $o = one('SELECT * FROM orders WHERE id = ? AND stripe_session = ?', [(int)($s['metadata']['order_id'] ?? 0), $s['id'] ?? '']);
            if ($o) mark_paid($o);
        }
    }
    http_response_code(200);
    exit('ok');
}

function stripe_signature_ok(string $payload, string $header, string $secret): bool {
    $t = null; $sigs = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($k === 't') $t = (int)$v; elseif ($k === 'v1') $sigs[] = $v;
    }
    if (!$t || !$sigs || abs(time() - $t) > 300) return false;
    $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
    foreach ($sigs as $s) if (hash_equals($expected, $s)) return true;
    return false;
}

function admin_overview(): array {
    $sum = fn($where) => (int)(one("SELECT COALESCE(SUM(price_cents),0) s FROM purchases WHERE $where")['s']);
    $cnt = fn($sql) => (int)(one($sql)['n']);
    $daily = [];
    foreach (all('SELECT DATE(created_at) d, SUM(price_cents) s, COUNT(*) n FROM purchases WHERE created_at >= (UTC_DATE() - INTERVAL 29 DAY) GROUP BY DATE(created_at)') as $r) $daily[$r['d']] = ['revenue_cents' => (int)$r['s'], 'count' => (int)$r['n']];
    $days = [];
    for ($i = 29; $i >= 0; $i--) { $d = gmdate('Y-m-d', time() - $i * 86400); $days[] = ['date' => $d] + ($daily[$d] ?? ['revenue_cents' => 0, 'count' => 0]); }
    $top = all('SELECT b.*, COUNT(p.id) n, SUM(p.price_cents) s FROM purchases p JOIN books b ON b.id = p.book_id GROUP BY b.id ORDER BY s DESC, n DESC LIMIT 5');
    $recent = all('SELECT p.created_at, p.price_cents, p.currency, u.email, b.title, b.id book_id FROM purchases p JOIN users u ON u.id = p.user_id JOIN books b ON b.id = p.book_id ORDER BY p.created_at DESC LIMIT 8');
    return [
        'revenue' => ['today' => $sum('created_at >= UTC_DATE()'), 'd7' => $sum('created_at >= (UTC_DATE() - INTERVAL 6 DAY)'), 'd30' => $sum('created_at >= (UTC_DATE() - INTERVAL 29 DAY)'), 'all' => $sum('1=1')],
        'counts' => [
            'sold' => $cnt('SELECT COUNT(*) n FROM purchases WHERE price_cents > 0'),
            'free' => $cnt('SELECT COUNT(*) n FROM purchases WHERE price_cents = 0'),
            'pending' => $cnt("SELECT COUNT(*) n FROM orders WHERE status = 'pending'"),
            'customers' => $cnt('SELECT COUNT(*) n FROM users'),
            'new_customers_30' => $cnt('SELECT COUNT(*) n FROM users WHERE created_at >= (UTC_DATE() - INTERVAL 29 DAY)'),
            'books' => $cnt('SELECT COUNT(*) n FROM books WHERE deleted_at IS NULL'),
            'published' => $cnt("SELECT COUNT(*) n FROM books WHERE deleted_at IS NULL AND status = 'published'"),
        ],
        'currency' => config()['currency'],
        'daily' => $days,
        'top' => array_map(fn($r) => ['book' => book_out($r), 'n' => (int)$r['n'], 'sum' => (int)$r['s']], $top),
        'recent' => array_map(fn($r) => ['created_at' => iso($r['created_at']), 'price_cents' => (int)$r['price_cents'], 'currency' => $r['currency'], 'email' => $r['email'], 'title' => $r['title'], 'book_id' => $r['book_id']], $recent),
    ];
}
