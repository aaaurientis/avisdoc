<?php
// Endpoint du formulaire de contact AvisDoc — envoie un email via OVH PHP mail().
// Ne JAMAIS retourner d'erreur PHP brute en cas de bug — toujours du JSON.
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');

// Méthodes acceptées
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

// ----- Lecture des données (JSON ou form-encoded) -----
$raw = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

// Honeypot anti-spam : un champ caché dans le HTML que les bots remplissent.
if (!empty($data['_botfield'] ?? '')) {
    echo json_encode(['success' => true]); // on simule un succès silencieux
    exit;
}

// ----- Validation -----
$name         = trim((string)($data['name'] ?? ''));
$email        = trim((string)($data['email'] ?? ''));
$organization = trim((string)($data['organization'] ?? ''));
$phone        = trim((string)($data['phone'] ?? ''));
$profile      = trim((string)($data['profile'] ?? ''));
$profileLabel = trim((string)($data['profileLabel'] ?? $profile));
$message      = trim((string)($data['message'] ?? ''));

$errors = [];
if ($name === '' || mb_strlen($name) > 200)            $errors[] = 'Nom requis';
if (!filter_var($email, FILTER_VALIDATE_EMAIL))        $errors[] = 'Email invalide';
if (mb_strlen($message) < 10 || mb_strlen($message) > 10000) $errors[] = 'Message trop court ou trop long';

if ($errors) {
    http_response_code(400);
    echo json_encode(['error' => implode(' · ', $errors)]);
    exit;
}

// ----- Anti-injection d'en-tête -----
$clean = static fn(string $s): string => str_replace(["\r", "\n", "\0"], '', $s);
$name  = $clean($name);
$email = $clean($email);
$phone = $clean($phone);

// ----- Construction de l'email -----
$to        = 'contact@avisdoc.fr';
$fromEmail = 'no-reply@avisdoc.fr';
$fromName  = 'Site AvisDoc';

$subject = "Contact AvisDoc — {$profileLabel} : {$name}";

$esc = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$messageHtml = nl2br($esc($message));
$dateStr = date('d/m/Y à H\hi');

$body  = '<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color:#16293D; max-width:640px; margin:0 auto; padding:24px;">';
$body .= '<h2 style="color:#1F8FB8; margin:0 0 16px;">Nouveau message de contact</h2>';
$body .= '<table style="border-collapse:collapse; width:100%;"><tbody>';
$body .= '<tr><td style="padding:4px 12px 4px 0; color:#5B6B7C;">Profil</td><td><strong>' . $esc($profileLabel) . '</strong></td></tr>';
$body .= '<tr><td style="padding:4px 12px 4px 0; color:#5B6B7C;">Nom</td><td><strong>' . $esc($name) . '</strong></td></tr>';
if ($organization !== '') {
    $body .= '<tr><td style="padding:4px 12px 4px 0; color:#5B6B7C;">Structure</td><td>' . $esc($organization) . '</td></tr>';
}
$body .= '<tr><td style="padding:4px 12px 4px 0; color:#5B6B7C;">Email</td><td><a href="mailto:' . $esc($email) . '">' . $esc($email) . '</a></td></tr>';
if ($phone !== '') {
    $body .= '<tr><td style="padding:4px 12px 4px 0; color:#5B6B7C;">Téléphone</td><td>' . $esc($phone) . '</td></tr>';
}
$body .= '</tbody></table>';
$body .= '<hr style="border:0;border-top:1px solid #E4EBF0;margin:20px 0;">';
$body .= '<div style="white-space:pre-wrap; line-height:1.55;">' . $messageHtml . '</div>';
$body .= '<hr style="border:0;border-top:1px solid #E4EBF0;margin:20px 0;">';
$body .= '<p style="font-size:12px;color:#888;margin:0;">Reçu via le formulaire de contact d\'avisdoc.fr le ' . $dateStr . '.</p>';
$body .= '</body></html>';

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
$encodedReplyName = '=?UTF-8?B?' . base64_encode($name) . '?=';

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    "From: {$encodedFromName} <{$fromEmail}>",
    "Reply-To: {$encodedReplyName} <{$email}>",
    'X-Mailer: AvisDoc-Contact-Form',
];

$ok = @mail($to, $encodedSubject, $body, implode("\r\n", $headers));

if (!$ok) {
    error_log("avisdoc contact: mail() a échoué pour {$email}");
    http_response_code(500);
    echo json_encode(['error' => "Erreur d'envoi côté serveur. Réessayez ou contactez-nous directement à contact@avisdoc.fr."]);
    exit;
}

// Succès
echo json_encode(['success' => true]);
