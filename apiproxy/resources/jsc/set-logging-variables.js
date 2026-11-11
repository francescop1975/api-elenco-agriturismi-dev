/**
 * API proxy timing and logging script
 * Extracts all logging data into custom variables for reliable JSON logging
 */

/** @constant {boolean} DEBUG - Set to false to disable debug logging */
var DEBUG = true;

/**
 * Centralized logging function that gets optimized away when DEBUG is false.
 * @param {string} message - The message to log.
 * @param {*} [data] - Optional data to log.
 */
var log = DEBUG ? function (message, data) {
    print(message + (data !== undefined ? JSON.stringify(data, null, 2) : ''));
} : function () {
};

/**
 * Safe variable extraction with fallback values
 * @param {string} variableName - Name of the context variable to extract
 * @param {*} [defaultValue=''] - Default value if variable is null/undefined
 * @returns {*} Variable value or default
 */
function safeGetVariable(variableName, defaultValue) {
    try {
        var value = context.getVariable(variableName);
        return (value !== null && value !== undefined) ? value : (defaultValue || '');
    } catch (e) {
        log('Error getting variable ' + variableName + ':', e.message);
        return defaultValue || '';
    }
}

/**
 * Safe variable setting with error handling
 * @param {string} variableName - Name of the context variable to set
 * @param {*} value - Value to set
 */
function safeSetVariable(variableName, value) {
    try {
        context.setVariable(variableName, value);
        log('Set variable ' + variableName + ':', value);
    } catch (e) {
        log('Error setting variable ' + variableName + ':', e.message);
    }
}

/**
 * Calculates target server timing metrics.
 * @param {number} startTimestamp - Start timestamp from target.sent.start.timestamp
 * @param {number} endTimestamp - End timestamp from target.received.end.timestamp
 * @returns {number} Time delta in milliseconds
 */
function calculateTargetTiming(startTimestamp, endTimestamp) {
    log('Calculating target server timing');
    var delta = endTimestamp - startTimestamp;
    log('Target server elapsed time:', delta);
    return delta;
}

/**
 * Calculates total request timing metrics.
 * @param {number} startTimestamp - Start timestamp from client.received.start.timestamp
 * @param {number} endTimestamp - End timestamp from system.timestamp
 * @returns {Object} Object containing total elapsed time and microseconds conversion
 */
function calculateTotalTiming(startTimestamp, endTimestamp) {
    log('Calculating total request timing');
    var delta = endTimestamp - startTimestamp;
    log('Total request elapsed time:', delta);

    var microSeconds = delta * 1000;
    log('Request time in microseconds:', microSeconds);

    return {
        elapsed: delta,
        microSeconds: microSeconds
    };
}

/**
 * Extracts all logging variables and sets them as custom context variables
 * This ensures all fields are available even when errors occur
 */
function extractAndSetLoggingVariables() {
    log('Extracting and setting all logging variables');

    // API and Environment Info
    safeSetVariable('customApiProxyName', safeGetVariable('apiproxy.name'));
    safeSetVariable('customEnvironment', safeGetVariable('environment.name'));
    safeSetVariable('customOrganization', safeGetVariable('organization.name'));
    safeSetVariable('customMessageId', safeGetVariable('messageid'));

    // Client Timing Variables
    safeSetVariable('clientReceivedStartTime', safeGetVariable('client.received.start.time'));
    safeSetVariable('clientReceivedStartTimestamp', safeGetVariable('client.received.start.timestamp'));
    safeSetVariable('clientReceivedEndTimestamp', safeGetVariable('client.received.end.timestamp'));
    safeSetVariable('clientSentStartTimestamp', safeGetVariable('client.sent.start.timestamp'));
    safeSetVariable('clientSentEndTimestamp', safeGetVariable('client.sent.end.timestamp'));

    // Request Variables
    safeSetVariable('requestHeaders', safeGetVariable('request.headers.names.string'));
    safeSetVariable('requestVerb', safeGetVariable('request.verb'));
    safeSetVariable('requestContent', safeGetVariable('request.content'));
    safeSetVariable('requestHost', safeGetVariable('request.header.host'));
    safeSetVariable('xRequestId', safeGetVariable('request.header.x-request-id'));
    safeSetVariable('customDecodedURL', safeGetVariable('decodedURL'));

    // Proxy Variables
    safeSetVariable('proxyBasepath', safeGetVariable('proxy.basepath'));
    safeSetVariable('proxyPathsuffix', safeGetVariable('proxy.pathsuffix'));

    // Target Variables
    safeSetVariable('targetName', safeGetVariable('target.name'));
    safeSetVariable('targetHost', safeGetVariable('target.host'));
    safeSetVariable('targetUrl', safeGetVariable('target.url'));
    safeSetVariable('targetBasepath', safeGetVariable('target.basepath'));
    safeSetVariable('targetReceivedStartTimestamp', safeGetVariable('target.received.start.timestamp'));
    safeSetVariable('targetReceivedEndTime', safeGetVariable('target.received.end.time'));
    safeSetVariable('targetReceivedEndTimestamp', safeGetVariable('target.received.end.timestamp'));
    safeSetVariable('targetSentStartTimestamp', safeGetVariable('target.sent.start.timestamp'));
    safeSetVariable('targetSentEndTimestamp', safeGetVariable('target.sent.end.timestamp'));

    // Response Variables
    safeSetVariable('responseContent', safeGetVariable('message.content'));
    safeSetVariable('httpStatusCode', safeGetVariable('message.status.code'));

    // System Variables
    safeSetVariable('systemTimestamp', safeGetVariable('system.timestamp'));

    // Error Information
    safeSetVariable('errorMessage', safeGetVariable('error.message'));
    safeSetVariable('errorCode', safeGetVariable('error.status.code'));
    safeSetVariable('errorStep', safeGetVariable('error.state'));
    safeSetVariable('isError', safeGetVariable('is.error'));

    // PDND
    var traceContext = safeGetVariable('request.header.x-cloud-trace-context');
    var gTraceId = '';
    if (traceContext) {
        gTraceId = traceContext.split('/')[0]; // Prende solo la parte prima di "/"
    }
    safeSetVariable('apigeeTrackingId', gTraceId);
    var bPath = safeGetVariable('proxy.basepath') || '';
    var pSuffix = safeGetVariable('proxy.pathsuffix') || '';
    safeSetVariable('customRequestPath', bPath + pSuffix);
    safeSetVariable('xForwardedFor', safeGetVariable('request.header.x-forwarded-for'));

    log('All logging variables extracted and set successfully');
}

// Main execution
try {
    log('Starting enhanced logging script execution');

    // First, extract all variables to custom context variables
    extractAndSetLoggingVariables();

    var startTime, endTime, timeDelta;

    // Calculate target server timing
    startTime = safeGetVariable('target.sent.start.timestamp');
    endTime = safeGetVariable('target.received.end.timestamp');

    if (startTime && endTime) {
        timeDelta = calculateTargetTiming(startTime, endTime);
        safeSetVariable('targetServerElapsed', timeDelta);
    } else {
        log('Target timing calculation skipped - missing timestamps');
        safeSetVariable('targetServerElapsed', 0);
    }

    // Calculate total request timing and microseconds
    startTime = safeGetVariable('client.received.start.timestamp');
    endTime = safeGetVariable('system.timestamp');

    if (startTime && endTime) {
        var timingResults = calculateTotalTiming(startTime, endTime);
        safeSetVariable('timeTotalElapsed', timingResults.elapsed);
        safeSetVariable('timeTakenToServeRequest', timingResults.microSeconds);
    } else {
        log('Total timing calculation skipped - missing timestamps');
        safeSetVariable('timeTotalElapsed', 0);
        safeSetVariable('timeTakenToServeRequest', 0);
    }

    // Set backward compatibility variables
    safeSetVariable('currentProxyName', safeGetVariable('customApiProxyName'));
    safeSetVariable('currentEnvironment', safeGetVariable('customEnvironment'));

    // Create request URL with fallback logic
    var requestUrl = safeGetVariable('customDecodedURL') || safeGetVariable('requestHost') + safeGetVariable('proxyBasepath') + safeGetVariable('proxyPathsuffix') || '';
    safeSetVariable('finalRequestUrl', requestUrl);

    log('Enhanced logging script completed successfully');

} catch (error) {
    log('Error in main execution:', error.message);

    // Set fallback values in case of script error
    safeSetVariable('targetServerElapsed', 0);
    safeSetVariable('timeTotalElapsed', 0);
    safeSetVariable('timeTakenToServeRequest', 0);
    safeSetVariable('scriptError', error.message);
}