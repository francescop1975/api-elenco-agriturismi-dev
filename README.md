# 🚀 Apigee API Proxy Template
Questo template fornisce una struttura standardizzata e "ready-to-use" per lo sviluppo di API Proxy su Google Cloud Apigee, seguendo le best practice di sicurezza e architettura di **PuntoZero**.

L'obiettivo del template è garantire uniformità tra tutti i proxy, facilitare la manutenzione e implementare nativamente i controlli di sicurezza obbligatori.

----------

## 1. Architettura e Policy Standard

Il proxy segue un'architettura modulare basata su **Shared Flows** e configurazioni dinamiche tramite **Property Sets**.

### Struttura delle cartelle

Plaintext
```

apiproxy/

├── api-template.xml # Manifest principale (Configurazione e dipendenze)

├── proxies/

│ └── default.xml # Definizione dei flussi (PreFlow, Flows, PostFlow)

├── targets/

│ └── default.xml # TargetEndpoint dinamico basato su Target Server

├── policies/ # Logiche atomiche (XML)

└── resources/

└── jsc/ # Script JavaScript per logging e logiche custom
```


### Pipeline di esecuzione (Security & Governance)

Ogni proxy implementa una serie di policy obbligatorie organizzate nella pipeline di richiesta/risposta:

| **Categoria** | **Policy** | **Descrizione**|
|--|--|--|
| **Security** |`AC-IPGatekeeper` | Whitelist degli indirizzi IP autorizzati.|
| |`FC-setCors` | Gestione centralizzata degli header CORS. |
| |`FC-verifyAccessToken` |Validazione OAuth2 via Shared Flow.|
| |`FC-securityChecks` |Protezione contro SQL Injection, JSON Threat, ecc.|
| **Config**|`RPS-getPropertyEntryValue` |Recupero dinamico dei parametri dal Property Set.|
| |`KVM-getRSAPrivateKey` |Estrazione della chiave privata da KVM per firma backend.|
| |`JWT-generateSignedToken` |Genera un JWT di sistema per l'autenticazione verso il backend.|
| **Routing**|`AM-setDynamicTargetSuffix` |Calcolo del path relativo per il backend.|
| | `RF-flowNotFound`|Safety net: restituisce 404 se l'endpoint non esiste.|
| **Logging**|`FC-setErrorRFC` |Standardizzazione errori secondo **RFC 7807**.|
| |`FC-logWriter` |Scrittura asincrona dei log verso sistemi esterni.|
----------

## 2. Guida alla Personalizzazione

### 2.1 🚀 Apigee Proxy Initializer

Questo progetto utilizza un sistema di templating basato su **Jinja2** per generare rapidamente bundle Apigee coerenti con gli standard aziendali. Tale bundle rappresenterà una base di partenza su cui poi sviluppare il proxy.

#### 2.1.1 Prerequisiti

Assicurati di avere Python installato e la libreria Jinja2 e PyYAML:

Bash
```
pip install jinja2 pyyaml
```

#### 2.2.2 Configurazione

Apri il file `initializer_config.yaml` e inserisci i valori specifici per la tua nuova API.
    

#### 2.2.3. Generazione

Esegui lo script dalla root del progetto:

Bash

```
python initializer.py

```

**Cosa succede quando lanci lo script?**

1.  **Rendering**: Lo script scansiona le cartelle `apiproxy/` e `config/` in cerca di file `.j2`.
    
2.  **Sostituzione**: Crea i file XML/JSON/Properties finali iniettando i valori dal file YAML.
    
3.  **Naming**: Il file `apiproxy/manifest.xml.j2` viene rinominato automaticamente in `apiproxy/{{proxy_name}}.xml` come richiesto da Apigee.
    
4.  **Cleanup**: I file template `.j2` vengono eliminati per lasciare la directory pulita e pronta per il deploy o per essere zippata.
 

### 2.2 Definizione dei Flussi (`proxies/default.xml`)

Aggiungi i tuoi endpoint specifici nella sezione `<Flows>`. Mantieni sempre la policy `RF-flowNotFound` come ultimo elemento per gestire le chiamate non valide.

XML
```

<Flow name="GetAnagrafica">

<Condition>(proxy.pathsuffix MatchesPath "/persone/*") and (request.verb = "GET")</Condition>

<Request>

</Request>

</Flow>
```

### 2.3 Configurazione Target e Infrastruttura (`targets/default.xml`)

Il file di Target è già generato dallo script con il riferimento dinamico al **Target Server** definito nel file YAML. Tuttavia, affinché il proxy funzioni, è necessario che l'infrastruttura su Apigee sia coerente:

1.  **Creazione Target Server**: Devi assicurarti che nel tuo **Environment Apigee** (es. `dev` o `prod`) esista un Target Server con lo stesso nome specificato nel `targets/default.xml`.
    
2.  **Configurazione Host**: All'interno del Target Server su Apigee, dovrai definire l'host reale (es. `api.miodominio.it`) e la porta (solitamente `443`).
    
3.  **Vantaggio**: Grazie a questa configurazione (`<Server name="{{ target_server }}"/>`), non dovrai mai cambiare il codice del proxy se il backend cambia IP o hostname; basterà aggiornare il Target Server a livello di ambiente.
    

> [!TIP] Ricorda di abilitare il protocollo **SSL (TLS)** nelle impostazioni del Target Server su Apigee se il tuo backend richiede connessioni sicure (HTTPS).

### 2.4 Variabili per Ambiente (Property Set)

Per garantire la portabilità del codice tra i diversi ambienti (Dev e Prod), il proxy non scrive "hardcoded" gli indirizzi dei server, ma utilizza il Property Set `kvm-{ENV}.properties`.

Questo approccio permette di modificare l'host e i percorsi di backend agendo esclusivamente sulla configurazione, senza dover generare nuove revisioni del proxy XML. Oltre alle chiavi già incluse dall'initializer (host e base path), è possibile aggiungere variabili custom che verranno lette a runtime tramite la policy `AM-setPropertyEntryKey`.

#### Chiavi Obbligatorie

Per ogni nuovo proxy, devono essere definite le seguenti chiavi nel Property Set:

-   **`{nomeproxy}.{env}.host`**: Definisce l'**host** del backend (es. `api.miodominio.it`).
    
    -   Viene assegnato alla variabile `targetHost`.
        
    -   Viene utilizzato per popolare l’header HTTP `Host`.
        
    -   Viene mappato nei log per il monitoraggio del target.
        
-   **`{nomeproxy}.{env}.basepath`**: Definisce il **percorso base** del servizio di destinazione (es. `/api/v1`).
    
    -   Viene assegnato alla variabile `targetBasepath`.
        
    -   Viene combinato con il suffisso dinamico per costruire l'URL finale nel `<HTTPTargetConnection>`.
        

> [!CAUTION] **Allineamento Host:** Il valore dell'host definito nel Property Set deve coincidere esattamente con l'host configurato nel **Target Server** di riferimento per evitare errori di risoluzione o mismatch di certificati SSL.

#### 2.4.1 Workflow di Aggiornamento e Deploy

Durante lo sviluppo, la gestione delle variabili avviene tramite file locali con estensione `.properties` (es. `proxy-template-dev.properties`).

1.  **Sviluppo Locale**: Le variabili vengono censite o modificate nel file `.properties` corrispondente all'ambiente.
       
2.  **CI/CD**: In fase di deploy, la **GitHub Action** si occupa di sincronizzare queste configurazioni con l'ambiente Apigee di destinazione.
    

> ⚠️ **Propagazione Runtime:** Le modifiche ai Property Set hanno effetto immediato sulle nuove chiamate. Tuttavia, Apigee può impiegare alcuni secondi (latenza di propagazione) per distribuire i nuovi valori su tutti i nodi del Message Processor.
  

### 2.5 Sicurezza Backend (JWT & KVM)

Se il backend richiede un JWT firmato da Apigee per identificare la sorgente:

1. Assicurati che nella KVM `jwt-signing-credentials` sia presente la chiave `rsa-private-key`.

2. La policy `JWT-generateSignedToken` utilizzerà questa chiave per firmare i messaggi in uscita verso il server di destinazione.

----------

## 🚀 3. Ciclo di Vita e Deploy (CI/CD)

Il progetto adotta il modello **Gitflow**. Il deploy su Apigee è completamente automatizzato tramite GitHub Actions per garantire consistenza, sicurezza e tracciabilità tra il codice sorgente e il runtime.

### 3.1 Strategia di Branching e Ambienti

Il passaggio del codice tra gli ambienti avviene secondo la seguente logica:
| **Branch GitHub** | **Evento** |**Ambiente Apigee** | **Modalità**|
|--|--|--|--|
| `develop` | **Push / Merge PR** | **DEV** | **Continuous Deployment**: Ogni modifica integrata in `develop` viene deployata immediatamente per i test di integrazione. |
| `main` | **GitHub Release** | **PROD** | **Release Management**: Il deploy in produzione avviene esclusivamente alla pubblicazione di una Release ufficiale (Tag). |


### 3.2 Tracciabilità Release-Revisione

Poiché Apigee assegna automaticamente numeri di revisione interi e incrementali, adottiamo una strategia di **Metadata Mapping** per far coincidere logicamente le versioni di GitHub con quelle di Apigee:

-   **Identificazione Biunivoca:** Durante il deploy in **PROD**, la GitHub Action recupera il tag della release (es. `v1.2.5`) e lo inietta nella **descrizione della revisione** su Apigee.
    
-   **Visibilità:** Nella console di Apigee, la colonna "Description" mostrerà sempre il riferimento `GitHub Release: v1.2.5`.
    
-   **Audit Trail:** Questo permette di sapere istantaneamente quale codice sorgente è contenuto in una specifica revisione di Apigee, facilitando troubleshooting e audit.
    

### 3.3 Workflow Operativo

#### Sviluppo e Test (DEV)

1.  Lo sviluppatore lavora su un branch `feature/*`.
    
2.  Una volta completata, apre una Pull Request verso `develop`.
    
3.  Al merge su `develop`, la Action genera una nuova revisione su Apigee DEV e la attiva (overwrite).
    

#### Rilascio (PROD)

1.  Quando il codice su `develop` è stabile, viene creata una PR verso `main`.
    
2.  Dopo il merge su `main`, viene creata una **GitHub Release** (es. `v1.0.0`).
    
3.  La creazione della Release scatena la Action di produzione che:
    
    -   Crea il bundle del proxy.
        
    -   Esegue il deploy su **PROD**.
        
    -   Etichetta la revisione con il tag della release.
        

> [!IMPORTANT]
> 
> **Regola d'oro:** Non effettuare mai deploy manuali o modifiche dirette dalla UI di Apigee in ambiente PROD. L'unico "punto di verità" per la produzione è il branch `main` tramite le GitHub Releases.

> [!TIP]
> 
> **Rollback:** In caso di emergenza, è possibile effettuare il rollback a una versione precedente semplicemente redeployando una Release passata dalla tab "Actions" di GitHub. La nuova revisione creata su Apigee riporterà comunque il tag della release originale per mantenere la coerenza.