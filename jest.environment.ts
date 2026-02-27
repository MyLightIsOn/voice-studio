// Custom jest environment that extends jsdom and injects Node.js fetch globals.
// This is needed because jsdom v26 does not include the Fetch API (fetch, Response,
// Request, Headers), but Node.js v18+ ships them natively.
import JSDOMEnvironment from 'jest-environment-jsdom';

export default class FetchJSDOMEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();
    // Inject Node.js native fetch API globals into the jsdom window context.
    // globalThis inside this file is the Node.js global (has Response etc.),
    // while this.global is the jsdom window object used by tests.
    if (typeof this.global.Response === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeGlobal = globalThis as any;
      if (nodeGlobal.Response) this.global.Response = nodeGlobal.Response;
      if (nodeGlobal.Request) this.global.Request = nodeGlobal.Request;
      if (nodeGlobal.Headers) this.global.Headers = nodeGlobal.Headers;
      if (nodeGlobal.fetch) this.global.fetch = nodeGlobal.fetch;
      if (nodeGlobal.ReadableStream) this.global.ReadableStream = nodeGlobal.ReadableStream;
      if (nodeGlobal.TextEncoder) this.global.TextEncoder = nodeGlobal.TextEncoder;
      if (nodeGlobal.TextDecoder) this.global.TextDecoder = nodeGlobal.TextDecoder;
    }
  }
}
