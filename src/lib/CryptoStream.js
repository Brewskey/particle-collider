// @flow

import crypto from 'crypto';
import { Transform } from 'stream';

export type CryptoStreamType = 'decrypt' | 'encrypt';

type CryptoStreamOptions = {
  iv: Buffer,
  key: Buffer,
  streamType: CryptoStreamType,
};

class CryptoStream extends Transform {
  _key: Buffer;
  _iv: Buffer;
  _streamType: CryptoStreamType;

  constructor(options: CryptoStreamOptions) {
    super();

    this._key = options.key;
    this._iv = options.iv;
    this._streamType = options.streamType;
  }

  _transform = (
    chunk: Buffer | string,
    encoding: string,
    callback: Function,
  ) => {
    if (!chunk.length) {
      throw new Error(
        `CryptoStream transform error: Chunk didn't have any length`
      );
    }

    try {
      chunk = ((chunk: any): Buffer);
      const cipherParams = ['aes-128-cbc', this._key, this._iv];
      const cipher = this._streamType === 'encrypt'
        ? crypto.createCipheriv(...cipherParams)
        : crypto.createDecipheriv(...cipherParams);

      const output = Buffer.concat([
        cipher.update(chunk),
        cipher.final(),
      ]);

      const ivContainer = this._streamType === 'encrypt'
        ? output
        : chunk;
      this._iv = new Buffer(16);
      ivContainer.copy(this._iv, 0, 0, 16);

      this.push(output);
    } catch (error) {
      throw new Error(`CryptoStream transform error: ${error}`);
    }
    callback();
  }
}

export default CryptoStream;
