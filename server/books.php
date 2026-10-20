<?php
// Books: output format, ownership, files (upload + private serving), ratings.
declare(strict_types=1);

const CATEGORIES = ['fiction', 'mystery', 'romance', 'scifi', 'kids', 'teen', 'selfhelp', 'health', 'business', 'cooking', 'education', 'hobby', 'biography', 'history', 'religion', 'parenting', 'science', 'computers', 'arts', 'comics', 'humor', 'travel', 'sports', 'languages', 'reference', 'politics', 'engineering', 'medical', 'law', 'lgbtq'];
const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ro', 'cs', 'sk', 'hu', 'bg', 'hr', 'sl', 'el', 'da', 'sv', 'no', 'fi', 'et', 'lv', 'lt', 'uk'];

function book_out(array $b): array {
    $v = strtotime($b['updated_at'] ?? 'now');
    return [
        'id' => $b['id'], 'title' => $b['title'], 'subtitle' => $b['subtitle'], 'author' => $b['author'],
        'description' => $b['description'] ?? '', 'category' => $b['category'], 'language' => $b['language'],
        'format' => $b['format'], 'pages' => $b['pages'] !== null ? (int)$b['pages'] : null,
        'price_cents' => (int)$b['price_cents'], 'list_price_cents' => $b['list_price_cents'] !== null ? (int)$b['list_price_cents'] : null,
        'cover_url' => $b['cover_file'] ? '/api/covers/' . $b['id'] . '?v=' . $v : '',
        'sample_path' => $b['sample_file'] ? '/api/samples/' . $b['id'] . '?v=' . $v : null,
        'sample_kind' => $b['sample_kind'], 'file_name' => $b['book_name'],
        'keywords' => json_decode($b['keywords'] ?: '[]', true) ?: [],
        'published_at' => $b['published_at'], 'status' => $b['status'], 'is_featured' => (bool)$b['is_featured'],
        'rating_avg' => (float)$b['rating_avg'], 'rating_count' => (int)$b['rating_count'], 'sales_count' => (int)$b['sales_count'],
        'updated_at' => iso($b['updated_at'] ?? null), 'deleted_at' => $b['deleted_at'] ?? null,
    ];
}

function owns(int $uid, string $bookId): bool {
    return (bool)one('SELECT 1 FROM purchases WHERE user_id = ? AND book_id = ?', [$uid, $bookId]);
}

function grant(int $uid, string $bookId, ?int $orderId, int $price, string $currency = ''): void {
    $st = q('INSERT IGNORE INTO purchases (user_id, book_id, order_id, price_cents, currency) VALUES (?, ?, ?, ?, ?)',
            [$uid, $bookId, $orderId, $price, $currency ?: config()['currency']]);
    if ($st->rowCount() > 0) q('UPDATE books SET sales_count = sales_count + 1 WHERE id = ?', [$bookId]);
}

function recount_rating(string $bookId): void {
    q('UPDATE books b SET rating_count = (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id),
                         rating_avg = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.book_id = b.id), 0) WHERE b.id = ?', [$bookId]);
}
function recount_all_ratings(): void {
    foreach (all('SELECT id FROM books') as $b) recount_rating($b['id']);
}

// ---------- private files ----------
function serve_asset(string $bookId, string $kind): never {
    $b = one('SELECT * FROM books WHERE id = ?', [$bookId]);
    $col = ['cover' => 'cover_file', 'sample' => 'sample_file', 'book' => 'book_file'][$kind];
    if (!$b || !$b[$col]) fail('Not found.', 404);
    if ($kind !== 'book' && ($b['deleted_at'] || $b['status'] !== 'published')) {
        $u = current_user();
        if (!is_admin($u) && !($u && owns((int)$u['id'], $bookId))) fail('Not found.', 404);
    }
    $file = storage_dir($kind === 'book' ? 'books' : $kind . 's') . '/' . basename($b[$col]);
    if (!is_file($file)) fail('Not found.', 404);
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $types = ['pdf' => 'application/pdf', 'epub' => 'application/epub+zip', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    if ($kind === 'book') {
        header('Cache-Control: private, no-store');
        header('Content-Disposition: inline');
    } else {
        header('Cache-Control: public, max-age=31536000, immutable');
    }
    readfile($file);
    exit;
}

function check_upload(string $field, array $exts, int $maxMb): ?array {
    if (empty($_FILES[$field]) || ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES[$field];
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('File too large for the server (check upload_max_filesize in hPanel).', 413);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) fail('Upload failed.');
    if ($f['size'] > $maxMb * 1048576) fail("File larger than {$maxMb} MB.", 413);
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if ($ext === 'jpeg') $ext = 'jpg';
    if (!in_array($ext, $exts, true)) fail('admin.badFile');
    $head = file_get_contents($f['tmp_name'], false, null, 0, 16);
    $ok = match ($ext) {
        'pdf' => str_starts_with($head, '%PDF'),
        'epub' => str_starts_with($head, "PK\x03\x04"),
        'jpg', 'png', 'webp' => (bool)@getimagesize($f['tmp_name']),
        default => false,
    };
    if (!$ok) fail('admin.badFile');
    return ['tmp' => $f['tmp_name'], 'ext' => $ext, 'name' => mb_substr(basename($f['name']), 0, 200)];
}

function store_upload(array $up, string $sub, string $bookId, string $prefix): string {
    $name = $bookId . '-' . $prefix . '-' . bin2hex(random_bytes(6)) . '.' . $up['ext'];
    $dest = storage_dir($sub) . '/' . $name;
    if (!move_uploaded_file($up['tmp'], $dest)) fail('Could not save the file.', 500);
    @chmod($dest, 0640);
    return $name;
}

function remove_old(?string $name, string $sub): void {
    if ($name) @unlink(storage_dir($sub) . '/' . basename($name));
}

function save_book(): string {
    $d = json_decode((string)($_POST['data'] ?? '{}'), true);
    if (!is_array($d)) fail('Invalid data.');
    $s = fn($k, $max = 255) => isset($d[$k]) && $d[$k] !== null ? mb_substr(trim((string)$d[$k]), 0, $max) : null;
    $title = $s('title'); $author = $s('author', 190);
    if (!$title || !$author) fail('admin.required');
    $id = $s('id', 36);
    $existing = $id ? one('SELECT * FROM books WHERE id = ?', [$id]) : null;
    if ($id && !$existing) fail('book.notFound', 404);
    if (!$id) $id = uuid4();

    $cover = check_upload('cover', ['jpg', 'png', 'webp'], 15);
    $file = check_upload('file', ['pdf', 'epub'], 500);
    $sample = check_upload('sample', ['pdf', 'epub'], 100);
    if (!$existing && !$file) fail('admin.needFile');

    $row = [
        'title' => $title, 'subtitle' => $s('subtitle'), 'author' => $author,
        'description' => $s('description', 8000) ?? '',
        'category' => in_array($d['category'] ?? '', CATEGORIES, true) ? $d['category'] : 'fiction',
        'language' => in_array($d['language'] ?? '', LANGUAGES, true) ? $d['language'] : 'en',
        'pages' => isset($d['pages']) && (int)$d['pages'] > 0 ? (int)$d['pages'] : null,
        'price_cents' => max(0, (int)($d['price_cents'] ?? 0)),
        'list_price_cents' => isset($d['list_price_cents']) && (int)$d['list_price_cents'] > 0 ? (int)$d['list_price_cents'] : null,
        'keywords' => json_encode(array_slice(array_values(array_filter(array_map(fn($k) => mb_substr(trim((string)$k), 0, 60), (array)($d['keywords'] ?? [])))), 0, 30), JSON_UNESCAPED_UNICODE),
        'published_at' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['published_at'] ?? '')) ? $d['published_at'] : date('Y-m-d'),
        'status' => ($d['status'] ?? '') === 'published' ? 'published' : 'draft',
        'is_featured' => !empty($d['is_featured']) ? 1 : 0,
    ];
    if ($cover) { $row['cover_file'] = store_upload($cover, 'covers', $id, 'cover'); if ($existing) remove_old($existing['cover_file'], 'covers'); }
    if ($file) {
        $row['book_file'] = store_upload($file, 'books', $id, 'book');
        $row['book_name'] = $file['name'];
        $row['format'] = $file['ext'];
        if ($existing) remove_old($existing['book_file'], 'books');
    }
    if ($sample) { $row['sample_file'] = store_upload($sample, 'samples', $id, 'sample'); $row['sample_kind'] = $sample['ext']; if ($existing) remove_old($existing['sample_file'], 'samples'); }

    if ($existing) {
        $sets = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($row)));
        q("UPDATE books SET $sets, updated_at = UTC_TIMESTAMP() WHERE id = ?", [...array_values($row), $id]);
    } else {
        $row['id'] = $id;
        $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($row)));
        $qs = implode(', ', array_fill(0, count($row), '?'));
        q("INSERT INTO books ($cols) VALUES ($qs)", array_values($row));
    }
    return $id;
}
