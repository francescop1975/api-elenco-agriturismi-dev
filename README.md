# 🚀 Apigee API Proxy Template
Questo template fornisce una struttura standardizzata e "ready-to-use" per lo sviluppo di API Proxy (sia per la PDND che da pubblicare su API Store) su Google Cloud Apigee, seguendo le best practice di sicurezza e architettura di **PuntoZero**.

L'obiettivo del template è garantire uniformità tra tutti i proxy, facilitare la manutenzione e implementare nativamente i controlli di sicurezza obbligatori.

----------

## 1. Architettura e Policy Standard

Il proxy segue un'architettura modulare basata su **Shared Flows** e configurazioni dinamiche tramite **Key value maps**.

### Struttura delle cartelle

```
root-progetto/
├── initializer.py              # Script Python per la generazione dei file dai template
├── initializer_config.yaml     # File di configurazione con le variabili dell'API
├── openapi.yaml                # Specifica OpenAPI (OAS) per il catalogo Apigee o per quello PDND
│
├── apiproxy/                   # Bundle del Proxy (Template J2)
│   ├── {{proxy_name}}.xml.j2   # Manifest (ex api-template.xml)
│   ├── proxies/
│   │   └── default.xml.j2      # ProxyEndpoint (PreFlow, Flows, PostFlow)
│   ├── targets/
│   │   └── default.xml.j2      # TargetEndpoint dinamico
│   ├── policies/               # Policy XML statiche (CORS, JWT, ecc.) e Template J2
│   └── resources/
│       └── jsc/                # Script JavaScript per logging e logiche custom
│
├── config/                     # Configurazioni di Ambiente (Template J2)
│   ├── kvm-dev.properties.j2   # Template properties per ambiente DEV
│   └── kvm-prod.properties.j2  # Template properties per ambiente PROD
│
└── product/                    # Governance e Portale (Template J2)
│   ├── product-dev.json.j2     # Definizione API Product DEV
│   ├── product-prod.json.j2    # Definizione API Product PROD
│   └── sync-portal.ps1         # Script PowerShell per Prodotto e Portale
└── test/                       # Collection Bruno per test PDND Interoperabilità
```


### Pipeline di esecuzione (Security & Governance)

Ogni proxy implementa una serie di policy obbligatorie organizzate nella pipeline di richiesta/risposta:

| **Categoria** | **Policy** | **Descrizione** | **Ambito** |
| :--- | :--- | :--- | :--- |
| **Authentication** | `FC-verifyAccessToken` | Validazione OAuth2 per API pubblicate su APIStore. | Standard |
|  | `FC-tokenVerifyPdnd` | Validazione token PDND (sia tipo Bearer che DPoP) | PDND |
| **Security** | `AC-IPGatekeeper` | Whitelist degli indirizzi IP autorizzati. | Entrambi |
|  | `FC-setCors` | Gestione centralizzata degli header CORS. | Entrambi |
|  | `FC-securityChecks` | Protezione contro SQL Injection, JSON Threat, ecc. | Standard |
|  | `FC-integrityRest02Request` | Verifica di integrità del payload secondo il pattern INTEGRITY_REST_02. | PDND |
|  | `FC-integrityRest02Response` | Firma del payload di risposta secondo il pattern INTEGRITY_REST_02.| PDND |
| **Config** | `KVM-GetPropertyValues` | Recupero dinamico dei parametri dal KVM (host, basepath). | Entrambi |
|  | `KVM-GetPropertyValuesPDND` | Recupero dinamico parametri KVM specifici per ambiente PDND. | PDND |
|  | `KVM-getRSAPrivateKey` | Estrazione della chiave privata da KVM per firma backend. | Entrambi |
|  | `JWT-generateSignedToken` | Genera un JWT di sistema per l'autenticazione verso il backend. | Entrambi |
| **Governance** | `JS-quota-retry-after` | Logica JS per calcolare il tempo di attesa (Retry-After). | PDND |
|  | `AM-Add-Quota-Headers` | Inserimento degli header HTTP relativi alla quota nella risposta. | PDND |
|  | `AM-Add-Retry-After-Header` | Inserimento dell'header `Retry-After` in caso di errore 429. | PDND |
|  | `FC-quotaVerifyPdnd` | Controllo quote per API pubblicate su PDND. | PDND |
| **Routing** | `AM-setDynamicTargetSuffix` | Calcolo del path relativo per il backend. | Entrambi |
|  | `AM-disableTargetPathSuffixAppend` | Disabilita l'append automatico del path suffix al target. | Entrambi |
|  | `AM-setTargetHeaderHost` | Sovrascrive l'header Host con quello del backend reale. | Entrambi |
|  | `RF-flowNotFound` | Safety net: restituisce 404 se l'endpoint non esiste. | Entrambi |
| **Logging** | `JS-setLoggingVariables` | Estrazione e preparazione variabili per il logging JSON. | Standard |
|  | `FC-Audit-Log` | Gestione dei log di audit specifici per le transazioni PDND. | PDND |
|  | `FC-setErrorRFC` | Standardizzazione errori secondo **RFC 7807**. | Entrambi |
|  | `FC-logWriter` | Scrittura asincrona dei log verso Cloud Logging. | Entrambi |
----------

## 2. Guida alla Personalizzazione

### 2.1 🚀 Apigee Proxy Initializer

Questo progetto utilizza un sistema di templating basato su **Jinja2** per generare rapidamente bundle Apigee coerenti con gli standard aziendali. Tale bundle rappresenterà una base di partenza su cui poi sviluppare il proxy.

#### 2.1.1 Prerequisiti

Assicurati di avere Python installato e la libreria Jinja2 e PyYAML:

```
pip install jinja2 pyyaml
```

#### 2.2.2 Configurazione

Apri il file `initializer_config.yaml` e inserisci i valori specifici per la tua nuova API.
    

#### 2.2.3. Generazione

Esegui lo script dalla root del progetto:

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


### 2.4 Variabili per Ambiente (Key value maps)

Per garantire la portabilità del codice tra i diversi ambienti (Dev e Prod), il proxy non scrive "hardcoded" gli indirizzi dei server, ma utilizza il Key value maps `kvm-{ENV}.properties`.

Questo approccio permette di modificare l'host e i percorsi di backend agendo esclusivamente sulla configurazione, senza dover generare nuove revisioni del proxy XML. Oltre alle chiavi già incluse dall'initializer (host e base path), è possibile aggiungere variabili custom che verranno lette a runtime tramite la policy `KVM-GetPropertyValues`.

#### Chiavi Obbligatorie

Per ogni nuovo proxy, devono essere definite le seguenti chiavi nel Key value maps (KVM):

-   **`host`**: Definisce l'**host** del backend (es. `api.miodominio.it`).
    
    -   Viene assegnato alla variabile `targetHost`.
        
    -   Viene utilizzato per popolare l’header HTTP `Host`.
        
    -   Viene mappato nei log per il monitoraggio del target.
        
-   **`basepath`**: Definisce il **percorso base** del servizio di destinazione (es. `/api/v1`).
    
    -   Viene assegnato alla variabile `targetBasepath`.
        
    -   Viene combinato con il suffisso dinamico per costruire l'URL finale nel `<HTTPTargetConnection>`.
        

> [!IMPORTANT]
> 
> **Allineamento Host:** Il valore dell'host definito nelle Key value maps deve coincidere esattamente con l'host configurato nel **Target Server** di riferimento.

#### 2.4.1 Workflow di Aggiornamento e Deploy

Durante lo sviluppo, la gestione delle variabili avviene tramite file locali con estensione `.properties` (es. `kvm-dev.properties`).

1.  **Sviluppo Locale**: Le variabili vengono censite o modificate nel file `.properties` corrispondente all'ambiente.
       
2.  **CI/CD**: In fase di deploy, la **GitHub Action** si occupa di sincronizzare queste configurazioni con l'ambiente Apigee di destinazione.

> [!TIP]
> 
> **Dove vedere le Key value maps:** Le key value maps sono visibili dalla console di Apigee sotto Gestione > Ambienti > dev (o prod) > Key value maps


### 2.5 Sicurezza Backend (JWT & KVM)

Se il backend richiede un JWT firmato da Apigee per identificare la sorgente:

1. Assicurati che nella KVM `jwt-signing-credentials` sia presente la chiave `rsa-private-key`.

2. La policy `JWT-generateSignedToken` utilizzerà questa chiave per firmare i messaggi in uscita verso il server di destinazione.

----------

## 🚀 3. Ciclo di Vita e Deploy (CI/CD)

Il progetto adotta il modello **Gitflow**. Il deploy su Apigee è completamente automatizzato tramite GitHub Actions per garantire consistenza, sicurezza e tracciabilità tra il codice sorgente e il runtime.

### 3.1 Prerequisiti

E' necessario abilitare nelle impostazioni dell'organizzazione PuntoZero di Github sotto Security > Secret and variables > Actions la visibilità dei due Organization secrets APIGEE_DEVOPS_DEPLOYER_SA e APIGEE_DEVOPS_DEPLOYER_WIP per il repository del proxy che si sta sviluppando.

### 3.2 Strategia di Branching e Ambienti

Il passaggio del codice tra gli ambienti avviene secondo la seguente logica:
| **Branch GitHub** | **Evento** |**Ambiente Apigee** | **Modalità**|
|--|--|--|--|
| `dev` | **Push / Merge PR** | **DEV** | **Continuous Deployment**: Ogni modifica integrata in `dev` viene deployata immediatamente per i test di integrazione. |
| `main` | **GitHub Release** | **PROD** | **Release Management**: Il deploy in produzione avviene esclusivamente alla pubblicazione di una Release ufficiale (Tag). |


### 3.3 Tracciabilità Release-Revisione

Poiché Apigee assegna automaticamente numeri di revisione interi e incrementali, adottiamo una strategia di **Metadata Mapping** per far coincidere logicamente le versioni di GitHub con quelle di Apigee:

-   **Identificazione Biunivoca:** Durante il deploy in **PROD**, la GitHub Action recupera il tag della release (es. `v1.2.5`) e lo inietta nella **descrizione della revisione** su Apigee.
    
-   **Visibilità:** Nella console di Apigee, la colonna "Description" mostrerà sempre il riferimento `GitHub Release: v1.2.5`.
    
-   **Audit Trail:** Questo permette di sapere istantaneamente quale codice sorgente è contenuto in una specifica revisione di Apigee, facilitando troubleshooting e audit.
    

### 3.4 Workflow Operativo

#### Sviluppo e Test (DEV)

1.  Lo sviluppatore lavora su un branch `feature/*`.
    
2.  Una volta completata, apre una Pull Request verso `dev`.
    
3.  Al merge su `dev`, la Action genera una nuova revisione su Apigee DEV e la attiva (overwrite).
    

#### Rilascio (PROD)

1.  Quando il codice su `dev` è stabile, viene creata una PR verso `main`.
    
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

## 🚀 4. Test API PDND

Il repository include una Collection Bruno pre-configurata per interagire con il proxy:

- Automazione Auth: Gestisce in autonomia la generazione del JWT e il recupero dell'Access Token da PDND Interop tramite script di pre-request.

- Pronta all'uso: Permette di testare immediatamente l'endpoint Apigee senza dover configurare manualmente i complessi header di sicurezza richiesti.
