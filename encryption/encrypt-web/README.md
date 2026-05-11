# @ambicuity/encrypt-web

> Web Crypto API encryption for Storely

Encrypt and decrypt values stored in Storely using the Web Crypto API (`crypto.subtle`). Works in browsers, Deno, Cloudflare Workers, and Node.js 18+. No Node.js-specific dependencies.

## Install

```shell
npm install --save storely @ambicuity/encrypt-web
```

## Usage

```javascript
import Storely from '@ambicuity/storely';
import StorelyEncryptWeb from '@ambicuity/encrypt-web';

const encryption = new StorelyEncryptWeb({ key: 'your-secret-key' });
const storely = new Storely({ encryption });

await storely.set('foo', 'bar');
const value = await storely.get('foo'); // 'bar' (decrypted automatically)
```

## API

### new StorelyEncryptWeb(options)

#### options.key

Type: `string | Uint8Array`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Uint8Array keys are used directly and must match the expected key length.

#### options.algorithm

Type: `WebAlgorithm`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supported values:

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm` (AEAD, recommended)
- `aes-256-cbc`, `aes-192-cbc`, `aes-128-cbc`

## Cross-Compatibility

Data encrypted with `@ambicuity/encrypt-web` using AES-GCM or AES-CBC can be decrypted by `@ambicuity/encrypt-node` (and vice versa) when using the same key and algorithm. Both packages use the same wire format:

- **AES-GCM**: `base64([IV (12 bytes) || AuthTag (16 bytes) || Ciphertext])`
- **AES-CBC**: `base64([IV (16 bytes) || Ciphertext])`

## License

[MIT © Ritesh Rana](LICENSE)