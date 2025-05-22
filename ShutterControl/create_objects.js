return;
// ONE-TIME SCRIPT to create objects
const baseId = 'javascript.' + instance + '.Rollershutters.';


function createShutterObjects(shutterNum) {
    const shutterBaseId = baseId + 'Shutter_' + shutterNum + '.';

    createState(shutterBaseId + 'OpenButton', false, {
        name: 'Shutter ' + shutterNum + ' Open',
        type: 'boolean',
        role: 'button.open.blind',
        read: false,
        write: true,
        def: false
    });

    createState(shutterBaseId + 'CloseButton', false, {
        name: 'Shutter ' + shutterNum + ' Close',
        type: 'boolean',
        role: 'button.close.blind',
        read: false,
        write: true,
        def: false
    });
    log('Created objects for Shutter ' + shutterNum);
}

for (let i = 0; i < 17; i++) {
    createShutterObjects(i);
}
log('Object creation finished.');