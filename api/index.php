<?php
// =====================================================================
//  LIBRAVA — JSON API (all requests to /api/... arrive here)
// =====================================================================
declare(strict_types=1);
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/mail.php';
require __DIR__ . '/../server/emails.php';
require __DIR__ . '/../server/books.php';
require __DIR__ . '/../server/payments.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$method = $_SERVER['REQUEST_METHOD'];
$path = '/' . trim(preg_replace('#^.*?/api#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');

try {
    if ($method !== 'GET' && $path !== '/stripe/webhook') require_ajax();
    route($method, $path);
    fail('Not found.', 404);
} catch (HttpError $e) {
    out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[librava] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    out(['error' => 'Server error.'], 500);
}

function route(string $m, string $p): void {
    $id = '([0-9a-fA-F-]{36}|[a-z0-9-]{1,40})';
    // ---------------- system ----------------
    if ($m === 'GET' && $p === '/health') {
        db();
        $c = config();
        out(['ok' => true, 'payments' => ['bank' => !empty($c['bank']['iban']), 'card' => !empty($c['stripe']['secret_key'])]]);
    }

    // ---------------- auth ----------------
    if ($m === 'GET' && $p === '/auth/me') {
        $u = current_user();
        out(['user' => $u ? public_user($u) : null]);
    }
    if ($m === 'POST' && $p === '/auth/register') {
        rate_limit('register:' . client_ip(), 10, 3600);
        $email = strtolower(str_in('email', 190));
        $pass = (string)(body()['password'] ?? '');
        $name = str_in('name', 120);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('acc.err.emailInvalid');
        if (strlen($pass) < 6 || strlen($pass) > 200) fail('acc.err.short');
        if (one('SELECT id FROM users WHERE email = ?', [$email])) fail('acc.err.exists', 409);
        q('INSERT INTO users (email, pass_hash, name) VALUES (?, ?, ?)', [$email, password_hash($pass, PASSWORD_DEFAULT), $name ?: explode('@', $email)[0]]);
        $u = one('SELECT * FROM users WHERE id = ?', [(int)db()->lastInsertId()]);
        login_user($u);
        out(['user' => public_user($u)]);
    }
    if ($m === 'POST' && $p === '/auth/login') {
        $email = strtolower(str_in('email', 190));
        $pass = (string)(body()['password'] ?? '');
        rate_limit('login-ip:' . client_ip(), 30, 900);
        rate_limit('login:' . $email, 8, 900);
        $u = one('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$u || !password_verify($pass, $u['pass_hash'])) fail('acc.err.invalid', 401);
        if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) q('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        login_user($u);
        out(['user' => public_user($u)]);
    }
    if ($m === 'POST' && $p === '/auth/logout') { logout(); out(['ok' => true]); }
    if ($m === 'POST' && $p === '/auth/password') {
        $u = need_user();
        rate_limit('pw:' . $u['id'], 10, 900);
        $row = one('SELECT pass_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify((string)(body()['current'] ?? ''), $row['pass_hash'])) fail('acc.err.currentWrong', 403);
        $next = (string)(body()['next'] ?? '');
        if (strlen($next) < 6 || strlen($next) > 200) fail('acc.err.short');
        q('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($next, PASSWORD_DEFAULT), $u['id']]);
        login_user($u); // new session id, other devices are signed out
        out(['ok' => true]);
    }
    if ($m === 'POST' && $p === '/auth/forgot') {
        rate_limit('forgot:' . client_ip(), 5, 3600);
        $email = strtolower(str_in('email', 190));
        $u = filter_var($email, FILTER_VALIDATE_EMAIL) ? one('SELECT * FROM users WHERE email = ?', [$email]) : null;
        if ($u) {
            $token = bin2hex(random_bytes(32));
            q('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL 1 HOUR)', [$u['id'], hash('sha256', $token)]);
            $link = rtrim(config()['site_url'], '/') . '/account?mode=reset&token=' . $token;
            [$s, $t] = mail_text('reset', ['name' => $u['name'], 'link' => $link]);
            send_mail($u['email'], $s, $t);
        }
        out(['ok' => true]); // same answer whether the address exists or not
    }
    if ($m === 'POST' && $p === '/auth/reset') {
        rate_limit('reset:' . client_ip(), 10, 3600);
        $token = str_in('token', 100);
        $next = (string)(body()['password'] ?? '');
        if (strlen($next) < 6 || strlen($next) > 200) fail('acc.err.short');
        $r = one('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [hash('sha256', $token)]);
        if (!$r) fail('acc.resetInvalid', 400);
        q('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($next, PASSWORD_DEFAULT), $r['user_id']]);
        q('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [$r['user_id']]);
        $u = one('SELECT * FROM users WHERE id = ?', [$r['user_id']]);
        login_user($u);
        out(['user' => public_user($u)]);
    }
    if ($m === 'POST' && $p === '/auth/delete') {
        $u = need_user();
        rate_limit('del:' . $u['id'], 5, 900);
        $row = one('SELECT pass_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify((string)(body()['password'] ?? ''), $row['pass_hash'])) fail('acc.err.currentWrong', 403);
        if (is_admin($u)) fail('Administrator accounts cannot be deleted from the site.', 400);
        q('DELETE FROM users WHERE id = ?', [$u['id']]); // purchases, progress, reviews, orders cascade
        recount_all_ratings();
        logout();
        out(['ok' => true]);
    }
    if ($m === 'POST' && $p === '/profile') {
        $u = need_user();
        $name = str_in('name', 120);
        if ($name === '') fail('acc.name');
        q('UPDATE users SET name = ? WHERE id = ?', [$name, $u['id']]);
        out(['user' => public_user(one('SELECT * FROM users WHERE id = ?', [$u['id']]))]);
    }

    // ---------------- catalog ----------------
    if ($m === 'GET' && $p === '/books') {
        out(['books' => array_map('book_out', all("SELECT * FROM books WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, created_at DESC"))]);
    }
    if ($m === 'GET' && preg_match("#^/books/$id$#", $p, $mm)) {
        $b = one('SELECT * FROM books WHERE id = ?', [$mm[1]]);
        $u = current_user();
        if (!$b) fail('book.notFound', 404);
        $visible = ($b['status'] === 'published' && !$b['deleted_at']) || is_admin($u) || ($u && owns((int)$u['id'], $b['id']));
        if (!$visible) fail('book.notFound', 404);
        out(['book' => book_out($b)]);
    }
    if ($m === 'GET' && preg_match("#^/covers/$id$#", $p, $mm)) serve_asset($mm[1], 'cover');
    if ($m === 'GET' && preg_match("#^/samples/$id$#", $p, $mm)) serve_asset($mm[1], 'sample');
    if ($m === 'GET' && preg_match("#^/read/$id$#", $p, $mm)) {
        $u = need_user();
        if (!is_admin($u) && !owns((int)$u['id'], $mm[1])) fail('Forbidden.', 403);
        serve_asset($mm[1], 'book');
    }

    // ---------------- reviews ----------------
    if ($m === 'GET' && preg_match("#^/reviews/$id$#", $p, $mm)) {
        $rows = all('SELECT id, book_id, user_id, rating, body, author_name, created_at FROM reviews WHERE book_id = ? ORDER BY created_at DESC', [$mm[1]]);
        out(['reviews' => array_map(fn($r) => ['id' => (int)$r['id'], 'book_id' => $r['book_id'], 'user_id' => (int)$r['user_id'], 'rating' => (int)$r['rating'], 'body' => $r['body'], 'author_name' => $r['author_name'], 'created_at' => iso($r['created_at']), 'verified' => true], $rows)]);
    }
    if ($m === 'POST' && preg_match("#^/reviews/$id$#", $p, $mm)) {
        $u = need_user();
        if (!owns((int)$u['id'], $mm[1])) fail('rev.onlyOwners', 403);
        $rating = (int)(body()['rating'] ?? 0);
        if ($rating < 1 || $rating > 5) fail('rev.pickRating');
        q('INSERT INTO reviews (book_id, user_id, rating, body, author_name) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), body = VALUES(body), author_name = VALUES(author_name), created_at = UTC_TIMESTAMP()',
          [$mm[1], $u['id'], $rating, str_in('body', 2000), $u['name']]);
        recount_rating($mm[1]);
        out(['ok' => true]);
    }

    // ---------------- library & reading ----------------
    if ($m === 'GET' && $p === '/library') {
        $u = need_user();
        $rows = all('SELECT p.created_at AS bought_at, p.price_cents AS paid_cents, p.currency AS paid_currency, p.id AS purchase_id, b.*,
                            g.location AS g_location, g.page AS g_page, g.percent AS g_percent, g.bookmarks AS g_bookmarks, g.updated_at AS g_updated
                     FROM purchases p JOIN books b ON b.id = p.book_id
                     LEFT JOIN progress g ON g.user_id = p.user_id AND g.book_id = p.book_id
                     WHERE p.user_id = ? ORDER BY p.created_at DESC', [$u['id']]);
        out(['items' => array_map(fn($r) => [
            'purchase' => ['id' => (int)$r['purchase_id'], 'book_id' => $r['id'], 'created_at' => iso($r['bought_at']), 'price_cents' => (int)$r['paid_cents'], 'currency' => $r['paid_currency']],
            'book' => book_out($r),
            'progress' => $r['g_updated'] ? ['location' => $r['g_location'], 'page' => $r['g_page'] !== null ? (int)$r['g_page'] : null, 'percent' => (float)$r['g_percent'], 'bookmarks' => json_decode($r['g_bookmarks'] ?: '[]', true), 'updated_at' => iso($r['g_updated'])] : null,
        ], $rows)]);
    }
    if ($m === 'GET' && preg_match("#^/progress/$id$#", $p, $mm)) {
        $u = need_user();
        $r = one('SELECT * FROM progress WHERE user_id = ? AND book_id = ?', [$u['id'], $mm[1]]);
        out(['progress' => $r ? ['location' => $r['location'], 'page' => $r['page'] !== null ? (int)$r['page'] : null, 'percent' => (float)$r['percent'], 'bookmarks' => json_decode($r['bookmarks'] ?: '[]', true), 'updated_at' => iso($r['updated_at'])] : null]);
    }
    if ($m === 'POST' && preg_match("#^/progress/$id$#", $p, $mm)) {
        $u = need_user();
        if (!owns((int)$u['id'], $mm[1])) fail('Forbidden.', 403);
        $b = body();
        $bm = isset($b['bookmarks']) && is_array($b['bookmarks']) ? json_encode(array_slice($b['bookmarks'], 0, 500), JSON_UNESCAPED_UNICODE) : null;
        q('INSERT INTO progress (user_id, book_id, location, page, percent, bookmarks) VALUES (?, ?, ?, ?, ?, COALESCE(?, \'[]\'))
           ON DUPLICATE KEY UPDATE location = COALESCE(VALUES(location), location), page = COALESCE(VALUES(page), page), percent = VALUES(percent), bookmarks = COALESCE(?, bookmarks), updated_at = UTC_TIMESTAMP()',
          [$u['id'], $mm[1], isset($b['location']) ? substr((string)$b['location'], 0, 2000) : null, isset($b['page']) ? (int)$b['page'] : null, max(0, min(1, (float)($b['percent'] ?? 0))), $bm, $bm]);
        out(['ok' => true]);
    }

    // ---------------- shopping ----------------
    if ($m === 'POST' && preg_match("#^/claim/$id$#", $p, $mm)) {
        $u = need_user();
        $b = one("SELECT * FROM books WHERE id = ? AND status = 'published' AND deleted_at IS NULL", [$mm[1]]);
        if (!$b || (int)$b['price_cents'] !== 0) fail('Not free.');
        grant((int)$u['id'], $b['id'], null, 0);
        out(['ok' => true]);
    }
    if ($m === 'POST' && $p === '/checkout') checkout(need_user());
    if ($m === 'GET' && $p === '/orders') {
        $u = need_user();
        out(['orders' => array_map('order_out', all("SELECT * FROM orders WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC", [$u['id']]))]);
    }
    if ($m === 'POST' && $p === '/stripe/webhook') stripe_webhook();

    // ---------------- admin ----------------
    if ($m === 'GET' && $p === '/admin/books') {
        need_admin();
        $rev = [];
        foreach (all('SELECT book_id, SUM(price_cents) s FROM purchases GROUP BY book_id') as $r) $rev[$r['book_id']] = (int)$r['s'];
        out(['books' => array_map(fn($b) => book_out($b) + ['revenue_cents' => $rev[$b['id']] ?? 0], all('SELECT * FROM books WHERE deleted_at IS NULL ORDER BY created_at DESC'))]);
    }
    if ($m === 'POST' && preg_match("#^/admin/books/$id/status$#", $p, $mm)) {
        need_admin();
        q('UPDATE books SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL', [(body()['status'] ?? '') === 'published' ? 'published' : 'draft', $mm[1]]);
        out(['ok' => true]);
    }
    if ($m === 'GET' && $p === '/admin/overview') { need_admin(); out(admin_overview()); }
    if ($m === 'GET' && $p === '/admin/customers') {
        need_admin();
        $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim((string)($_GET['q'] ?? ''))) . '%';
        $rows = all('SELECT u.id, u.email, u.name, u.created_at, COUNT(p.id) books, COALESCE(SUM(p.price_cents),0) spent, MAX(p.created_at) last_at
                     FROM users u LEFT JOIN purchases p ON p.user_id = u.id
                     WHERE u.email LIKE ? OR u.name LIKE ? GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500', [$term, $term]);
        out(['customers' => array_map(fn($r) => ['id' => (int)$r['id'], 'email' => $r['email'], 'name' => $r['name'], 'created_at' => iso($r['created_at']), 'books' => (int)$r['books'], 'spent_cents' => (int)$r['spent'], 'last_at' => iso($r['last_at']), 'isAdmin' => is_admin($r)], $rows)]);
    }
    if ($m === 'GET' && preg_match('#^/admin/customers/(\d+)$#', $p, $mm)) {
        need_admin();
        $u = one('SELECT id, email, name, created_at FROM users WHERE id = ?', [(int)$mm[1]]);
        if (!$u) fail('Not found.', 404);
        $buys = all('SELECT b.*, p.created_at AS bought_at, p.price_cents AS paid_cents, p.currency AS paid_currency, p.order_id FROM purchases p JOIN books b ON b.id = p.book_id WHERE p.user_id = ? ORDER BY p.created_at DESC', [$u['id']]);
        $orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [$u['id']]);
        out(['customer' => ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'created_at' => iso($u['created_at']), 'isAdmin' => is_admin($u)],
             'purchases' => array_map(fn($r) => ['created_at' => iso($r['bought_at']), 'price_cents' => (int)$r['paid_cents'], 'currency' => $r['paid_currency'], 'gift' => $r['order_id'] === null && (int)$r['paid_cents'] === 0 && (int)$r['price_cents'] > 0, 'book' => book_out($r)], $buys),
             'orders' => array_map('order_out', $orders)]);
    }
    if ($m === 'POST' && preg_match('#^/admin/customers/(\d+)/(grant|revoke)$#', $p, $mm)) {
        need_admin();
        $bookId = str_in('book_id', 40);
        if (!one('SELECT id FROM users WHERE id = ?', [(int)$mm[1]]) || !one('SELECT id FROM books WHERE id = ?', [$bookId])) fail('Not found.', 404);
        if ($mm[2] === 'grant') grant((int)$mm[1], $bookId, null, 0);
        else {
            $st = q('DELETE FROM purchases WHERE user_id = ? AND book_id = ?', [(int)$mm[1], $bookId]);
            if ($st->rowCount()) q('UPDATE books SET sales_count = GREATEST(sales_count - 1, 0) WHERE id = ?', [$bookId]);
        }
        out(['ok' => true]);
    }
    if ($m === 'GET' && $p === '/admin/reviews') {
        need_admin();
        $rows = all('SELECT r.*, u.email, b.title FROM reviews r JOIN users u ON u.id = r.user_id JOIN books b ON b.id = r.book_id ORDER BY r.created_at DESC LIMIT 1000');
        out(['reviews' => array_map(fn($r) => ['id' => (int)$r['id'], 'book_id' => $r['book_id'], 'book_title' => $r['title'], 'user_id' => (int)$r['user_id'], 'email' => $r['email'], 'author_name' => $r['author_name'], 'rating' => (int)$r['rating'], 'body' => $r['body'], 'created_at' => iso($r['created_at'])], $rows)]);
    }
    if ($m === 'POST' && preg_match('#^/admin/reviews/(\d+)/delete$#', $p, $mm)) {
        need_admin();
        $r = one('SELECT book_id FROM reviews WHERE id = ?', [(int)$mm[1]]);
        if ($r) { q('DELETE FROM reviews WHERE id = ?', [(int)$mm[1]]); recount_rating($r['book_id']); }
        out(['ok' => true]);
    }
    if ($m === 'GET' && $p === '/admin/export/sales.csv') {
        need_admin();
        $rows = all('SELECT p.created_at, u.email, u.name, b.title, b.author, p.price_cents, p.currency, o.reference, o.method
                     FROM purchases p JOIN users u ON u.id = p.user_id JOIN books b ON b.id = p.book_id LEFT JOIN orders o ON o.id = p.order_id ORDER BY p.created_at DESC');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="librava-vanzari-' . date('Y-m-d') . '.csv"');
        header('Cache-Control: no-store');
        $f = fopen('php://output', 'w');
        fwrite($f, "\xEF\xBB\xBF");
        fputcsv($f, ['date', 'customer_email', 'customer_name', 'book', 'author', 'amount', 'currency', 'order', 'method'], ';');
        foreach ($rows as $r) fputcsv($f, [$r['created_at'], $r['email'], $r['name'], $r['title'], $r['author'], number_format($r['price_cents'] / 100, 2, ',', ''), $r['currency'], $r['reference'] ?? '', $r['method'] ?? ($r['price_cents'] ? '' : 'free/gift')], ';');
        fclose($f);
        exit;
    }
    if ($m === 'POST' && $p === '/admin/books') { need_admin(); out(['id' => save_book()]); }
    if ($m === 'POST' && preg_match("#^/admin/books/$id/delete$#", $p, $mm)) {
        need_admin();
        q("UPDATE books SET status = 'draft', deleted_at = UTC_TIMESTAMP() WHERE id = ?", [$mm[1]]);
        out(['ok' => true]);
    }
    if ($m === 'GET' && $p === '/admin/sales') {
        need_admin();
        $rows = all('SELECT p.id, p.user_id, p.book_id, p.price_cents, p.currency, p.created_at, u.email AS customer_email, b.title, b.author, b.cover_file, b.updated_at AS b_updated
                     FROM purchases p JOIN users u ON u.id = p.user_id JOIN books b ON b.id = p.book_id ORDER BY p.created_at DESC LIMIT 2000');
        out(['sales' => array_map(fn($r) => ['id' => (int)$r['id'], 'user_id' => (int)$r['user_id'], 'book_id' => $r['book_id'], 'price_cents' => (int)$r['price_cents'], 'currency' => $r['currency'], 'created_at' => iso($r['created_at']), 'customer_email' => $r['customer_email'],
            'book' => ['id' => $r['book_id'], 'title' => $r['title'], 'author' => $r['author'], 'cover_url' => $r['cover_file'] ? '/api/covers/' . $r['book_id'] . '?v=' . strtotime($r['b_updated']) : ''] ], $rows)]);
    }
    if ($m === 'GET' && $p === '/admin/orders') {
        need_admin();
        $st = (string)($_GET['status'] ?? 'pending');
        $rows = in_array($st, ['pending', 'paid', 'cancelled'], true)
            ? all('SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = ? ORDER BY o.created_at DESC LIMIT 1000', [$st])
            : all('SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 1000');
        out(['orders' => array_map(fn($o) => order_out($o) + ['email' => $o['email']], $rows)]);
    }
    if ($m === 'POST' && preg_match('#^/admin/orders/(\d+)/(paid|cancel)$#', $p, $mm)) {
        need_admin();
        $o = one('SELECT * FROM orders WHERE id = ?', [(int)$mm[1]]);
        if (!$o || $o['status'] !== 'pending') fail('Order not pending.', 409);
        if ($mm[2] === 'paid') mark_paid($o); else q("UPDATE orders SET status = 'cancelled' WHERE id = ?", [$o['id']]);
        out(['ok' => true]);
    }
}
