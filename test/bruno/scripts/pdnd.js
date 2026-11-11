const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');

module.exports = {
    
    // 1. Scarica e/o recupera la libreria jsrsasign dalla cache
    getCryptoLibrary: async function(bru, libUrl) {
        let libSource = bru.getVar('jsrsasign-js');
        if (!libSource) {
            console.log("🌐 Download jsrsasign...");
            const res = await axios.get(libUrl);
            libSource = res.data;
            bru.setVar('jsrsasign-js', libSource);
        }
        return libSource;
    },

    // 2. Genera il JWT (Client Assertion)
    generateClientAssertion: async function(libSource, privateKey, kid, clientId, purposeId, pdndAud) {
        const window = {}; const navigator = {}; eval(libSource);

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const header = { kid, alg: 'RS256', typ: 'JWT' };
        
        // Payload base valido per TUTTE le chiamate (Erogatori e Interoperabilità)
        const payload = {
            iss: clientId,
            sub: clientId,
            aud: pdndAud,
            jti: uuidv4(),
            iat: currentTimestamp,
            exp: currentTimestamp + 300
        };

        // Aggiungiamo il purposeId SOLO se è stato valorizzato su Bruno (chiamata a Erogatore)
        if (purposeId && purposeId.trim() !== "") {
            payload.purposeId = purposeId;
        }

        const sHeader = JSON.stringify(header);
        const sPayload = JSON.stringify(payload);
        // @ts-ignore
        return KJUR.jws.JWS.sign(header.alg, sHeader, sPayload, privateKey);
    },

    // 4. Calcola Digest e firma gli header (INTEGRITY_REST_02)
    signPayloadIntegrity: async function(req, libSource, privateKey, kid, clientId, audEservice) {
        const method = req.getMethod();
        let body = req.getBody();

        if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            // Step A: Digest e Sincronizzazione Body
            let bodyString;
            if (typeof body === 'object') {
                bodyString = JSON.stringify(body); // Trasforma in stringa senza spazi
                req.setBody(bodyString);           // FORZA Bruno a inviare questa esatta stringa
            } else {
                bodyString = body; // Se era già testuale, lo lascia com'è
            }
          
            const hash = CryptoJS.SHA256(bodyString).toString(CryptoJS.enc.Base64);
            const digestHeader = `SHA-256=${hash}`;
            req.setHeader('Digest', digestHeader);

            // Step B: Content-Type
            let contentType = req.getHeader('Content-Type') || req.getHeader('content-type');
            if (!contentType) {
                contentType = 'application/json';
                req.setHeader('Content-Type', contentType);
            }

            // Step C: Firma Agid-JWT-Signature
            const window = {}; const navigator = {}; eval(libSource);
            const currentTimestamp = Math.floor(Date.now() / 1000);
            
            const header = { kid, alg: 'RS256', typ: 'JWT' };
            const payload = {
                iss: clientId,
                sub: clientId, 
                aud: audEservice, 
                jti: uuidv4(),
                iat: currentTimestamp,
                exp: currentTimestamp + 300,
                signed_headers: {
                    "digest": digestHeader,
                    "content-type": contentType
                }
            };

            const sHeader = JSON.stringify(header);
            const sPayload = JSON.stringify(payload);
            // @ts-ignore
            const agidJwt = KJUR.jws.JWS.sign(header.alg, sHeader, sPayload, privateKey);

            req.setHeader('Agid-JWT-Signature', agidJwt);
            console.log("🛡️ INTEGRITY_REST_02: Header calcolati e iniettati.");
        }
    },

    // 5. Verifica l'integrità della risposta (INTEGRITY_REST_02)
    verifyResponseIntegrity: function(res, test, expect, providerPublicKey, libSource) {

        const agidJwt = res.getHeader('agid-jwt-signature');
        const receivedDigest = res.getHeader('digest');
        const contentType = res.getHeader('content-type');

        // Controlliamo che gli header ESISTANO e NON SIANO VUOTI
        if (agidJwt && agidJwt.trim() !== "" && receivedDigest && receivedDigest.trim() !== "") {
            // TEST 1: Il Digest del body corrisponde?
            test("🛡️ INTEGRITY_REST_02: Il Digest del payload è integro", function() {
                let body = res.getBody();
                const bodyString = typeof body === 'object' ? JSON.stringify(body) : (body || "");
                
                const calculatedHash = CryptoJS.SHA256(bodyString).toString(CryptoJS.enc.Base64);
                const calculatedDigest = `SHA-256=${calculatedHash}`;
                
                expect(calculatedDigest).to.equal(receivedDigest);
            });

            test("🛡️ INTEGRITY_REST_02: Verifica che la firma Agid-JWT-Signature sia valida", function() {
                expect(providerPublicKey, "Manca la chiave pubblica dell'erogatore").to.not.be.undefined;

                const window = {}; const navigator = {}; eval(libSource);
                
                // 1. Analizziamo l'header del JWT per estrarre l'algoritmo dichiarato
                // @ts-ignore
                const parsedJwt = KJUR.jws.JWS.parse(agidJwt);
                const declaredAlg = parsedJwt.headerObj.alg;

                // 2. Whitelist: Definiamo SOLO gli algoritmi asimmetrici accettati da PDND
                const allowedAlgs = ["RS256", "RS384", "RS512", "PS256", "PS384", "ES256"];
                
                expect(allowedAlgs, `L'algoritmo '${declaredAlg}' non è sicuro o non è supportato`).to.include(declaredAlg);

                // 3. Verifica crittografica (jsrsasign accetterà solo se declaredAlg è nella whitelist)
                // @ts-ignore
                const isValidSignature = KJUR.jws.JWS.verify(agidJwt, providerPublicKey, allowedAlgs);
                expect(isValidSignature, `Firma non valida con chiave pubblica fornita (Alg: ${declaredAlg})`).to.be.true;
            });

            // TEST 3: I claim interni corrispondono agli header HTTP?
            test("🛡️ INTEGRITY_REST_02: Verifica che i claim 'signed_headers' corrispondono", function() {
                const window = {}; const navigator = {}; eval(libSource);
                
                const payloadB64U = agidJwt.split(".")[1];
                // @ts-ignore
                const payloadJSON = KJUR.jws.JWS.readSafeJSONString(b64utoutf8(payloadB64U));
                
                let signedDigest, signedContentType;

                // Gestione flessibile: l'Erogatore potrebbe mandare un Array o un Oggetto
                if (Array.isArray(payloadJSON.signed_headers)) {
                    // Cerca dentro l'array l'oggetto che ha la chiave "digest"
                    const digestItem = payloadJSON.signed_headers.find(item => item.digest);
                    signedDigest = digestItem ? digestItem.digest : null;
                    
                    // Cerca dentro l'array l'oggetto che ha la chiave "content-type"
                    const ctItem = payloadJSON.signed_headers.find(item => item['content-type']);
                    signedContentType = ctItem ? ctItem['content-type'] : null;
                } else {
                    // Fallback se l'erogatore lo manda come oggetto semplice
                    signedDigest = payloadJSON.signed_headers.digest;
                    signedContentType = payloadJSON.signed_headers['content-type'];
                }
                
                expect(signedDigest, "Digest mancante nei signed_headers del JWT").to.equal(receivedDigest);
                expect(contentType, "Content-Type non corrispondente").to.include(signedContentType);
            });
        } else {
            // Se entriamo qui, manca l'header o è una stringa vuota
            test("🛡️ INTEGRITY_REST_02: Verifica che la firma è presente nella risposta", function() {
                expect(agidJwt, "L'header Agid-JWT-Signature è mancante o vuoto").to.not.be.empty;
                expect(receivedDigest, "L'header Digest è mancante o vuoto").to.not.be.empty;
            });
        }
    },
    // Scambia la Client Assertion con l'Access Token (con DPoP opzionale)
    fetchAccessToken: async function(clientAssertion, clientId, pdndAuthUrl, dpopProof = null) {
        const payload = [
            `client_id=${encodeURIComponent(clientId)}`,
            `client_assertion=${encodeURIComponent(clientAssertion)}`,
            `client_assertion_type=${encodeURIComponent('urn:ietf:params:oauth:client-assertion-type:jwt-bearer')}`,
            `grant_type=client_credentials`
        ].join('&');

        const config = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
        
        // Se c'è un DPoP Proof, lo inietta nell'header della richiesta token
        if (dpopProof) {
            config.headers['DPoP'] = dpopProof;
        }

        const response = await axios.post(pdndAuthUrl, payload, config);
        return response.data.access_token;
    },

    // NUOVA FUNZIONE: Genera il DPoP Proof JWT
   generateDPoPProof: function(libSource, privateKey, publicKey, htm, htu, alg, accessToken = null, customIat = null) {
        const { v4: uuidv4 } = require('uuid');
        const window = {}; const navigator = {}; eval(libSource);

        // Estrae la chiave pubblica PEM nel formato JWK richiesto dallo standard DPoP
        // @ts-ignore
        const pubKeyObj = KEYUTIL.getKey(publicKey);
        // @ts-ignore
        const jwk = KEYUTIL.getJWKFromKey(pubKeyObj);

        const header = {
            typ: 'dpop+jwt',
            alg: alg,
            jwk: jwk
        };
        // RFC 9449: La URL deve essere senza query string (?param=...)
        const cleanHtu = htu.split('?')[0];

        const payload = {
            jti: uuidv4(),
            htm: htm.toUpperCase(),
            htu: cleanHtu,
            // Usa il customIat se passato, altrimenti genera quello attuale
            iat: customIat !== null ? customIat : Math.floor(Date.now() / 1000)
        };

        // Se stiamo chiamando l'API, dobbiamo includere l'hash (ath) dell'Access Token
        if (accessToken) {
            // Assicurati che CryptoJS sia richiesto o disponibile nello scope
            const CryptoJS = require("crypto-js"); 
            const hash = CryptoJS.SHA256(accessToken);
            // Base64URL encoding rigoroso
            const base64urlHash = hash.toString(CryptoJS.enc.Base64)
                                      .replace(/\+/g, '-')
                                      .replace(/\//g, '_')
                                      .replace(/=/g, '');
            payload.ath = base64urlHash;
        }

        const sHeader = JSON.stringify(header);
        const sPayload = JSON.stringify(payload);
        // @ts-ignore
        return KJUR.jws.JWS.sign(header.alg, sHeader, sPayload, privateKey);
    },
};