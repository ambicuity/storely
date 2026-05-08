# @storely/serialize-msgpackr

> High-performance MessagePack serializer for Storely using [msgpackr](https://github.com/kriszyp/msgpackr)

`@storely/serialize-msgpackr` is a serialization adapter for Storely powered by [msgpackr](https://github.com/kriszyp/msgpackr). It uses the MessagePack binary format for high-performance serialization with rich type support.

## Supported Types

In addition to all standard JSON types, msgpackr supports:

- `Date`
- `RegExp`
- `Map`
- `Set`
- `Error`
- `undefined`
- `NaN`, `Infinity`, `-Infinity`

Binary data is base64-encoded for compatibility with string-based storage adapters.

## Installation

```bash
npm install @storely/serialize-msgpackr
```

> **Note:** `storely` is a peer dependency and must be installed alongside this package.

## Usage

```js
import Storely from 'storely';
import { msgpackrSerializer } from '@storely/serialize-msgpackr';

const storely = new Storely({ serialization: msgpackrSerializer });

// Store a Date — it comes back as a Date, not a string
await storely.set('date', new Date('2024-01-15'));
const date = await storely.get('date');
console.log(date instanceof Date); // true

// Store a Map
await storely.set('map', new Map([['a', 1], ['b', 2]]));
const map = await storely.get('map');
console.log(map instanceof Map); // true
console.log(map.get('a')); // 1

// Store a Set
await storely.set('set', new Set([1, 2, 3]));
const set = await storely.get('set');
console.log(set instanceof Set); // true
```

## API

### `StorelyMsgpackrSerializer`

A class that implements the `StorelySerializationAdapter` interface from `storely`.

```js
import { StorelyMsgpackrSerializer } from '@storely/serialize-msgpackr';

const serializer = new StorelyMsgpackrSerializer();
```

#### `stringify(object: unknown): string`

Serializes a value to a base64-encoded MessagePack string using msgpackr.

#### `parse<T>(data: string): T`

Deserializes a base64-encoded MessagePack string back to its original value with all types restored.

### `msgpackrSerializer`

A default `StorelyMsgpackrSerializer` instance, ready to use.

```js
import { msgpackrSerializer } from '@storely/serialize-msgpackr';
```

## License

[MIT © Ritesh Rana](LICENSE)