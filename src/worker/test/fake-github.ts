/**
 * In-memory stand-in for api.github.com used by tests: routes by "METHOD /path" (regex), records every call and
 * returns canned responses. Unmatched requests fail loudly.
 */
export interface RecordedCall {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

type Handler = (call: RecordedCall, match: RegExpMatchArray) => Response | Promise<Response>;

export class FakeGitHub {
  readonly calls: RecordedCall[] = [];
  private readonly routes: { method: string; pattern: RegExp; handler: Handler }[] = [];

  on(method: string, pattern: RegExp, handler: Handler | Response | object): this {
    const respond: Handler = typeof handler === 'function'
      ? (handler as Handler)
      : () => (handler instanceof Response ? handler.clone() : Response.json(handler));
    this.routes.push({ method, pattern, handler: respond });
    return this;
  }

  /** Default App plumbing: installation lookup and installation tokens. */
  withInstallation(id = 42, expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()): this {
    return this.on('GET', /^\/repos\/[^/]+\/[^/]+\/installation$/, { id })
      .on('GET', /^\/app$/, { slug: 'ipl-discuss' })
      .on('POST', /^\/app\/installations\/\d+\/access_tokens$/, { token: `ghs_installation_${id}`, expires_at: expiresAt });
  }

  count(method: string, pattern: RegExp): number {
    return this.calls.filter((call) => call.method === method && pattern.test(call.path)).length;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const headers = new Headers(init?.headers);
    const call: RecordedCall = {
      method,
      path: decodeURIComponent(url.pathname),
      authorization: headers.get('authorization'),
      body: text === undefined ? undefined : JSON.parse(text),
    };
    this.calls.push(call);
    for (const route of this.routes) {
      const match = route.method === method ? call.path.match(route.pattern) : null;
      if (match) return route.handler(call, match);
    }
    return Response.json({ message: `FakeGitHub: no route for ${method} ${call.path}` }, { status: 599 });
  };
}

/** A fresh RSA key in PKCS#8 PEM, as stored in the GITHUB_APP_PRIVATE_KEY secret. */
export async function generateAppKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/.{64}/g, '$&\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}
