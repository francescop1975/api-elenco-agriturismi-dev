module.exports = {
    // Mappa centralizzata delle descrizioni dei test
    testDescriptions: {
        0: "Nessun test di sicurezza. Chiamata legittima in corso.",
        // INTEGRITY (1-7)
        1: "INTEGRITY: Invio Digest del payload errato",
        2: "INTEGRITY: Alterazione della firma Agid-JWT-Signature",
        3: "INTEGRITY: Firma Agid-JWT-Signature scaduta (exp passato)",
        4: "INTEGRITY: Firma Agid-JWT-Signature con Audience (aud) errato",
        5: "INTEGRITY: Kid inesistente nel JOSE Header (fallisce check su PDND)",
        6: "INTEGRITY: Disallineamento Content-Type tra HTTP e JWT",
        7: "INTEGRITY: Claim 'signed_headers' mancante nel payload",
        // DPOP (8-12)
        8: "DPoP CROSS-CHECK: Proof con 'ath' (hash del token) sballato",
        9: "DPoP CROSS-CHECK: Proof firmata con chiave RSA non autorizzata (Thumbprint errato)",
        10: "DPoP PROOF: Destinata a un URL diverso (htu errato)",
        11: "DPoP PROOF: Destinata a un Metodo HTTP diverso (htm errato)",
        12: "DPoP PROOF: Proof scaduta / troppo vecchia (iat obsoleto)",
        // VOUCHER (13-15)
        13: "VOUCHER PDND: Token contraffatto (Self-Signed). Payload perfetto, firma del fruitore",
        14: "VOUCHER PDND: Attesa scadenza naturale del token",
        15: "VOUCHER PDND: Voucher reale ma per un Audience diverso (wrong_purpose_id)"
    },

    // Funzione helper per ottenere la descrizione
    getTestDescription: function(testIndex) {
        return this.testDescriptions[testIndex] || `Modalità test sconosciuta (${testIndex})`;
    },  
  // 1. Funzione che intercetta la richiesta legittima e la sabota
    applySabotage: async function(req, bru, pdnd, libSource, config, testIndex) {
        // Se non c'è la variabile o è 0, non facciamo nessun sabotaggio
        if (isNaN(testIndex) || testIndex === 0) {
            return;
        }

        console.log(`\n=========================================`);
        console.log(`😈 [TEST ${testIndex}] ${this.getTestDescription(testIndex)}`);
        const { realToken, method, targetUrl, voucherType, dpopPrivateKey, dpopPublicKey, dpopAlg, privateKey, kid, clientId, pdndAud, pdndAuthUrl } = config;
      
        // --- HELPER PER INTEGRITY REST 02 ---
        // Estraiamo l'Agid-JWT-Signature perfetta generata dal main script
        let perfectAgidJwt = req.getHeader('Agid-JWT-Signature');
        let agidHeaderObj, agidPayloadObj;
        
        if (perfectAgidJwt) {
            agidHeaderObj = JSON.parse(Buffer.from(perfectAgidJwt.split('.')[0], 'base64').toString());
            agidPayloadObj = JSON.parse(Buffer.from(perfectAgidJwt.split('.')[1], 'base64').toString());
        }

        // Funzione per rifirmare l'Agid-JWT-Signature dopo averla manipolata
        const resignAgidJwt = (customHeader, customPayload) => {
            const window = {}; const navigator = {}; eval(libSource);
            // @ts-ignore
            return KJUR.jws.JWS.sign(customHeader.alg, JSON.stringify(customHeader), JSON.stringify(customPayload), privateKey);
        };

        switch (testIndex) {
            case 1:
                req.setHeader('Digest', 'SHA-256=hash_falso_inventato_da_me=');
                break;

            case 2:
                let firmaPerfetta = req.getHeader('Agid-JWT-Signature');
                if (firmaPerfetta) req.setHeader('Agid-JWT-Signature', firmaPerfetta.slice(0, -1) + "X");
                break;

            case 3:
                // Alterazione della scadenza della firma
                if (agidPayloadObj) {
                    agidPayloadObj.exp = Math.floor(Date.now() / 1000) - 3600; // Scaduta un'ora fa
                    req.setHeader('Agid-JWT-Signature', resignAgidJwt(agidHeaderObj, agidPayloadObj));
                }
                break;
            case 4:
                // Alterazione dell'Audience della firma
                if (agidPayloadObj) {
                    agidPayloadObj.aud = "api-erogatore-sconosciuto.it";
                    req.setHeader('Agid-JWT-Signature', resignAgidJwt(agidHeaderObj, agidPayloadObj));
                }
                break;

            case 5:
                // Alterazione del KID: L'erogatore non troverà questa chiave pubblica interrogando PDND
                if (agidHeaderObj) {
                    agidHeaderObj.kid = "kid-inventato-totalmente-falso";
                    req.setHeader('Agid-JWT-Signature', resignAgidJwt(agidHeaderObj, agidPayloadObj));
                }
                break;

            case 6:
                // Lasciamo la firma PERFETTA (che ha blindato il Content-Type originale, es. application/json).
                // Modifichiamo invece l'header HTTP effettivo. L'erogatore deve incrociarli e bloccarci.
                req.setHeader('Content-Type', 'text/xml'); 
                break;

            case 7:
                // Rimuoviamo l'oggetto signed_headers dal JWT (violazione delle specifiche AgID)
                if (agidPayloadObj) {
                    delete agidPayloadObj.signed_headers;
                    req.setHeader('Agid-JWT-Signature', resignAgidJwt(agidHeaderObj, agidPayloadObj));
                }
                break;
            
            case 8:
                req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, method, targetUrl, dpopAlg, "token_inventato"));
                break;

            case 9:
                const fakePriv = bru.getGlobalEnvVar("fake_dpop_private_key");
                const fakePub = bru.getGlobalEnvVar("fake_dpop_public_key");
                if (fakePriv) req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, fakePriv, fakePub, method, targetUrl, dpopAlg, realToken));
                break;

            case 10:
                req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, method, "https://hacker.com/api", dpopAlg, realToken));
                break;
            
            case 11:
                // Testiamo l'HTM: L'URL è giusto, il token è giusto, ma diciamo che stiamo 
                // facendo una 'GET' o una 'DELETE' anche se la vera chiamata è una 'POST'
                const wrongMethod = method.toUpperCase() === 'POST' ? 'GET' : 'POST';
                req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, wrongMethod, targetUrl, dpopAlg, realToken));
                break;

            case 12:
                // Testiamo lo IAT: Creiamo una Proof perfetta, ma generata 10 minuti fa (600 secondi).
                const pastIat = Math.floor(Date.now() / 1000) - 600; 
                
                req.setHeader('DPoP', pdnd.generateDPoPProof(
                    libSource, 
                    dpopPrivateKey, 
                    dpopPublicKey, 
                    method, 
                    targetUrl, 
                    dpopAlg, 
                    realToken, 
                    pastIat // <-- Passiamo il nostro timestamp sabotato!
                ));
                break;
            
            case 13:
                const window = {}; const navigator = {}; eval(libSource);
                let tokenParts = realToken.split('.');
                let perfectPayloadStr = Buffer.from(tokenParts[1], 'base64').toString('utf-8');
                const fakeHeader = { alg: 'RS256', typ: 'JWT', kid: kid };
                // @ts-ignore
                let forgedToken = KJUR.jws.JWS.sign(fakeHeader.alg, JSON.stringify(fakeHeader), perfectPayloadStr, privateKey);
                
                if (voucherType === "DPOP") {
                    req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, method, targetUrl, dpopAlg, forgedToken));
                }
                req.setHeader('Authorization', `${voucherType === "DPOP" ? 'DPoP' : 'Bearer'} ${forgedToken}`);
                break;

            case 14:
                let payload7 = JSON.parse(Buffer.from(realToken.split('.')[1], 'base64').toString());
                let secondsToWait = payload7.exp - Math.floor(Date.now() / 1000);
                
                // Configuro in anticipo gli header per la richiesta (anche se partirà tra un po')
                if (voucherType === "DPOP") {
                    req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, method, targetUrl, dpopAlg, realToken));
                }
                req.setHeader('Authorization', `${voucherType === "DPOP" ? 'DPoP' : 'Bearer'} ${realToken}`);

                if (secondsToWait > 0) {
                    // Ritorno allo script principale i millisecondi di attesa (+2 di margine)
                    return (secondsToWait + 2) * 1000; 
                } else {
                    console.log("⏰ Il token in cache è già scaduto. Procedo direttamente.");
                    return 0; // Nessuna attesa richiesta
                }
                break; // Aggiunto per correttezza formale, anche se i return sopra lo interrompono

            case 15:
                const wrongPurposeId = bru.getGlobalEnvVar("wrong_purpose_id");
                if (!wrongPurposeId) throw new Error("⚠️ Manca 'wrong_purpose_id' per il Test 8.");
                console.log("🔄 Richiesta a PDND di un nuovo token autorizzativo...");
                
                const wrongClientAssertion = await pdnd.generateClientAssertion(libSource, privateKey, kid, clientId, wrongPurposeId, pdndAud);
                let wrongRealToken;
                
                if (voucherType === "DPOP") {
                    const dpopAuthProof = pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, 'POST', pdndAuthUrl, dpopAlg);
                    wrongRealToken = await pdnd.fetchAccessToken(wrongClientAssertion, clientId, pdndAuthUrl, dpopAuthProof);
                    req.setHeader('DPoP', pdnd.generateDPoPProof(libSource, dpopPrivateKey, dpopPublicKey, method, targetUrl, dpopAlg, wrongRealToken));
                } else {
                    wrongRealToken = await pdnd.fetchAccessToken(wrongClientAssertion, clientId, pdndAuthUrl);
                }
                req.setHeader('Authorization', `${voucherType === "DPOP" ? 'DPoP' : 'Bearer'} ${wrongRealToken}`);
                console.log("✅ Token reale ma con 'aud' errato ottenuto da PDND.");
                break;


            default:
                console.log(`⚠️ Modalità test sconosciuta: ${testIndex}`);
                break;
        }
    },

    // 2. Funzione per il tab Tests: Valuta se l'Erogatore ha bloccato l'attacco
    validateResponse: function(res, test, expect, bru, testIndex) {
        
        if (isNaN(testIndex) || testIndex === 0) {

        } else {
           const description = this.getTestDescription(testIndex);
            test(`🛡️ TEST SICUREZZA [TEST ${testIndex}]: L'Erogatore deve bloccare l'attacco -> ${description}`, function() {
                const status = res.getStatus();
                expect(status).to.be.oneOf([400, 401, 403], `ATTENZIONE: L'Erogatore ha accettato la richiesta (Status ${status}) nonostante il sabotaggio n.${testIndex}! ERRORE DI SICUREZZA.`);
            });
        }
    }
};