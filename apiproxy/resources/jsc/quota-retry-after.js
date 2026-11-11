// Recupera il timestamp di scadenza dalla policy Quota (in ms)
var available = context.getVariable("ratelimit.Q-Quota-Daily-Per-Key.available.count");
var expiryMs = context.getVariable("ratelimit.Q-Quota-Daily-Per-Key.expiry.time");
var nowMs = new Date().getTime();

if (available <= 0 && expiryMs) {
    // Calcola la differenza
    var retryAfter = expiryMs - nowMs;

    // Se per qualche micro-ritardo il calcolo fosse negativo, metti 0
    //toFixed(0) rimuove i decimali e previene la notazione scientifica
    var retryAfterFormatted = (retryAfter > 0) ? retryAfter.toFixed(0) : "0";
    context.setVariable("quota.retry.after", retryAfterFormatted);
}