# @ambicuity/compress-lz4

> lz4 compression for Storely

lz4 compression for Storely.

`lz4` is a data compression algorithm that is designed to be fast and efficient and is provided by the package [lz4-napi](https://npmjs.com/package/lz4-napi).

## Install

```shell
npm install --save storely @ambicuity/compress-lz4
```

## Usage

```javascript
import Storely from '@ambicuity/ambicore';
import StorelyLz4 from '@ambicuity/compress-lz4';

const storely = new Storely({store: new Map(), compression: new StorelyLz4()});

```

## API

### @ambicuity/compress-lz4(\[options])

#### options

All options for `@ambicuity/compress-lz4` are based on the package [lz4-napi](https://npmjs.com/package/lz4-napi).

## Limitations

This adapter buffers entire values in memory. There is no streaming API. For values larger than ~10 MB, consider chunking at the application layer or storing the data outside Storely and caching a reference.

## License

[MIT © Ritesh Rana](LICENSE)