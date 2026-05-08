# @storely/serialize-superjson

> SuperJSON-based serializer for Storely with support for Date, Map, Set, BigInt, RegExp, and more

`@storely/serialize-superjson` is a serialization adapter for Storely powered by [SuperJSON](https://github.com/flightcontrolhq/superjson). It preserves JavaScript types that standard JSON does not support.

## Supported Types

In addition to all standard JSON types, SuperJSON supports:

- `Date`
- `RegExp`
- `Map`
- `Set`
- `BigInt`
- `undefined`
- `Error`
- `URL`

## Installation

```bash
npm install @storely/serialize-superjson
```

> **Note:** `storely` is a peer dependency and must be installed alongside this package.

## Usage

```js
import Storely from 'storely';
import { superJsonSerializer } from '@storely/serialize-superjson';

const storely = new Storely({ serialization: superJsonSerializer });

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

### `StorelySuperJsonSerializer`

A class that implements the `StorelySerializationAdapter` interface from `storely`.

```js
import { StorelySuperJsonSerializer } from '@storely/serialize-superjson';

const serializer = new StorelySuperJsonSerializer();
```

#### `stringify(object: unknown): string`

Serializes a value to a JSON string using SuperJSON, preserving type information.

#### `parse<T>(data: string): T`

Deserializes a SuperJSON string back to its original value with all types restored.

### `superJsonSerializer`

A default `StorelySuperJsonSerializer` instance, ready to use.

```js
import { superJsonSerializer } from '@storely/serialize-superjson';
```

## License

[MIT © Ritesh Rana](LICENSE)