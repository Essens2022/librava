<?php
// Minimal SMTP client (SSL on 465 or STARTTLS on 587) — sends through the mailbox from the config.
declare(strict_types=1);

function send_mail(string $to, string $subject, string $text, string $html = ''): bool {
    $m = config()['mail'] ?? [];
    if (empty($m['smtp_host']) || empty($m['smtp_user']) || empty($m['smtp_pass'])) {
        error_log('[librava] mail not configured, skipped: ' . $subject);
        return false;
    }
    try {
        $port = (int)($m['smtp_port'] ?? 465);
        $secure = $m['smtp_secure'] ?? ($port === 465 ? 'ssl' : ($port === 587 ? 'tls' : 'none'));
        $host = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $m['smtp_host'] . ':' . $port;
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $fp = @stream_socket_client($host, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new RuntimeException("connect: $errstr");
        stream_set_timeout($fp, 15);
        $read = function () use ($fp) { $data = ''; while (($line = fgets($fp, 515)) !== false) { $data .= $line; if (isset($line[3]) && $line[3] === ' ') break; } return $data; };
        $cmd = function (string $c, array $ok) use ($fp, $read) { fwrite($fp, $c . "\r\n"); $r = $read(); if (!in_array((int)substr($r, 0, 3), $ok, true)) throw new RuntimeException(trim($r)); return $r; };
        $read();
        $ehloHost = parse_url(config()['site_url'] ?: 'http://localhost', PHP_URL_HOST) ?: 'localhost';
        $cmd("EHLO $ehloHost", [250]);
        if ($secure === 'tls') { $cmd('STARTTLS', [220]); stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT); $cmd("EHLO $ehloHost", [250]); }
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($m['smtp_user']), [334]);
        $cmd(base64_encode($m['smtp_pass']), [235]);
        $from = $m['from'] ?? $m['smtp_user'];
        $cmd("MAIL FROM:<$from>", [250]);
        $cmd("RCPT TO:<$to>", [250, 251]);
        $cmd('DATA', [354]);
        $boundary = 'lb' . bin2hex(random_bytes(8));
        $enc = fn($s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
        $headers = [
            'From: ' . $enc($m['from_name'] ?? 'Librava') . " <$from>",
            "To: <$to>",
            'Subject: ' . $enc($subject),
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $ehloHost . '>',
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"$boundary\"",
        ];
        $html = $html ?: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c2b2d">' . nl2br(htmlspecialchars($text)) . '</div>';
        $msg = implode("\r\n", $headers) . "\r\n\r\n"
            . "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
            . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
            . "--$boundary--";
        $msg = preg_replace('/^\./m', '..', $msg);
        $cmd($msg . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    } catch (Throwable $e) {
        error_log('[librava] mail failed: ' . $e->getMessage());
        return false;
    }
}
