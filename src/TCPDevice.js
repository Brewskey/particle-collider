// @flow

import CoapPacket from 'coap-packet';
import {Socket} from 'net';
import NodeRSA from 'node-rsa';

import ChunkingStream from './lib/ChunkingStream';
import CoapType from './lib/CoapType';
import CoapUriType from './lib/CoapUriType';
import CryptoManager from './lib/CryptoManager';
import CryptoStream from './lib/CryptoStream';

const DEVICE_KEY_LENGTH = 12;

// TODO - Fill in real values here. We can just use whatever is in the photon.
const PRODUCT_ID = 0;
const PRODUCT_FIRMWARE_VERSION = 0;
const PLATFORM_ID = 0;
const COAP_VERSION = 1;

const DESCRIBE_APPLICATION = 1 << 1;
const DESCRIBE_SYSTEM = 1 << 0;
const DESCRIBE_ALL = DESCRIBE_APPLICATION | DESCRIBE_SYSTEM;

type DeviceState =
  | 'next'
  | 'nonce'
  | 'set-session-key';

class TCPDevice {
  _cipherStream: CryptoStream;
  _decipherStream: CryptoStream;
  _deviceID: Buffer;
  _messageID: number = 0;
  _port: number;
  _privateKey: NodeRSA;
  _serverAddress: string;
  _serverKey: NodeRSA;
  _socket: Socket;
  _state: DeviceState;
  _token: Buffer;

  constructor(serverAddress: string, port: number) {
    this._state = 'nonce';
    this._serverAddress = serverAddress;
    this._port = port;
    this._socket = new Socket();
    this._privateKey = CryptoManager.createKey();
    this._serverKey = CryptoManager.getServerKey();

    // Generate random device key
    this._deviceID = CryptoManager.randomBytes(DEVICE_KEY_LENGTH);
  }

  connect(): void {
    this._socket.connect({
      host: this._serverAddress,
      port: this._port,
    });

    this._socket.on(
      'data',
      this._onReadData,
    );
  }

  _onReadData = (data: Buffer): void => {
    switch (this._state) {
      case 'nonce': {
        const payload = this._prepareDevicePublicKey(data);
        this._socket.write(this._serverKey.encrypt(payload));
        this._state = 'set-session-key';
        break;
      }

      case 'set-session-key': {
        const cipherText = data.slice(0, 128);
        const signedHMAC = data.slice(128);

        const sessionKey = this._privateKey.decrypt(cipherText);
        // Server creates a 20-byte HMAC of the ciphertext using SHA1 and the 40
        // bytes generated in the previous step as the HMAC key.
        const hash = CryptoManager.createHmacDigest(
          cipherText,
          sessionKey,
        );

        const decryptedHMAC = this._serverKey.decryptPublic(signedHMAC);

        if (hash.compare(decryptedHMAC) === -1) {
          throw new Error('HMAC did not match');
        }

        // The random session key has everything we need to create the crypto
        // streams
        const key = sessionKey.slice(0, 16);
        const iv = sessionKey.slice(16, 32);
        const salt = sessionKey.slice(32); // not sure what this is for...

        this._messageID = sessionKey[32] << 8 | sessionKey[33];
        this._token = sessionKey.slice(34);

        // Create the crypto streams
        this._decipherStream = new CryptoStream({
          iv,
          key,
          streamType: 'decrypt',
        });
        this._cipherStream = new CryptoStream({
          iv,
          key,
          streamType: 'encrypt',
        });

        const chunkingIn = new ChunkingStream({ outgoing: false });
        const chunkingOut = new ChunkingStream({ outgoing: true });

        // What I receive gets broken into message chunks, and goes into the
        // decrypter
        this._socket.pipe(chunkingIn);
        chunkingIn.pipe(this._decipherStream);

        // What I send goes into the encrypter, and then gets broken into message
        // chunks
        this._cipherStream.pipe(chunkingOut);
        chunkingOut.pipe(this._socket);

        this._socket.removeListener('data', this._onReadData);
        this._decipherStream.on('data', this._onNewCoapMessage);

        this._sendHello();

        this._state = 'next';

        // Ping every 10 seconds
        setInterval(() => this._pingServer(), 10000);
        break;
      }

      default: {
        console.log('do the next thing', data);
      }
    }
  }

  _onNewCoapMessage = (data: Buffer): void => {
    const packet = CoapPacket.parse(data);
    const uriOption = packet.options.find(option => option.name === 'Uri-Path');
    if (!uriOption) {
      return;
    }
    const path = uriOption.value.toString('utf8');
    const payload = packet.payload;
    switch (path) {
      case CoapUriType.Describe: {
        let descriptionFlags = DESCRIBE_ALL;
        if (payload.length > 8 && payload[8] <= DESCRIBE_ALL) {
          descriptionFlags = payload[8];
        } else if (payload.length > 8) {
          console.error(`Invalid DESCRIBE flags ${payload[8]}`);
        }

        this._sendDescribe(descriptionFlags, packet);
        break;
      }

      case CoapUriType.Hello: {
        // spark-server says hi
        break;
      }

      default: {
        console.warn(`Coap URI ${path} is not supported: ${packet}`);
      }
    }
  }

  _prepareDevicePublicKey(nonce: Buffer): Buffer {
    const publicKeyBuffer = this._privateKey.exportKey('pkcs8-public-der');

    // Concat a bunch of data that we will send over encrypted with the
    // server public key.
    return Buffer.concat(
      [
        nonce,
        this._deviceID,
        publicKeyBuffer,
      ],
      nonce.length + this._deviceID.length + publicKeyBuffer.length,
    );
  }

  _nextMessageID(): number {
    return ++this._messageID;
  }

  _coapMessageHeader(type: number, tokenLength: number) {
    return (COAP_VERSION << 6 | type << 4 | (tokenLength & 0xF));
  }

  _sendHello(): void {
    const data = [
      PRODUCT_ID >> 8,
      PRODUCT_ID & 0xff,
      PRODUCT_FIRMWARE_VERSION >> 8,
      PRODUCT_FIRMWARE_VERSION & 0xff,
      0, // Reserved flag
      0, // Flags -- newly upgraded. We probably won't use this
      PLATFORM_ID >> 8,
      PLATFORM_ID & 0xff,
      this._deviceID.length >> 8,
      this._deviceID.length & 0xff,
    ];
    this._deviceID.forEach(bit => data.push(bit));

    const packet = CoapPacket.generate({
      code: 'POST',
      messageId: this._nextMessageID(),
      options: [{
        name: 'Uri-Path',
        value: new Buffer('h'),
      }],
      payload: new Buffer(data),
    });

    this._cipherStream.write(packet);
  }

  _sendDescribe(descriptionFlags: number, serverPacket: CoapPacket): void {
    // TODO: make this a bit more fancy
    const description = JSON.stringify({
      f: [],
      v: {},
      // Copypasta'd from a real device
      "p":6,"m":[{"s":16384,"l":"m","vc":30,"vv":30,"f":"b","n":"0","v":11,"d":[]},{"s":262144,"l":"m","vc":30,"vv":30,"f":"s","n":"1","v":105,"d":[]},{"s":262144,"l":"m","vc":30,"vv":30,"f":"s","n":"2","v":105,"d":[{"f":"s","n":"1","v":105,"_":""}]},{"s":131072,"l":"m","vc":30,"vv":30,"u":"2BA4E71E840F596B812003882AAE7CA6496F1590CA4A049310AF76EAF11C943A","f":"u","n":"1","v":2,"d":[{"f":"s","n":"2","v":1,"_":""}]},{"s":131072,"l":"f","vc":30,"vv":0,"d":[]}]
    })

    const packet = CoapPacket.generate({
      code: '2.05', // Content
      messageId: this._nextMessageID(),
      payload: new Buffer(description),
      token: serverPacket.token,
    });

    this._cipherStream.write(packet);
  }

  _pingServer(): void {
    console.log('PING');
    const packet = CoapPacket.generate({
      confirmable: true,
      messageId: this._nextMessageID(),
    });

    this._cipherStream.write(packet);
  }
}

export default TCPDevice;
