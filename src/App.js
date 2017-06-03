// @flow

import fs from 'fs';
import Particle from 'particle-api-js';
import readline from 'readline';
import superagentPromise from 'superagent-promise';

import CryptoManager from './lib/CryptoManager';
import TCPDevice from './devices/TCPDevice';


type ReadlineInterface = {
  close(): void,
  question(question: string, (answer: string) => void): void,
};

type ConfigData = {
  configs: Array<Config>,
  defaultConfigIndex: number,
};

type Config = {
  serverKeyPath: string,
  serverPort: number,
  serverUrl: string,
};

const USERNAME = '__test__@testaccount.com';
const PASSWORD = 'password';
const PARTICLE_API_CONFIG = {
  clientId: "particle-collider",
  clientSecret: "particle-collider",
};
const FOLDER_PATH = './data';
const CONFIG_FILE_PATH = FOLDER_PATH + '/configs.json';

class App {
  _accessToken: string;
  _configData: ConfigData;
  _devices: Array<TCPDevice> = [];
  _existingDeviceIDs: Array<string> = [];
  _exit: boolean = false;
  _particle: Particle;
  _rl: ReadlineInterface;

  constructor() {
    console.log('    ____             __  _      __        ______      _____     __         \n   / __ \\____ ______/ /_(_)____/ /__     / ____/___  / / (_)___/ /__  _____\n  / /_/ / __ `/ ___/ __/ / ___/ / _ \\   / /   / __ \\/ / / / __  / _ \\/ ___/\n / ____/ /_/ / /  / /_/ / /__/ /  __/  / /___/ /_/ / / / / /_/ /  __/ /    \n/_/    \\__,_/_/   \\__/_/\\___/_/\\___/   \\____/\\____/_/_/_/\\__,_/\\___/_/     \n                                                                           \n');

    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  run = async (): Promise<void> => {
    this._setupData();

    let config = this._getConfig();
    if (!config) {
      config = await this._setupNewConfig();
    }
    this._setServerKey(config);
    await this._login(config);
    this._existingDeviceIDs = await this._promise(
      this._particle.listDevices({auth: this._accessToken}),
    ).then(result => result.body.map(device => device.id));

    while (!this._exit) {
      console.log('');
      console.log('Choose an option\r');
      console.log('1 - Start Virtual Device(s)');
      console.log('2 - Set default config');
      console.log('3 - Create new config');
      console.log('e - Exit');
      const answer = await this._question('');
      switch (answer) {
        case '1': {
          await this._createDevices(config);
          break;
        }

        case '2': {
          break;
        }

        case '3': {
          config = await this._setupNewConfig();
          break;
        }

        case 'e': {
          this._exit = true;
          break;
        }
      }
    }

    this._rl.close();
  }

  _setupNewConfig = async (): Promise<Config> => {
    const config = {serverKeyPath: '', serverPort: 8080, serverUrl: ''};

    const getServerKey = async (): Promise<void> => {
      const serverKeyPath = await this._question(
        'In order to connect the virtual Particle devices, we need the ' +
        'public key to your local cloud server. What is the relative or ' +
        'absolute path to your server key?\r\n\r\nIt looks like ' +
        'server-key.pub.pem\r\n',
      );

      if (!fs.existsSync(serverKeyPath)) {
        console.log(`Could not find the server key at ${serverKeyPath}`);
        await getServerKey();
        return;
      }

      config.serverKeyPath = serverKeyPath;
    };

    const getServerUrl = async (): Promise<void> => {
      console.log('Now we need the host name or IP address of your server.');
      console.log(
        'It can look like 192.168.0.175 or https://cloud.particle.io',
      );
      const serverUrl = await this._question();
      config.serverUrl = serverUrl;
    };

    const getServerPort = async (): Promise<void> => {
      console.log('What is your server port? Default is 8080');
      const port = await this._question();

      if (port && isNaN(port)) {
        await getServerPort();
      }

      config.serverPort = port
        ? parseInt(port, 10)
        : config.serverPort;
    };

    await getServerKey();
    await getServerUrl();
    await getServerPort();

    console.log('Your server config has been correctly set.');

    this._configData.configs.push(config);
    this._configData.defaultConfigIndex = this._configData.configs.length - 1;

    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this._configData));
    return config;
  }

  _createDevices = async (config: Config): Promise<void> => {
    console.log('How many devices do you want to create?');
    const amountString = await this._question();

    if (isNaN(amountString)) {
      return;
    }

    const amount = parseInt(amountString, 10);
    for (let i = 0; i < amount; i++) {
      const index = this._devices.length + i;
      let deviceID = this._existingDeviceIDs.length > index
        ? this._existingDeviceIDs[index]
        : null;
      const device = new TCPDevice({
        deviceID,
        // Simulate devices that take longer to send data
        networkDelay: Math.random() * 1000 + 500,
        serverAddress: config.serverUrl,
      });

      // If the device doesn't already exist, we need to send the key and
      // claim the device.
      if (!deviceID) {
        deviceID = device.getDeviceID();
        await this._promise(this._particle.sendPublicKey({
          auth: this._accessToken,
          deviceId: deviceID,
          key: device.getPublicKey(),
        }));

        await this._promise(this._particle.claimDevice({
          auth: this._accessToken,
          deviceId: deviceID,
        }));
      }

      device.connect();

      this._devices.push(device);
    }
  };

  _login = async (config: Config): Promise<void> => {
    this._particle = new Particle({
      ...PARTICLE_API_CONFIG,
      baseUrl: config.serverUrl + `:${config.serverPort}`,
    });

    const credentials = {
      password: PASSWORD,
      username: USERNAME,
    };
    const login = () => this._promise(this._particle.login(credentials));
    let loginData = null;
    try {
      loginData = await login();
    } catch (error) {
      await this._promise(this._particle.createUser(credentials));
      loginData = await login();
    }

    this._accessToken = loginData.body.access_token;
  };

  _question = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      this._rl.question('', answer => resolve(answer));
    });
  };

  _setupData(): void {
    if (!fs.existsSync(FOLDER_PATH)) {
      fs.mkdir(FOLDER_PATH);
    }

    if (!fs.existsSync(`${FOLDER_PATH}/keys`)) {
      fs.mkdir(`${FOLDER_PATH}/keys`);
    }

    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      this._configData = {configs:[], defaultConfigIndex: -1};
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this._configData));
    } else {
      this._configData = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    }
  }

  _getConfig(): ?Config {
    const {configs, defaultConfigIndex} = this._configData;
    if (defaultConfigIndex === -1 || defaultConfigIndex >= configs.length) {
      return null;
    }

    return configs[defaultConfigIndex];
  }

  _setServerKey(config: Config): void {
    const keyString = fs.readFileSync(config.serverKeyPath, 'utf8');
    CryptoManager.setServerKey(keyString);
  }

  _promise(fakePromise: Object): Promise<*> {
    return new Promise((resolve, reject): void => {
      fakePromise.then(resolve, reject);
    }).catch(error => console.log(error));
  }
}

export default App;
