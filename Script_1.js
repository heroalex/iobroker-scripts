const { SerialPort } = require('serialport');

const portPath = '/dev/ttyACM0';
const baudRate = 9600;
let port;

console.log(`hello 1 - Script starting. Attempting to use ${portPath}`);

try {
    port = new SerialPort({
        path: portPath,
        baudRate: baudRate,
        autoOpen: false // Good practice
    });

    port.on('open', () => {
        console.log(`Port ${portPath} opened. isOpen: ${port.isOpen}`);
        // *** ADD DELAY HERE ***
        console.log('Port opened. Waiting 2 seconds before sending data...');
        setTimeout(() => {
            console.log('Attempting to write to Arduino...');
            const message = "O6:1\n"; // Ensure newline if Arduino expects it
            port.write(message, (err) => {
                if (err) {
                    return console.error('Error on write: ', err.message);
                }
                console.log(`Message "${message.trim()}" written to Arduino`);
            });
        }, 1000); // 1000 milliseconds = 1 seconds. Adjust as needed.
    });

    port.on('error', (err) => {
        console.error(`SerialPort Error for ${portPath}: `, err.message);
    });

    port.on('close', () => {
        console.log(`Port ${portPath} closed. isOpen: ${port.isOpen}`);
    });

    // Listen for any data coming FROM the Arduino (for debugging)
    port.on('data', (data) => {
        console.log('Data received from Arduino:', data.toString());
    });

    port.open((err) => {
        if (err) {
            console.error(`Error opening port ${portPath}: ${err.message}`);
            console.log(`After failed open attempt, port.isOpen: ${port ? port.isOpen : 'port not initialized'}`);
        } else {
            console.log(`port.open() callback success for ${portPath}. Waiting for 'open' event.`);
        }
    });

    console.log(`Initial port.isOpen (after new SerialPort, before explicit open call): ${port.isOpen}`);

} catch (e) {
    console.error("Error initializing SerialPort object: ", e.message);
}

onStop(function (callback) {
    console.log('Script stopping. Closing port if open.');
    if (port && port.isOpen) {
        port.close((err) => {
            if (err) {
                console.error('Error closing port on stop:', err.message);
            } else {
                console.log('Port closed successfully on stop.');
            }
            callback();
        });
    } else {
        if (port) {
            console.log('Port was not open, no need to close.');
        } else {
            console.log('Port object was not even initialized.');
        }
        callback();
    }
}, 2000);