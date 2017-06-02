import TCPDevice from './TCPDevice';

const serverUrl = '192.168.0.175';

const device = new TCPDevice(serverUrl, 5683);

device.connect();
console.log('foobar');
