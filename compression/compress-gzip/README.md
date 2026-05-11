# @ambicuity/compress-gzip

> Gzip compression for Storely

Gzip compression for Storely.

## Install

```shell
npm install --save storely @ambicuity/compress-gzip
```

## Usage

```javascript
import Storely from '@ambicuity/ambicore';
import StorelyGzip from '@ambicuity/compress-gzip';

const storely = new Storely({store: new Map(), compression: new StorelyGzip()});

```

## API

### @ambicuity/compress-gzip(\[options])

#### options

All options for `@ambicuity/compress-gzip` are based on the package [compress-gzip](https://github.com/nodeca/pako#readme)

## Limitations

This adapter buffers entire values in memory. There is no streaming API. For values larger than ~10 MB, consider chunking at the application layer or storing the data outside Storely and caching a reference.

## License

[MIT © Ritesh Rana](LICENSE)