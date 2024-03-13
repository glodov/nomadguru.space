<?php
require_once 'config.php';

function reCaptcha($secretKey, $responseKey) {
    $url = 'https://www.google.com/recaptcha/api/siteverify';
    $userIP = $_SERVER['REMOTE_ADDR'];
    $verifyResponse = file_get_contents("{$url}?secret={$secretKey}&response={$responseKey}&remoteip={$userIP}");
    $responseData = json_decode($verifyResponse);
    return !! $responseData->success;
}

function l($what, $from, $defaultValue = null) {
    if (is_array($what)) {
        $newFrom = isset($from[$what[0]]) ? $from[$what[0]] : $what[0];
        if (!is_string($newFrom)) {
            error_log('Impossible to translate ' . print_r($what, true));
            return 'Impossible to translate []';
        }
        $replacements = [];
        foreach (array_slice($what, 1) as $i => $repl) {
            if (is_array($repl)) {
                foreach ($repl as $key => $value) {
                    $replacements[] = ["{" . $key . "}", $value];
                }
            } else {
                $replacements[] = ["\$" . ($i + 1), $repl];
            }
        }
        foreach ($replacements as list($fromText, $toText)) {
            $newFrom = str_replace($fromText, $toText, $newFrom);
        }
        return $newFrom;
    }
    if (!isset($from[$what])) {
        return $defaultValue === null ? $what : $defaultValue;
    }
    return $from[$what];
}

function array2html($array) {
    $html = '<ul>';
    foreach ($array as $value) {
        $html .= '<li>';
        if (is_array($value)) {
            $html .= array2html($value);
        } else {
            $html .= nl2br(htmlspecialchars($value));
        }
        $html .= '</li>';
    }
    $html .= '</ul>';
    return $html;
}

function sendForm($opts, $data, $l = []) {
    $apiKey = defined('BREVO_API_KEY') ? BREVO_API_KEY : '';
    $url = 'https://api.brevo.com/v3/smtp/email';

    // Construct the email content based on $data
    $html = '<html><head></head><body style="font-family: Ubuntu, Arial, sans-serif; font-size: 16px;">';
    if (isset($opts['image'])) {
        $html .= '<img src="' . htmlspecialchars($opts['image']) . '">';
    }
    foreach ($data as $key => $value) {
        if (substr($key, 0, 1) === '$') continue;
        $label = l('email.php.' . $key, $l, $key);
        $html .= '<p style="margin: 1rem 0">';
        $html .= '<b style="color: #1471D1;">' . htmlspecialchars($label) . ':</b><br>';
        if (is_array($value)) {
            $html .= array2html($value);
        } else {
            $html .= nl2br(htmlspecialchars($value));
        }
        $html .= '</p>';
    }
    $html .= "</body></html>";

    // Setup the payload
    $payload = [
        "sender" => $opts['sender'],
        "to" => $opts['to'],
        "subject" => $opts['subject'],
        "htmlContent" => $html
    ];

    // Initialize cURL
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'accept: application/json',
        'api-key: ' . $apiKey,
        'content-type: application/json'
    ]);

    // Execute the request
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    return ! $err;
}


$isFormValid = true;
if (defined('CAPTCHA_KEY') && CAPTCHA_KEY) {
    $isFormValid = reCaptcha(CAPTCHA_KEY, $_POST['g-recaptcha-response'] ?? null);
}

if (!$isFormValid) {
    http_response_code(401);
    return;
}
if (!defined('RECIPIENTS')) {
    http_response_code(500);
    echo l('Recipients not defined', $l);
    return;
}
if (!isset($_POST['$uri'])) {
    http_response_code(400);
    echo l('Recipients not defined', $l);
    return;
}

$words = explode('/', trim($_POST['$uri'], '/'));
$file = __DIR__ . '/translation.' . $words[0] . '.json';
if (!file_exists($file)) {
    http_response_code(500);
    echo 'Unable to load language file for ' . $_POST['$uri'];
    return;
}
if (empty($_POST['agreement'])) {
    http_response_code(400);
    echo 'Accept the agreement on managing your provided data';
    return;
}
$l = json_decode(file_get_contents($file), true);
$ok = sendForm(RECIPIENTS[$_POST['$uri']], $_POST, $l);
if ($ok) {
    http_response_code(200);
    echo l('Your application has been sent', $l);
} else {
    http_response_code(500);
    echo l('Unable to sent your application', $l);
}