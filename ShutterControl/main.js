const { SerialPort } = require('serialport');

// --- Configuration ---
const arduinoConfigs = [
    {
        path: '/dev/ttyACM0', // Arduino 1
        baudRate: 9600,
        shutters: [0, 1, 2, 3, 4, 5, 6, 7], // Global shutter IDs this Arduino handles
        portInstance: null,
        openDelay: 1000 // Milliseconds to wait after port open before sending data
    },
    {
        path: '/dev/ttyACM1', // Arduino 2
        baudRate: 9600,
        shutters: [8, 9, 10, 11, 12, 13, 14], // Global shutter IDs this Arduino handles
        portInstance: null,
        openDelay: 1000
    }
];

const iobrokerBaseId = 'javascript.' + instance + '.Rollershutters.'; // Adjust if your objects are elsewhere

// --- End Configuration ---

log('Rollershutter Control Script Starting...');

// Function to initialize a single serial port
function initializePort(config) {
    log(`Attempting to initialize port ${config.path}`);
    try {
        config.portInstance = new SerialPort({
            path: config.path,
            baudRate: config.baudRate,
            autoOpen: false
        });

        const port = config.portInstance;

        port.on('open', () => {
            log(`Port ${config.path} opened. isOpen: ${port.isOpen}. Waiting ${config.openDelay}ms before ready.`);
            // The port is open, but Arduino might need time to reset.
            // We won't send immediately, but mark it as ready after a delay.
            // Actual sending will happen on demand.
        });

        port.on('error', (err) => {
            log(`SerialPort Error for ${config.path}: ${err.message}`, 'error');
        });

        port.on('close', () => {
            log(`Port ${config.path} closed. isOpen: ${port.isOpen}`);
        });

        port.on('data', (data) => {
            log(`Data received from ${config.path}: ${data.toString().trim()}`);
        });

        port.open((err) => {
            if (err) {
                log(`Error opening port ${config.path}: ${err.message}`, 'error');
            } else {
                log(`port.open() callback success for ${config.path}. Waiting for 'open' event.`);
            }
        });
        log(`Initial port.isOpen for ${config.path} (after new SerialPort, before explicit open call): ${port.isOpen}`);

    } catch (e) {
        log(`Error initializing SerialPort object for ${config.path}: ${e.message}`, 'error');
        config.portInstance = null; // Ensure it's null if initialization failed
    }
}

// Initialize all configured Arduino ports
arduinoConfigs.forEach(config => {
    initializePort(config);
});

// Function to send a command to the correct Arduino
function sendRollerShutterCommand(globalShutterId, action) { // action: 0 for close, 1 for open
    let targetArduinoConfig = null;
    let arduinoLocalShutterId = -1;

    for (const config of arduinoConfigs) {
        const indexInConfig = config.shutters.indexOf(globalShutterId);
        if (indexInConfig !== -1) {
            targetArduinoConfig = config;
            // Assuming Arduinos expect 0-indexed shutter IDs relative to themselves
            // e.g., if Arduino 1 handles [0,1,2,3], global shutter 2 is local shutter 2.
            // if Arduino 2 handles [4,5,6,7], global shutter 4 is local shutter 0 for Arduino 2.
            arduinoLocalShutterId = globalShutterId - config.shutters[0];
            break;
        }
    }

    if (!targetArduinoConfig) {
        log(`No Arduino configured for global shutter ID ${globalShutterId}`, 'warn');
        return;
    }

    if (!targetArduinoConfig.portInstance || !targetArduinoConfig.portInstance.isOpen) {
        log(`Port ${targetArduinoConfig.path} for shutter ${globalShutterId} is not open or not initialized. Command not sent.`, 'warn');
        return;
    }

    const port = targetArduinoConfig.portInstance;
    const message = `O${arduinoLocalShutterId}:${action}\n`;

    log(`Preparing to send to ${targetArduinoConfig.path}: ShutterGlobal ${globalShutterId} (Local ${arduinoLocalShutterId}), Action ${action}`);

    // Add delay specific to sending, ensuring port is truly ready after 'open' event + Arduino reset
    setTimeout(() => {
        log(`Attempting to write "${message.trim()}" to ${targetArduinoConfig.path}`);
        port.write(message, (err) => {
            if (err) {
                log(`Error on write to ${targetArduinoConfig.path}: ${err.message}`, 'error');
            } else {
                log(`Message "${message.trim()}" written to ${targetArduinoConfig.path} for shutter ${globalShutterId}`);
            }
        });
    }, targetArduinoConfig.openDelay); // Use the configured delay
}

// Subscribe to all button changes
const buttonPattern = new RegExp(`^${iobrokerBaseId.replace(/\./g, '\\.')}Shutter_(\\d+)\\.(OpenButton|CloseButton)$`);

on({ id: buttonPattern, change: "ne", val: true }, (obj) => {
    // obj.id is the full ID of the state that changed, e.g., javascript.0.Rollershutters.Shutter_0.OpenButton
    // obj.state.val is the new value (should be true for a button press)

    log(`Button pressed: ${obj.id}`);

    const match = obj.id.match(buttonPattern);
    if (match) {
        const globalShutterId = parseInt(match[1]); // "0" from "Shutter_0"
        const buttonType = match[2]; // "OpenButton" or "CloseButton"

        let action; // 0 for close, 1 for open
        if (buttonType === "OpenButton") {
            action = 1;
        } else if (buttonType === "CloseButton") {
            action = 0;
        } else {
            log(`Unknown button type: ${buttonType} for ID ${obj.id}`, 'warn');
            return;
        }

        log(`Triggered: Global Shutter ID ${globalShutterId}, Action: ${action === 1 ? 'OPEN' : 'CLOSE'}`);
        sendRollerShutterCommand(globalShutterId, action);

        // Optional: Reset the button state back to false after a short delay
        // This makes it behave more like a stateless button in visualizations
        setTimeout(() => {
            setState(obj.id, false, true); // value, ack
        }, 200);
    }
});

// Script stop handler
onStop(function (callback) {
    log('Rollershutter Control Script stopping. Closing all ports.');
    let openPorts = 0;
    let closedPorts = 0;

    arduinoConfigs.forEach(config => {
        if (config.portInstance && config.portInstance.isOpen) {
            openPorts++;
            config.portInstance.close((err) => {
                if (err) {
                    log(`Error closing port ${config.path} on stop: ${err.message}`, 'error');
                } else {
                    log(`Port ${config.path} closed successfully on stop.`);
                }
                closedPorts++;
                if (closedPorts === openPorts) {
                    log('All open ports processed for closing.');
                    if (callback) callback();
                }
            });
        }
    });

    if (openPorts === 0) {
        log('No ports were open to close.');
        if (callback) callback();
    }
    // Give a timeout for closing, e.g., 2000ms
}, 2000);

log('Rollershutter Control Script initialized and listening for button presses.');