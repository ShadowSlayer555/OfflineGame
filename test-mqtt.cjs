const mqtt = require('mqtt');
const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
client.on('connect', () => {
    console.log('Connected to MQTT');
    client.end();
});
client.on('error', (e) => {
    console.log('Error', e);
    client.end();
});
