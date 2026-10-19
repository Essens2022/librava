<?php
// =====================================================================
//  LIBRAVA — server configuration TEMPLATE (no real secrets here)
//
//  Copy this file to:   librava-config.php
//  and put it ONE FOLDER ABOVE public_html, e.g.
//     /home/uXXXX/domains/librava.store/librava-config.php
//  so it is never reachable from the web and never stored on GitHub.
//  Then fill in your real values there.
// =====================================================================
return [
    // Public address of the shop (no trailing slash)
    'site_url' => 'https://librava.store',
    'site_name' => 'Librava',
    'currency' => 'EUR',

    // MySQL database (hPanel → Databases → MySQL Databases)
    'db' => [
        'host' => 'localhost',
        'name' => '',   // e.g. u123456789_librava
        'user' => '',   // e.g. u123456789_librava
        'pass' => '',
    ],

    // Accounts with these emails are administrators (can upload books, confirm orders)
    'admin_emails' => [
        // 'you@example.com',
    ],

    // Where uploaded books, covers and samples are stored (outside public_html).
    // Leave null to use  ../librava-files  next to public_html.
    'storage_dir' => null,

    // Outgoing email (hPanel → Emails → create noreply@librava.store)
    'mail' => [
        'from' => 'noreply@librava.store',
        'from_name' => 'Librava',
        'smtp_host' => 'smtp.hostinger.com',
        'smtp_port' => 465,              // 465 = SSL
        'smtp_user' => 'noreply@librava.store',
        'smtp_pass' => '',
        'notify' => [],                  // extra addresses that receive "new order" emails
    ],

    // Bank transfer (leave iban empty to switch this payment method off)
    'bank' => [
        'holder' => '',
        'iban' => '',
        'bic' => '',
        'bank' => '',
    ],

    // Stripe card payments (leave secret_key empty to switch card payments off)
    'stripe' => [
        'secret_key' => '',       // sk_live_... or sk_test_...
        'webhook_secret' => '',   // whsec_...
    ],
];
