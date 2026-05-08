# @storely/compress-brotli

> Brotli compression for Storely

Brotli compression for Storely.

Brotli is a data compression algorithm that is designed to be fast and efficient.

## Install

```shell
npm install --save storely @storely/compress-brotli
```

## Usage

```javascript
import Storely from 'storely';
import StorelyBrotli from '@storely/compress-brotli';

const storely = new Storely({store: new Map(), compression: new StorelyBrotli()});

```

## API

### @storely/compress-brotli(\[options])

#### options

All options for `@storely/compress-brotli` are based on the package [compress-brotli](https://github.com/Kikobeats/compress-brotli)

## License

[MIT © Ritesh Rana](LICENSE)