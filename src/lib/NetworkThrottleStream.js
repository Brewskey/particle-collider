// @flow

import { Transform } from 'stream';

class NetworkThrottleStream extends Transform {
  _millisecondDelay: number;

  constructor(millisecondDelay: number) {
    super();

    this._millisecondDelay = millisecondDelay;
  }

  _transform = (
    chunk: Buffer | string,
    encoding: string,
    callback: Function,
  ) => {
    setTimeout(() => {
      this.push(chunk);
      callback();
    }, this._millisecondDelay);
  }
}

export default NetworkThrottleStream;
