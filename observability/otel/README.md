# @ambicuity/otel

> OpenTelemetry instrumentation for Storely

A parallel subscriber to Storely's event stream that records OTel counters and histograms and wraps public operations in spans. No monkey-patching; safe to attach and detach at runtime.

## Install

```shell
npm install --save storely @ambicuity/otel @opentelemetry/api
```

`@opentelemetry/api` is a peer dependency — bring your own version aligned with the rest of your observability stack.

## Usage

```ts
import Storely from "@ambicuity/ambicore";
import { instrumentWithOtel } from "@ambicuity/otel";
import { trace, metrics } from "@opentelemetry/api";

const storely = new Storely({ store });

const otel = instrumentWithOtel(storely, {
  meter: metrics.getMeter("myapp"),
  tracer: trace.getTracer("myapp"),
  namespace: "myapp.cache", // optional, defaults to "storely"
});

// ... later, on shutdown:
otel.dispose();
```

## Emitted metrics

With the default namespace `storely`:

| Metric | Kind | Notes |
|---|---|---|
| `storely.cache.hits` | Counter | Incremented on `STAT_HIT` event |
| `storely.cache.misses` | Counter | Incremented on `STAT_MISS` event |
| `storely.cache.sets` | Counter | Incremented on `STAT_SET` event |
| `storely.cache.deletes` | Counter | Incremented on `STAT_DELETE` event |
| `storely.cache.errors` | Counter | Incremented on `STAT_ERROR` event |
| `storely.cache.get.duration` | Histogram (ms) | Recorded per `get()` hook lifecycle |
| `storely.cache.set.duration` | Histogram (ms) | Recorded per `set()` hook lifecycle |

All counters carry a `namespace` attribute from the originating event.

## Emitted spans

When a tracer is provided, every `get` / `set` / `delete` call is wrapped in a span named `<namespace>.get` / `<namespace>.set` / `<namespace>.delete`.

## Pass either, or both

`meter` and `tracer` are both optional. Pass only the meter for metrics-only deployments. Pass only the tracer for spans-only. Pass neither for a no-op (useful when feature-flagging observability).

## License

[MIT © Ritesh Rana](LICENSE)
