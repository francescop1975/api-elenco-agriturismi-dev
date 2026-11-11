
# 🌐 Apigee Portal & Product Sync

Questo script PowerShell automatizza la pubblicazione e l'aggiornamento dei componenti "di facciata" della tua API su **Google Cloud Apigee**. Si occupa di rendere l'API visibile e documentata per gli sviluppatori nel Developer Portal.

## 🛠 Cosa fa lo script?

Lo script esegue tre operazioni critiche in sequenza, garantendo l'allineamento tra il codice e il portale:

### 1. Sincronizzazione Prodotto API (`API Product`)

-   Verifica se il prodotto definito nel file `product/product-{env}.json` esiste già nell'organizzazione Apigee.
    
-   Se esiste, esegue un **aggiornamento (PUT)** per riflettere eventuali modifiche a quote, attributi o risorse.
    
-   Se non esiste, procede con la **creazione (POST)**.
    

### 2. Gestione Catalogo Portale (`API Catalog`)

-   Scansiona l'intero catalogo del portale specificato (es. _Umbria Digitale Dev Portal_).
       
-   Collega il Prodotto API al Catalogo, impostando la visibilità e i metadati (titolo e descrizione).
    

### 3. Pubblicazione Documentazione (`OpenAPI Spec`)

-   Prende il file `product/openapi.yaml` (la tua specifica Swagger/OAS).
    
-   Esegue l'upload della documentazione, rendendola interattiva e consultabile nel portale tramite Swagger UI.
    

----------

## 🚀 Come si usa

### Prerequisiti

Lo script utilizza il comando `gcloud auth print-access-token` per generare un token di sessione dinamico. Assicurati di aver configurato i seguenti punti:

1.  **Google Cloud SDK**: Deve essere installato sul tuo sistema.
    
2.  **Login Attivo**: Esegui il comando nel tuo terminale prima di lanciare lo script:

    ```
    gcloud auth login
    
    ```
    
3.  **Permessi IAM**: L'utente (o il Service Account) deve possedere almeno i seguenti ruoli sulla Google Cloud Organization/Progetto:
    
    -   `roles/apigee.admin` (o un ruolo custom con permessi su _API Products_ e _Environments_).
        
    -   `roles/apigee.portalAdmin` (per la gestione del Catalogo e della Documentazione).

### Esecuzione

Apri un terminale PowerShell nella root del progetto ed esegui:

**Per l'ambiente di Sviluppo (Default):**

```
./sync-portal.ps1 -Env dev

```

**Per l'ambiente di Produzione:**

```
./sync-portal.ps1 -Env prod

```

