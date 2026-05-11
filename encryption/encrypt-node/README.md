# @ambicuity/encrypt-node

> Node.js crypto encryption for Storely

Encrypt and decrypt values stored in Storely using the Node.js `crypto` module. Supports AES-GCM (default), AES-CCM, ChaCha20-Poly1305, AES-CBC, and any cipher available in your Node.js installation.

## Install

```shell
npm install --save storely @ambicuity/encrypt-node
```

## Usage

```javascript
import Storely from '@ambicuity/storely-core';
import StorelyEncryptNode from '@ambicuity/encrypt-node';

const encryption = new StorelyEncryptNode({ key: 'your-secret-key' });
const storely = new Storely({ encryption });

await storely.set('foo', 'bar');
const value = await storely.get('foo'); // 'bar' (decrypted automatically)
```

## API

### new StorelyEncryptNode(options)

#### options.key

Type: `string | Buffer`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Buffer keys are used directly and must match the expected key length.

#### options.algorithm

Type: `string`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supports any algorithm available via Node.js `crypto.getCipherInfo()`, including:

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm` (AEAD)
- `aes-256-ccm`, `aes-192-ccm`, `aes-128-ccm` (AEAD)
- `chacha20-poly1305` (AEAD)
- `aes-256-cbc`, `aes-192-cbc`, `aes-128-cbc`

#### options.encoding

Type: `BufferEncoding`\
Default: `'base64'`

The encoding used for the encrypted output string. Common options: `'base64'`, `'hex'`.

## Cross-Compatibility

Data encrypted with `@ambicuity/encrypt-node` using AES-GCM or AES-CBC can be decrypted by `@ambicuity/encrypt-web` (and vice versa) when using the same key and algorithm. Both packages use the same wire format:

- **AES-GCM**: `base64([IV (12 bytes) || AuthTag (16 bytes) || Ciphertext])`
- **AES-CBC**: `base64([IV (16 bytes) || Ciphertext])`

## License

[MIT © Ritesh Rana](LICENSE)