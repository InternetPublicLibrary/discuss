import { type ComponentChildren, createContext } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import { ApiError, getJson } from './api';

/**
 * Sign-in inside the widget (spec 002, #17): a popup opened from the widget completes the provider's flow and posts a
 * one-time ticket back; the widget redeems it with the nonce it generated. The page never navigates away, so the
 * draft and scroll position stay.
 */
export interface Identity {
  provider: 'github' | 'orcid';
  id: string;
  login?: string;
  name: string;
  profileUrl: string;
  avatarUrl?: string;
}

interface AuthState {
  identity: Identity | null;
  csrfToken: string;
  error: 'popupBlocked' | 'signInFailed' | null;
  signIn: (provider: 'github' | 'orcid') => void;
  signOut: () => Promise<void>;
  /** POST JSON to the API as the signed-in reader (CSRF token included). */
  post: <T>(path: string, body: unknown) => Promise<T>;
  /** Any method (PATCH, DELETE) as the signed-in reader. */
  send: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** The session ended on the server (e.g. expired): show the signed-out state. */
  signedOut: () => void;
}

const AuthContext = createContext<AuthState>({
  identity: null,
  csrfToken: '',
  error: null,
  signIn: () => undefined,
  signOut: async () => undefined,
  post: async () => {
    throw new ApiError(401, 'signed-out', 'Not signed in');
  },
  send: async () => {
    throw new ApiError(401, 'signed-out', 'Not signed in');
  },
  signedOut: () => undefined,
});

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [session, setSession] = useState<{ identity: Identity; csrfToken: string } | null>(null);
  const [error, setError] = useState<AuthState['error']>(null);

  useEffect(() => {
    getJson<{ identity: Identity; csrfToken: string }>('/api/session').then(setSession, () => setSession(null));
  }, []);

  const signIn = useCallback((provider: 'github' | 'orcid') => {
    setError(null);
    const nonce = randomToken();
    const popup = window.open(`/api/oauth/${provider}/start?nonce=${nonce}`, 'discuss-sign-in', 'popup,width=560,height=720');
    if (!popup) {
      setError('popupBlocked');
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const result = (event.data as { discuss?: { signIn?: { ticket?: string; error?: string } } } | null)?.discuss?.signIn;
      if (!result) return;
      window.removeEventListener('message', onMessage);
      if (!result.ticket) {
        if (result.error !== 'cancelled') setError('signInFailed');
        return;
      }
      getJson<{ identity: Identity; csrfToken: string }>('/api/session/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: result.ticket, nonce }),
      }).then(setSession, () => setError('signInFailed'));
    };
    window.addEventListener('message', onMessage);
  }, []);

  const send = useCallback(
    <T,>(method: string, path: string, body?: unknown) =>
      getJson<T>(path, {
        method,
        headers: { 'x-csrf-token': session?.csrfToken ?? '', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.reason === 'signed-out') setSession(null);
        throw caught;
      }),
    [session],
  );
  const post = useCallback(<T,>(path: string, body: unknown) => send<T>('POST', path, body), [send]);

  const signOut = useCallback(async () => {
    await getJson('/api/session/logout', { method: 'POST', headers: { 'x-csrf-token': session?.csrfToken ?? '' } }).catch(() => undefined);
    setSession(null);
  }, [session]);

  return (
    <AuthContext.Provider value={{ identity: session?.identity ?? null, csrfToken: session?.csrfToken ?? '', error, signIn, signOut, post, send, signedOut: () => setSession(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
