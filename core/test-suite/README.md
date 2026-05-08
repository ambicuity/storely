# @storely/test-suite

> Test suite for Storely API compliance

Complete [Vitest](https://vitest.dev/) test suite to test a Storely storage adapter for API compliance.

## Usage

### Install

Install `vitest`, `storely` and `@storely/test-suite` as development dependencies.

```shell
npm install --save-dev vitest storely @storely/test-suite
```

Then update `storely` and `@storely/test-suite` versions to `*` in `package.json` to ensure you're always testing against the latest version.

### Create Test File

`test.js`

```js
import test from 'vitest';
import storelyTestSuite from '@storely/test-suite';
import Storely from 'storely';
import StorelyStore from './';

const store = () => new StorelyStore();
storelyTestSuite(test, Storely, store);
```

Where `StorelyStore` is your storage adapter.

Set your test script in `package.json` to `vitest`.
```json
"scripts": {
  "test": "vitest"
}
```

## Example for Storage Adapters

Take a look at an existing storage adapter using `@storely/test-suite`.

## Testing Compression Adapters

If you're testing a compression adapter, you can use the `storelyCompressionTests` method instead of `storelyTestSuite`.

```js
import test from 'vitest';
import { storelyCompressionTests, StorelyGzip } from '@storely/test-suite';
import Storely from 'storely';

storelyCompressionTests(test, new StorelyGzip());
```

## License

[MIT © Ritesh Rana](LICENSE)