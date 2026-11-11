param (
    [string]$Env = "dev",                                     # L'ambiente (dev o prod) guida tutto il resto!
    [string]$ApiName = (Split-Path -Path $PWD -Leaf)          # Default: Nome della cartella corrente
)

# ==============================================================================
# AUTO-CONFIGURAZIONE AMBIENTE
# ==============================================================================
switch ($Env.ToLower()) {
    "dev" {
        $Org = "pzsit-host-vpc-dev"
        $TargetPortalId = "pzsit-host-vpc-dev-umbriadigitaledevportal"
    }
    "prod" {
        $Org = "pzsit-host-vpc-prod"
        $TargetPortalId = "pzsit-host-vpc-prod-apistore-prod"
    }
    default {
        Write-Host "ERRORE: Ambiente '$Env' non supportato. Usa 'dev' o 'prod'." -ForegroundColor Red
        exit
    }
}

# Costruzione dinamica dei nomi file e KVM
$KvmName = "$ApiName-$Env"           # Es. "nomeapi-dev"
$PRODUCT_FILE = "product-$Env.json"  # Es. "product-dev.json"
$OPENAPI_FILE = "../openapi.yaml"       # Di solito lo Swagger è unico per tutti gli ambienti

# Verifica esistenza file di base
if (-not (Test-Path $PRODUCT_FILE)) {
    Write-Host "ERRORE CRITICO: File prodotto '$PRODUCT_FILE' non trovato." -ForegroundColor Red
    exit
}

$TOKEN = gcloud auth print-access-token
$Headers = @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" }
$prodJson = Get-Content $PRODUCT_FILE -Raw | ConvertFrom-Json
$ProductName = $prodJson.name

Write-Host "--- Sincronizzazione Apigee X: $ApiName ---" -ForegroundColor Cyan
Write-Host "    > Ambiente: $Env" -ForegroundColor Gray
Write-Host "    > Org:      $Org" -ForegroundColor Gray
Write-Host "    > Portale:  $TargetPortalId`n" -ForegroundColor Gray

# ==============================================================================
# [STEP 1] PRODOTTO API
# ==============================================================================
Write-Host "[1/3] Sincronizzazione Prodotto API ($ProductName)..." -ForegroundColor Yellow
$prodUrl = "https://apigee.googleapis.com/v1/organizations/$Org/apiproducts"

try {
    Invoke-RestMethod -Uri "$prodUrl/$ProductName" -Headers $Headers -Method Put -Body (Get-Content $PRODUCT_FILE -Raw) -ErrorAction Stop | Out-Null
    Write-Host "    > Prodotto aggiornato con successo." -ForegroundColor Green
} catch {
    Invoke-RestMethod -Uri $prodUrl -Headers $Headers -Method Post -Body (Get-Content $PRODUCT_FILE -Raw) | Out-Null
    Write-Host "    > Prodotto creato con successo." -ForegroundColor Green
}

# ==============================================================================
# [STEP 2] CATALOGO PORTALE (Ricerca con Paginazione)
# ==============================================================================
Write-Host "[2/3] Configurazione Catalogo Portale..." -ForegroundColor Yellow
$apiDocsUrl = "https://apigee.googleapis.com/v1/organizations/$Org/sites/$TargetPortalId/apidocs"
$docId = $null
$pageToken = ""
$trovato = $false

Write-Host "    > Ricerca dell'API nel catalogo (scansione pagine)..." -ForegroundColor Gray

do {
    $url = if ($pageToken) { "$apiDocsUrl`?pageToken=$pageToken" } else { $apiDocsUrl }
    try {
        $getList = Invoke-RestMethod -Uri $url -Headers $Headers -Method Get
        $listItems = if ($getList.data) { $getList.data } elseif ($getList.contents) { $getList.contents } else { $getList }
        
        if ($listItems) {
            foreach ($item in $listItems) {
                if ($item.apiProductName -eq $ProductName) {
                    $docId = if ($item.id) { $item.id } else { $item.name }
                    $trovato = $true
                    Write-Host "    > Voce esistente trovata! (ID Reale: $docId)" -ForegroundColor Green
                    break
                }
            }
        }
        $pageToken = $getList.nextPageToken
    } catch { break }
} while ($pageToken -and -not $trovato)

$docBody = @{
    apiProductName = $ProductName
    title          = $prodJson.displayName
    description    = $prodJson.description
    published      = $true
    anonAllowed    = $false
} | ConvertTo-Json

if ($trovato) {
    Write-Host "    > Aggiornamento metadati voce (PUT)..." -ForegroundColor Gray
    try {
        Invoke-RestMethod -Uri "$apiDocsUrl/$docId" -Headers $Headers -Method Put -Body $docBody -ErrorAction Stop | Out-Null
    } catch { Write-Host "    ! Errore aggiornamento metadati." -ForegroundColor Yellow }
} else {
    Write-Host "    > Creazione nuova voce nel catalogo (POST)..."
    try {
        $response = Invoke-RestMethod -Uri $apiDocsUrl -Headers $Headers -Method Post -Body $docBody -ErrorAction Stop
        $docId = if ($response.data -and $response.data.id) { $response.data.id } else { $response.id }
        Write-Host "    > Voce creata con successo! ID: $docId" -ForegroundColor Green
    } catch {
        Write-Host "ERRORE CREAZIONE CATALOGO: $_" -ForegroundColor Red; exit
    }
}

# ==============================================================================
# [STEP 3] UPLOAD DOCUMENTAZIONE
# ==============================================================================
Write-Host "[3/3] Upload Specifica OpenAPI..." -ForegroundColor Yellow
if ($docId) {
    $docUrl = "https://apigee.googleapis.com/v1/organizations/$Org/sites/$TargetPortalId/apidocs/$docId/documentation"
    $specBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $OPENAPI_FILE))
    $docPayload = @{ oasDocumentation = @{ spec = @{ displayName = $prodJson.displayName; contents = [Convert]::ToBase64String($specBytes) } } } | ConvertTo-Json -Depth 5

    try {
        Invoke-RestMethod -Uri $docUrl -Headers $Headers -Method Patch -Body $docPayload -ErrorAction Stop | Out-Null
        Write-Host "    > Specifica caricata/aggiornata." -ForegroundColor Green
    } catch { Write-Host "    ! Errore Upload Specifica." -ForegroundColor Red }
}


# ==============================================================================
# AVVISO MANUALE
# ==============================================================================
Write-Host "`n=====================================================================" -ForegroundColor Magenta
Write-Host " AZIONE MANUALE RICHIESTA (Limitazione API Google)" -ForegroundColor Yellow
Write-Host "=====================================================================" -ForegroundColor Magenta
Write-Host " 1. Apri la Google Cloud Console -> Apigee -> Publish -> Portals"
Write-Host " 2. Seleziona umbriadigitaledevportal (o prod) -> API Catalog"
Write-Host " 3. Cambia Audience da 'Selected audiences' a 'Authenticated Users'"
Write-Host "=====================================================================`n" -ForegroundColor Magenta