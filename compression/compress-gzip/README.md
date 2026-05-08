# @storely/compress-gzip

> Gzip compression for Storely

Gzip compression for Storely.

## Install

```shell
npm install --save storely @storely/compress-gzip
```

## Usage

```javascript
import Storely from 'storely';
import StorelyGzip from '@storely/compress-gzip';

const storely = new Storely({store: new Map(), compression: new StorelyGzip()});

```

## API

### @storely/compress-gzip(\[options])

#### options

All options for `@storely/compress-gzip` are based on the package [compress-gzip](https://github.com/nodeca/pako#readme)

## License

[MIT © Ritesh Rana](LICENSE)