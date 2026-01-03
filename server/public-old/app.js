// WebSocket connection
let ws = null;
let lights = [];

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        addLog('Connected to server');
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(initWebSocket, 3000); // Reconnect after 3 seconds
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'midi':
            addMidiActivity(message.data);
            break;
        case 'lightControlled':
            addLog(`Light ${message.data.lightId} controlled by MIDI note ${message.data.midiMessage.note}`);
            break;
        case 'error':
            showError(message.data.message);
            break;
    }
}

// API calls
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`/api${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'API request failed');
    }

    return data;
}

// MIDI Functions
async function refreshMidiPorts() {
    try {
        const data = await apiCall('/midi/ports');
        const container = document.getElementById('midi-ports');

        if (data.ports.length === 0) {
            container.innerHTML = '<p>No MIDI ports found</p>';
        } else {
            container.innerHTML = '<strong>Available Ports:</strong><br>' +
                data.ports.map(port =>
                    `<button onclick="connectMidiPort('${port}')">${port}</button>`
                ).join('');
        }
    } catch (error) {
        showError('Failed to refresh MIDI ports: ' + error.message);
    }
}

async function openVirtualPort() {
    try {
        const data = await apiCall('/midi/port', 'POST', {});
        document.getElementById('midi-status').textContent = data.port;
        document.getElementById('midi-status').className = 'status connected';
        showSuccess('Virtual MIDI port created: ' + data.port);
    } catch (error) {
        showError('Failed to create virtual port: ' + error.message);
    }
}

async function connectMidiPort(portName) {
    try {
        const data = await apiCall('/midi/port', 'POST', { portName });
        document.getElementById('midi-status').textContent = data.port;
        document.getElementById('midi-status').className = 'status connected';
        showSuccess('Connected to MIDI port: ' + data.port);
    } catch (error) {
        showError('Failed to connect to MIDI port: ' + error.message);
    }
}

// Hue Bridge Functions
async function discoverBridges() {
    try {
        document.getElementById('bridge-list').innerHTML = '<p>Discovering bridges...</p>';
        const data = await apiCall('/hue/bridges');
        const container = document.getElementById('bridge-list');

        if (data.bridges.length === 0) {
            container.innerHTML = '<p>No bridges found. Make sure your bridge is on the same network.</p>';
        } else {
            container.innerHTML = '<strong>Found Bridges:</strong><br>' +
                data.bridges.map(bridge =>
                    `<div style="margin: 10px 0;">
                        <strong>${bridge.ipaddress}</strong>
                        <button onclick="setupBridge('${bridge.ipaddress}')">Setup</button>
                    </div>`
                ).join('');
        }
    } catch (error) {
        showError('Failed to discover bridges: ' + error.message);
    }
}

async function setupBridge(bridgeIp) {
    try {
        showSuccess('Press the link button on your Hue Bridge, then wait...');
        const data = await apiCall('/hue/bridge/user', 'POST', { bridgeIp });

        // Connect with the new username
        await apiCall('/hue/bridge/connect', 'POST', {
            bridgeIp,
            username: data.username
        });

        document.getElementById('hue-status').textContent = 'Connected';
        document.getElementById('hue-status').className = 'status connected';
        showSuccess('Connected to Hue Bridge!');

        // Refresh lights
        refreshLights();
    } catch (error) {
        showError('Failed to setup bridge: ' + error.message);
    }
}

// Bluetooth Functions
async function refreshBluetoothStatus() {
    try {
        const data = await apiCall('/hue/bluetooth/status');
        const statusEl = document.getElementById('bluetooth-status');

        if (data.ready) {
            if (data.connected) {
                statusEl.textContent = `Connected (${data.connectedLights.length} lights)`;
                statusEl.className = 'status connected';
            } else {
                statusEl.textContent = 'Ready (Not Connected)';
                statusEl.className = 'status pending';
            }
        } else {
            statusEl.textContent = 'Not Available';
            statusEl.className = 'status disconnected';
        }
    } catch (error) {
        showError('Failed to check Bluetooth status: ' + error.message);
    }
}

async function scanBluetoothLights() {
    try {
        document.getElementById('bluetooth-lights').innerHTML = '<p>Scanning for Bluetooth lights... This may take 10 seconds.</p>';
        const data = await apiCall('/hue/bluetooth/scan', 'POST', { duration: 10000 });

        const container = document.getElementById('bluetooth-lights');

        if (data.lights.length === 0) {
            container.innerHTML = '<p>No Bluetooth lights found. Make sure lights are powered on and Bluetooth is enabled.</p>';
        } else {
            container.innerHTML = '<strong>Found Lights:</strong><br>' +
                data.lights.map(light => `
                    <div style="margin: 10px 0;">
                        <strong>${light.name}</strong> (${light.type})
                        <button onclick="connectBluetoothLight('${light.id}')">Connect</button>
                    </div>
                `).join('');
            showSuccess(`Found ${data.lights.length} Bluetooth light(s)`);
        }
    } catch (error) {
        document.getElementById('bluetooth-lights').innerHTML = '';
        showError('Failed to scan for Bluetooth lights: ' + error.message);
    }
}

async function connectBluetoothLight(lightId) {
    try {
        showSuccess('Connecting to light...');
        await apiCall('/hue/bluetooth/connect', 'POST', { lightId });
        showSuccess('Connected to Bluetooth light!');

        // Update status and refresh lights
        refreshBluetoothStatus();
        refreshLights();
    } catch (error) {
        showError('Failed to connect to light: ' + error.message);
    }
}

async function disconnectBluetoothLight(lightId) {
    try {
        await apiCall('/hue/bluetooth/disconnect', 'POST', { lightId });
        showSuccess('Disconnected from Bluetooth light');
        refreshBluetoothStatus();
    } catch (error) {
        showError('Failed to disconnect: ' + error.message);
    }
}

// Light Functions
async function refreshLights() {
    try {
        // Get lights from both Bridge and Bluetooth
        let allLights = [];

        // Try to get Bridge lights
        try {
            const bridgeData = await apiCall('/hue/lights');
            allLights = allLights.concat(bridgeData.lights);
        } catch (e) {
            // Bridge not connected, that's okay
        }

        // Try to get Bluetooth lights
        try {
            const btData = await apiCall('/hue/bluetooth/lights');
            allLights = allLights.concat(btData.lights);
        } catch (e) {
            // Bluetooth not connected, that's okay
        }

        lights = allLights;

        const container = document.getElementById('lights-grid');

        if (lights.length === 0) {
            container.innerHTML = '<p>No lights found. Connect to your Hue Bridge first.</p>';
        } else {
            container.innerHTML = lights.map(light => `
                <div class="light-card">
                    <h3>${light.name}</h3>
                    <p>Type: ${light.type}</p>
                    <p>ID: ${light.id}</p>
                    <button onclick="testLight('${light.id}', true)">Turn On</button>
                    <button onclick="testLight('${light.id}', false)">Turn Off</button>
                </div>
            `).join('');
        }

        // Update light select in mapping modal
        updateLightSelect();
    } catch (error) {
        showError('Failed to refresh lights: ' + error.message);
    }
}

function updateLightSelect() {
    const select = document.getElementById('light-select');
    select.innerHTML = lights.map(light =>
        `<option value="${light.id}">${light.name} (${light.type})</option>`
    ).join('');
}

async function testLight(lightId, on) {
    try {
        await apiCall('/test/light', 'POST', {
            lightId,
            state: { on, brightness: 254, transitionTime: 2 }
        });
        addLog(`Test: Light ${lightId} turned ${on ? 'on' : 'off'}`);
    } catch (error) {
        showError('Failed to test light: ' + error.message);
    }
}

// Mapping Functions
async function refreshMappings() {
    try {
        const data = await apiCall('/mappings');
        const container = document.getElementById('mappings-list');

        if (data.mappings.length === 0) {
            container.innerHTML = '<p>No mappings configured. Add one to get started!</p>';
        } else {
            container.innerHTML = data.mappings.map(mapping => {
                const light = lights.find(l => l.id === mapping.lightId);
                const lightName = light ? light.name : `Light ${mapping.lightId}`;

                return `
                    <div class="mapping-item">
                        <div class="mapping-info">
                            <span class="badge">Ch ${mapping.midiChannel}</span>
                            <span class="badge">Note ${mapping.midiNote}</span>
                            <strong>${lightName}</strong> - ${mapping.action.type}
                        </div>
                        <button onclick="removeMapping(${mapping.midiChannel}, ${mapping.midiNote})" class="danger">Remove</button>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        showError('Failed to refresh mappings: ' + error.message);
    }
}

function openMappingModal() {
    if (lights.length === 0) {
        showError('Please connect to Hue Bridge and refresh lights first');
        return;
    }
    document.getElementById('mapping-modal').classList.add('active');
}

function closeMappingModal() {
    document.getElementById('mapping-modal').classList.remove('active');
}

function updateActionFields() {
    const actionType = document.getElementById('action-type').value;
    const colorFields = document.getElementById('color-fields');
    const effectFields = document.getElementById('effect-fields');

    if (actionType === 'color') {
        colorFields.style.display = 'block';
        effectFields.style.display = 'none';
    } else if (actionType === 'effect') {
        colorFields.style.display = 'none';
        effectFields.style.display = 'block';
    } else {
        colorFields.style.display = 'none';
        effectFields.style.display = 'none';
    }
}

async function addMapping(event) {
    event.preventDefault();

    try {
        const mapping = {
            midiChannel: parseInt(document.getElementById('midi-channel').value),
            midiNote: parseInt(document.getElementById('midi-note').value),
            lightId: document.getElementById('light-select').value,
            action: {
                type: document.getElementById('action-type').value,
                brightnessMode: document.getElementById('brightness-mode').value,
                fixedBrightness: parseInt(document.getElementById('fixed-brightness').value),
                transitionTime: parseInt(document.getElementById('transition-time').value)
            }
        };

        if (mapping.action.type === 'color') {
            mapping.action.colorHue = parseInt(document.getElementById('color-hue').value);
            mapping.action.colorSat = parseInt(document.getElementById('color-sat').value);
        } else if (mapping.action.type === 'effect') {
            mapping.action.effect = document.getElementById('effect-type').value;
        }

        await apiCall('/mappings', 'POST', mapping);
        closeMappingModal();
        refreshMappings();
        showSuccess('Mapping added successfully!');
    } catch (error) {
        showError('Failed to add mapping: ' + error.message);
    }
}

async function removeMapping(channel, note) {
    try {
        await apiCall(`/mappings/${channel}/${note}`, 'DELETE');
        refreshMappings();
        showSuccess('Mapping removed');
    } catch (error) {
        showError('Failed to remove mapping: ' + error.message);
    }
}

async function clearMappings() {
    if (!confirm('Are you sure you want to clear all mappings?')) {
        return;
    }

    try {
        await apiCall('/mappings/clear', 'POST');
        refreshMappings();
        showSuccess('All mappings cleared');
    } catch (error) {
        showError('Failed to clear mappings: ' + error.message);
    }
}

// Activity Monitor
function addMidiActivity(message) {
    const log = document.getElementById('activity-log');
    const entry = document.createElement('div');
    entry.className = 'midi-message';
    entry.textContent = `MIDI: Ch ${message.channel} Note ${message.note} Vel ${message.velocity}`;
    log.insertBefore(entry, log.firstChild);

    // Keep only last 50 entries
    while (log.children.length > 50) {
        log.removeChild(log.lastChild);
    }
}

function addLog(message) {
    const log = document.getElementById('activity-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    log.insertBefore(entry, log.firstChild);

    while (log.children.length > 50) {
        log.removeChild(log.lastChild);
    }
}

// UI Helpers
function showError(message) {
    const container = document.querySelector('.container');
    const error = document.createElement('div');
    error.className = 'error';
    error.textContent = message;
    container.insertBefore(error, container.firstChild);
    setTimeout(() => error.remove(), 5000);
}

function showSuccess(message) {
    const container = document.querySelector('.container');
    const success = document.createElement('div');
    success.className = 'success';
    success.textContent = message;
    container.insertBefore(success, container.firstChild);
    setTimeout(() => success.remove(), 5000);
}

// Initialize on page load
window.addEventListener('load', () => {
    initWebSocket();
    refreshMappings();
    refreshBluetoothStatus();
});
