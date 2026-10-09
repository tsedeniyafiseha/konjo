const projectUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!projectUrl || !publishableKey) {
  throw new Error('Supabase did not inject the project URL and publishable key.');
}

type HttpHandler = (request: unknown, response: unknown) => Promise<void>;

let handleHttpRequest: HttpHandler | null = null;
let bootError: unknown = null;
try {
  const { Buffer } = await import('npm:buffer@6.0.3');
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
  const { createEdgeBackendDependencies } = await import('./composition.ts');
  const backendDependencyKey = Symbol.for('konjo.backend.dependencies');
  (globalThis as unknown as { [backendDependencyKey]: unknown })[backendDependencyKey] = createEdgeBackendDependencies();
  const serverModule = await import('../../../backend/src/server.ts');
  handleHttpRequest = serverModule.handleHttpRequest;
} catch (error) {
  bootError = error;
  console.error('Konjo Edge API failed to initialize.', error);
}

function edgePath(requestUrl: string): string {
  const url = new URL(requestUrl);
  const functionPrefix = url.pathname.startsWith('/functions/v1/api')
    ? '/functions/v1/api'
    : url.pathname.startsWith('/api') ? '/api' : '';
  const pathname = functionPrefix ? url.pathname.slice(functionPrefix.length) || '/' : url.pathname;
  return `${pathname}${url.search}`;
}

function incomingHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of headers) result[name.toLowerCase()] = value;
  return result;
}

async function incomingRequest(request: Request): Promise<unknown> {
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? new Uint8Array()
    : new Uint8Array(await request.arrayBuffer());
  const headers = incomingHeaders(request.headers);
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    method: request.method,
    url: edgePath(request.url),
    headers,
    socket: { remoteAddress: forwardedFor || '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body.byteLength) yield body;
    },
  };
}

class EdgeServerResponse {
  statusCode = 200;
  private readonly responseHeaders = new Headers();
  private readonly finishListeners: Array<() => void> = [];
  private chunks: Uint8Array[] = [];
  private ended = false;
  private resolveFinished!: (response: Response) => void;
  readonly finishedResponse = new Promise<Response>((resolve) => {
    this.resolveFinished = resolve;
  });

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    return this;
  }

  once(event: string, listener: () => void): this {
    if (event === 'finish') this.finishListeners.push(listener);
    return this;
  }

  listenerCount(event: string): number {
    return event === 'finish' ? this.finishListeners.length : 0;
  }

  end(data?: string | Uint8Array): this {
    if (this.ended) return this;
    this.ended = true;
    if (data !== undefined) {
      this.chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
    }
    const length = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const body = length === 0 ? null : new Uint8Array(length);
    if (body) {
      let offset = 0;
      for (const chunk of this.chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    for (const listener of this.finishListeners.splice(0)) listener();
    this.resolveFinished(new Response(body, { status: this.statusCode, headers: this.responseHeaders }));
    this.chunks = [];
    return this;
  }
}

Deno.serve(async (request) => {
  if (!handleHttpRequest) {
    const diagnosticToken = request.headers.get('x-konjo-worker-token');
    const mayDiagnose = Boolean(diagnosticToken) && diagnosticToken === Deno.env.get('KONJO_WORKER_TOKEN');
    return Response.json({
      error: {
        code: 'SERVICE_NOT_READY',
        message: mayDiagnose && bootError instanceof Error
          ? bootError.message
          : 'The Konjo API is not ready.',
      },
    }, { status: 503 });
  }
  const response = new EdgeServerResponse();
  try {
    await handleHttpRequest(
      await incomingRequest(request),
      response,
    );
  } catch (error) {
    console.error('Edge request adapter failed.', error);
    if (response.listenerCount('finish') > 0) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
      }));
    }
  }
  return await response.finishedResponse;
});
