# @storely/compress-lz4

> lz4 compression for Storely

lz4 compression for Storely.

`lz4` is a data compression algorithm that is designed to be fast and efficient and is provided by the package [lz4-napi](https://npmjs.com/package/lz4-napi).

## Install

```shell
npm install --save storely @storely/compress-lz4
```

## Usage

```javascript
import Storely from 'storely';
import StorelyLz4 from '@storely/compress-lz4';

const storely = new Storely({store: new Map(), compression: new StorelyLz4()});

```

## API

### @storely/compress-lz4(\[options])

#### options

All options for `@storely/compress-lz4` are based on the package [lz4-napi](https://npmjs.com/package/lz4-napi).

## License

[MIT © Ritesh Rana](LICENSE)