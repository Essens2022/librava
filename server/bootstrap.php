<?php
// =====================================================================
//  LIBRAVA — server core: config, database, session, JSON helpers.
//  This folder is blocked from the web by server/.htaccess.
// =====================================================================
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

final class HttpError extends Exception {
    public int $status;
    public function __construct(string $message, int $status = 400) { parent::__construct($message); $this->status = $status; }
}

// ---------- configuration (kept OUTSIDE public_html, never on GitHub) ----------
function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $candidates = array_filter([
        getenv('LIBRAVA_CONFIG') ?: null,
        dirname(__DIR__, 2) . '/librava-config.php',   // next to public_html (recommended)
        dirname(__DIR__) . '/../librava-config.php',
    ]);
    foreach ($candidates as $file) {
        if (is_file($file)) { $cfg = require $file; break; }
    }
    if (!is_array($cfg)) throw new HttpError('Server not configured: librava-config.php is missing.', 503);
    $cfg += ['site_url' => '', 'site_name' => 'Librava', 'currency' => 'EUR', 'admin_emails' => [], 'storage_dir' => null,
             'mail' => [], 'bank' => [], 'stripe' => []];
    $cfg['admin_emails'] = array_map('strtolower', $cfg['admin_emails']);
    return $cfg;
}

function storage_dir(string $sub = ''): string {
    $base = config()['storage_dir'] ?: dirname(__DIR__, 2) . '/librava-files';
    $dir = rtrim($base, '/') . ($sub ? '/' . $sub : '');
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0750, true) && !is_dir($dir)) throw new HttpError('Storage folder cannot be created.', 500);
    }
    return $dir;
}

// ---------- database ----------
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config()['db'] ?? [];
    if (empty($c['name'])) throw new HttpError('Database is not configured.', 503);
    $dsn = 'mysql:host=' . ($c['host'] ?? 'localhost') . ';dbname=' . $c['name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $c['user'] ?? '', $c['pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    migrate($pdo);
    return $pdo;
}

// creates the tables the first time the site runs
function migrate(PDO $pdo): void {
    $flag = storage_dir() . '/.schema-v1';
    if (is_file($flag)) return;
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    foreach (array_filter(array_map('trim', preg_split('/;\s*\n/', $sql))) as $stmt) {
        if (stripos($stmt, 'CREATE') !== false) $pdo->exec(preg_replace('/^--.*$/m', '', $stmt));
    }
    @file_put_contents($flag, date('c'));
}

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}
function one(string $sql, array $args = []): ?array { $r = q($sql, $args)->fetch(); return $r === false ? null : $r; }
function all(string $sql, array $args = []): array { return q($sql, $args)->fetchAll(); }

// ---------- request / response ----------
function out($data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $message, int $status = 400): never { throw new HttpError($message, $status); }

function body(): array {
    static $b = null;
    if ($b !== null) return $b;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $b = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($b)) fail('Invalid JSON.');
    } else {
        $b = $_POST;
    }
    return $b;
}
function str_in(string $key, int $max = 1000): string {
    $v = body()[$key] ?? '';
    if (!is_string($v)) $v = (string)$v;
    $v = trim($v);
    if (mb_strlen($v) > $max) $v = mb_substr($v, 0, $max);
    return $v;
}

function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0', 0, 45); }

// every state-changing request must carry this header: browsers never send it cross-site
// without a CORS preflight, which this server never approves → blocks CSRF.
function require_ajax(): void {
    if (($_SERVER['HTTP_X_LIBRAVA'] ?? '') !== '1') fail('Forbidden.', 403);
}

// simple sliding-window rate limit stored in MySQL
function rate_limit(string $bucket, int $max, int $seconds): void {
    $bucket = substr($bucket, 0, 190);
    $n = (int)one('SELECT COUNT(*) n FROM rate_limits WHERE bucket = ? AND created_at > (UTC_TIMESTAMP() - INTERVAL ? SECOND)', [$bucket, $seconds])['n'];
    if ($n >= $max) fail('common.tooMany', 429);
    q('INSERT INTO rate_limits (bucket, created_at) VALUES (?, UTC_TIMESTAMP())', [$bucket]);
    if (random_int(1, 50) === 1) q('DELETE FROM rate_limits WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
}

// ---------- session ----------
function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('librava_sid');
    session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 30));
    session_start();
}

function current_user(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    start_session();
    $id = $_SESSION['uid'] ?? null;
    $u = $id ? one('SELECT id, email, name, created_at, updated_at FROM users WHERE id = ?', [$id]) : null;
    // a password change on another device ends this session
    if ($u && isset($_SESSION['pw']) && $_SESSION['pw'] !== pw_stamp((int)$u['id'])) { logout(); $u = null; }
    return $u;
}
function pw_stamp(int $uid): string {
    $r = one('SELECT pass_hash FROM users WHERE id = ?', [$uid]);
    return $r ? substr(hash('sha256', $r['pass_hash']), 0, 16) : '';
}
function login_user(array $user): void {
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$user['id'];
    $_SESSION['pw'] = pw_stamp((int)$user['id']);
}
function logout(): void {
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
    }
    session_destroy();
}
function is_admin(?array $u): bool { return $u && in_array(strtolower($u['email']), config()['admin_emails'], true); }
function need_user(): array { $u = current_user(); if (!$u) fail('lib.loginNeeded', 401); return $u; }
function need_admin(): array { $u = need_user(); if (!is_admin($u)) fail('admin.notAdmin', 403); return $u; }

function public_user(array $u): array {
    return ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'isAdmin' => is_admin($u), 'createdAt' => iso($u['created_at'])];
}
function iso(?string $mysql): ?string { return $mysql ? str_replace(' ', 'T', $mysql) . 'Z' : null; }

function uuid4(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
