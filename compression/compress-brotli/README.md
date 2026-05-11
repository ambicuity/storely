# @ambicuity/compress-brotli

> Brotli compression for Storely

Brotli compression for Storely.

Brotli is a data compression algorithm that is designed to be fast and efficient.

## Install

```shell
npm install --save storely @ambicuity/compress-brotli
```

## Usage

```javascript
import Storely from '@ambicuity/core';
import StorelyBrotli from '@ambicuity/compress-brotli';

const storely = new Storely({store: new Map(), compression: new StorelyBrotli()});

```

## API

### @ambicuity/compress-brotli(\[options])

#### options

All options for `@ambicuity/compress-brotli` are based on the package [compress-brotli](https://github.com/Kikobeats/compress-brotli)

The default brotli quality is `4`, chosen as the standard cache-storage tradeoff. Node's underlying default is `11` (maximum), which is ~5–10× slower with marginal additional compression ratio on typical small payloads. Override via `compressOptions.params`.

## Limitations

This adapter buffers entire values in memory. There is no streaming API. For values larger than ~10 MB, consider chunking at the application layer or storing the data outside Storely and caching a reference.

## License

[MIT © Ritesh Rana](LICENSE)