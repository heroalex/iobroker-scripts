const { SerialPort } = require('serialport');

// --- Configuration ---
const arduinoControlConfigs = [
    {
        ioBrokerId: 'javascript.' + instance + '.ShutterControlArduinoOG',
        serialPath: '/dev/ttyACM0',
        baudRate: 9600,
        portInstance: null,
        openDelay: 100, // ms to wait after port open before sending
        name: 'Arduino OG'
    },
    {
        ioBrokerId: 'javascript.' + instance + '.ShutterControlArduinoEG',
        serialPath: '/dev/ttyACM1',
        baudRate: 9600,
        portInstance: null,
        openDelay: 100,
        name: 'Arduino EG'
    }
];

log('Rollershutter Command Script Starting...');

// Function to initialize a single serial port
function initializePort(config) {
    log(`Attempting to initialize port ${config.serialPath} for ${config.name}`);
    try {
        config.portInstance = new SerialPort({
            path: config.serialPath,
            baudRate: config.baudRate,
            autoOpen: false
        });

        const port = config.portInstance;

        port.on('open', () => {
            log(`Port ${config.serialPath} for ${config.name} opened. isOpen: ${port.isOpen}.`);
            // Port is open, commands will be sent on demand with their own delay.
        });

        port.on('error', (err) => {
            log(`SerialPort Error for ${config.serialPath} (${config.name}): ${err.message}`, 'error');
        });

        port.on('close', () => {
            log(`Port ${config.serialPath} for ${config.name} closed. isOpen: ${port.isOpen}`);
        });

        port.on('data', (data) => {
            log(`Data received from ${config.serialPath} (${config.name}): ${data.toString().trim()}`);
        });

        port.open((err) => {
            if (err) {
                log(`Error opening port ${config.serialPath} (${config.name}): ${err.message}`, 'error');
            } else {
                log(`port.open() callback success for ${config.serialPath} (${config.name}). Waiting for 'open' event.`);
            }
        });
    } catch (e) {
        log(`Error initializing SerialPort object for ${config.serialPath} (${config.name}): ${e.message}`, 'error');
        config.portInstance = null;
    }
}

// Initialize all configured Arduino ports
arduinoControlConfigs.forEach(config => {
    initializePort(config);
});

// Function to send a command string to a specific Arduino config
function sendCommandToArduino(arduinoConfig, commandString) {
    if (!commandString || typeof commandString !== 'string' || commandString.trim() === "") {
        log(`Invalid or empty command for ${arduinoConfig.name}. Not sending.`, 'warn');
        return;
    }

    if (!arduinoConfig.portInstance || !arduinoConfig.portInstance.isOpen) {
        log(`Port ${arduinoConfig.serialPath} for ${arduinoConfig.name} is not open or not initialized. Command "${commandString.trim()}" not sent.`, 'warn');
        return;
    }

    const port = arduinoConfig.portInstance;
    const message = commandString.endsWith('\n') ? commandString : commandString + '\n'; // Ensure newline

    log(`Preparing to send to ${arduinoConfig.name} (${arduinoConfig.serialPath}): "${message.trim()}"`);

    // Delay before writing, allowing Arduino to be ready after port open or previous command
    setTimeout(() => {
        log(`Attempting to write "${message.trim()}" to ${arduinoConfig.name}`);
        port.write(message, (err) => {
            if (err) {
                log(`Error on write to ${arduinoConfig.name}: ${err.message}`, 'error');
            } else {
                log(`Message "${message.trim()}" written to ${arduinoConfig.name}`);
            }
        });
    }, arduinoConfig.openDelay); // Use the configured delay
}

// Subscribe to changes on the command objects
const idsToWatch = arduinoControlConfigs.map(config => config.ioBrokerId);

on({ id: idsToWatch, change: "ne" }, (obj) => {
    // obj.id is the full ID of the state that changed (e.g., javascript.0.ShutterControlArduinoOG)
    // obj.state.val is the new value (the command string, e.g., "O6:1\n")

    // Only process if the change was unacknowledged (ack=false)
    if (obj.state?.ack) {
        // This log is mostly for debugging to see acknowledged changes if needed.
        // You can comment it out or set its level to 'debug' for less noise in normal operation.
        // log(`Acknowledged change for ${obj.id}, value: "${obj.state.val}". Ignoring for command processing.`, 'debug');
        return; // Do nothing if the change was already acknowledged
    }

    const commandString = obj.state.val;
    log(`Command object ${obj.id} changed to: "${commandString}"`);

    if (!commandString || typeof commandString !== 'string' || commandString.trim() === "") {
        log(`Received empty or invalid command for ${obj.id}. Ignoring.`, 'info');
        // Optionally clear the state if it was an invalid command intended to be processed
        // setState(obj.id, "", true);
        return;
    }

    const targetConfig = arduinoControlConfigs.find(config => config.ioBrokerId === obj.id);

    if (targetConfig) {
        sendCommandToArduino(targetConfig, commandString);
        // Important: Clear the command object after processing to prevent re-sending on script restart
        // and to make it ready for a new command.
        setState(obj.id, "", true); // value, ack
    } else {
        log(`No Arduino configuration found for ioBroker ID ${obj.id}`, 'warn');
    }
});

// Script stop handler
onStop(function (callback) {
    log('Rollershutter Command Script stopping. Closing all ports.');
    let openPorts = arduinoControlConfigs.filter(c => c.portInstance && c.portInstance.isOpen).length;
    let closedCount = 0;

    if (openPorts === 0) {
        log('No ports were open to close.');
        if (callback) callback();
        return;
    }

    arduinoControlConfigs.forEach(config => {
        if (config.portInstance && config.portInstance.isOpen) {
            config.portInstance.close((err) => {
                closedCount++;
                if (err) {
                    log(`Error closing port ${config.serialPath} (${config.name}) on stop: ${err.message}`, 'error');
                } else {
                    log(`Port ${config.serialPath} (${config.name}) closed successfully on stop.`);
                }
                if (closedCount === openPorts) {
                    log('All open ports processed for closing.');
                    if (callback) callback();
                }
            });
        }
    });
    // Give a timeout for closing
}, 2000);

log('Rollershutter Command Script initialized and listening for commands on configured objects.');