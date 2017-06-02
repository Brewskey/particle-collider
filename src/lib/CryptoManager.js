// @flow

import crypto from 'crypto';
import NodeRSA from 'node-rsa';

import CryptoStream from './CryptoStream';

const HASH_TYPE = 'sha1';

class CryptoManager {
  _privateKey: NodeRSA;

  static _serverKey: NodeRSA = new NodeRSA(
    '-----BEGIN PUBLIC KEY-----\n' +
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0GEc1oJgEY0yTDKMywSl\n' +
    'QclE4QRaxdmZNWM4tJWO3l0np+VFUXbkTKr5lbZ6HGJzgBbU9M6Z7jxKylfMmzFq\n' +
    'CnTjUGPyvJKfMt61KI4LjHiizfqlQnCXX821Lw+ErP0pQf3W5qFxRBIfUEed7ZG/\n' +
    'KrHrxReKZ3IpMxRJaiR4WgMxcVlWCsxkhK+/7DqvyIwD18thv+RyL40O05PrbkME\n' +
    'yXSmSVAk1dfj4kUCV+6BlolEvGWRUPBISuAy4sYjbU8pOq9iU0qdTTzcSZXkEcLV\n' +
    '0xxBQ4UZyVvRQnGT7iEPO2zxoYYKun/fkSWknQiOwSgMlQ44NoxjiqWtRlEZNBZ2\n' +
    'qQIDAQAB\n' +
    '-----END PUBLIC KEY-----',
    'pkcs8-public-pem',
    {
      encryptionScheme: 'pkcs1',
      signingScheme: 'pkcs1',
    }
  );

  constructor(privateKey: NodeRSA) {
    this._privateKey = privateKey;
  }

  static getServerKey(): NodeRSA {
    return CryptoManager._serverKey;
  }

  static createKey(): NodeRSA {
    // TODO: This should be generated and saved in the server first.
    return new NodeRSA(
      '-----BEGIN RSA PRIVATE KEY-----\n' +
      'MIICXQIBAAKBgQDt8mWUDGJV5vO6tExBQSQmV78fls0Eum9NJzFFr3SVAPCrfuU4\n' +
      'yiGqH+zdcWVPv3z/Iza+m+Sfm7wkywMyl4NGWYwT+p+Bblj2TRxuHVQvP4/abWsj\n' +
      'VuoALtllkhRj5NAAn+0DE/U9kR84H28bWo7XObFK8x3NtPtnGk21QUR8xQIDAQAB\n' +
      'AoGBAJv3/VlT3MlN/4jsUeecGWQAtEiygmSNCBPcktGItrRMz3S6UuospHBtSMfG\n' +
      'YpAphnd+z42VhgCRBnxfjhMFeYfJ6hq1/TFYUZNx8zFIiqMORXu/iOvT1bFjB3Go\n' +
      'gjVayc7DhoqihOThLZ1+C4Jgjdvpf1r6S65B+qdH5uUkMYqpAkEA+Z9clWD8ZLT2\n' +
      '6RO1ohH0hwWVhZz+V46xhVQvRPdbiICwQsqLbsfVo8QiexCRc1wuubmSFbf37mYl\n' +
      'H7u35ei6/wJBAPQGq+Gs16YE8e/9l9yfU/6tj2D9Yb3/cXXTCV5J93dJYZD8GbJE\n' +
      'TiKFlRP1FIpEWsU+N8nMtplASErXU3NSnDsCQAuNZYKAR439lgO5ZsmGXTO2fXH+\n' +
      'jwLMVsjd2YYukGzjz8R3jTZmRyvaEuJxJNoa5QqxXOJmbjH5RjSOwncAa08CQGx7\n' +
      '1sfB/jCpPCFT3MJQ9pde80HMAzrjJ76Yri6DtYcLUVuSJ55PrWi9eBPiPVpmnu/X\n' +
      'BBgrcPXaVQkohsna7OcCQQDOUBJYhpCzTDESz7xLpa6YgkBZc+v7iLAQMlc/sONY\n' +
      '5i95sI6qGNJDDLk5YepiFeaBk6D+0pszapz5LhNUeUTZ\n' +
      '-----END RSA PRIVATE KEY-----',
      'pkcs1-private-pem',
      {
        encryptionScheme: 'pkcs1',
        signingScheme: 'pkcs1',
      }
    );
    // return new NodeeRSA({
    //   b: 1024,
    //   e: [0x02, 0x03, 0x01, 0x00, 0x01],
    // });
  }

  static randomBytes(count: number): Buffer {
    return crypto.randomBytes(count);
  }

  static createHmacDigest = (
    ciphertext: Buffer,
    sessionKey: Buffer,
  ): Buffer => {
    const hmac = crypto.createHmac(HASH_TYPE, sessionKey);
    hmac.update(ciphertext);
    return hmac.digest();
  };

  encrypt(buffer: Buffer): Buffer {
    return this._privateKey.encryptPrivate(buffer);
  }
}

export default CryptoManager;
