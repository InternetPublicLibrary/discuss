import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { AVAILABLE_LOCALES, I18nProvider, loadMessages, resolveLocale, Trans, translate } from './i18n';

describe('resolveLocale (#14)', () => {
  const available = ['en', 'pt', 'pt-BR', 'zh-CN'];

  it.each(['pt-BR', 'pt-br', 'pt_BR', 'PT_br'])('resolves %s to pt-BR', (code) => {
    expect(resolveLocale(code, available)).toBe('pt-BR');
  });

  it('falls back from a regional code to its language', () => {
    expect(resolveLocale('pt-PT', available)).toBe('pt');
  });

  it('falls back to English with one warning for unknown codes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveLocale('xx', available)).toBe('en');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('knows the upstream locales', () => {
    expect(AVAILABLE_LOCALES).toEqual(expect.arrayContaining(['en', 'pt']));
  });
});

describe('translate', () => {
  const messages = { comments: { '0': '{{count}} comments', one: '{{count}} comment', other: '{{count}}{{plus}} comments' }, hello: 'Hi {{name}}' };

  it('picks zero, singular and plural forms', () => {
    expect(translate(messages, {}, 'en', 'comments', { count: 0 })).toBe('0 comments');
    expect(translate(messages, {}, 'en', 'comments', { count: 1 })).toBe('1 comment');
    expect(translate(messages, {}, 'en', 'comments', { count: 3, plus: '+' })).toBe('3+ comments');
  });

  it('interpolates and falls back to English, then to the key', () => {
    expect(translate({}, messages, 'pt-BR', 'hello', { name: 'Ana' })).toBe('Hi Ana');
    expect(translate({}, {}, 'en', 'missing')).toBe('missing');
  });

  it('loads the English messages', async () => {
    expect((await loadMessages('en')).signInWithGitHub).toBe('Sign in with GitHub');
  });
});

describe('Trans', () => {
  it('renders known tags as components and everything else as text', () => {
    const root = document.createElement('div');
    render(
      <I18nProvider locale="en" messages={{ x: 'Read <a>the guide</a> <script>bad</script>' }} fallback={{}}>
        <Trans i18nKey="x" components={{ a: <a href="https://ipl.example/guide" /> }} />
      </I18nProvider>,
      root,
    );

    expect(root.querySelector('a')?.textContent).toBe('the guide');
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toBe('Read the guide bad');
  });
});
