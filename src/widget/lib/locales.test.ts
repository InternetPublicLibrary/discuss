import { describe, expect, it } from 'vitest';
import type { Messages } from './i18n';

// IPL ships English and Brazilian Portuguese (spec 004); every English key must exist in pt-BR with the same
// placeholders and tags, so a missing or broken translation fails CI (#14).
const files = import.meta.glob<Messages>('../../../locales/{en,pt-BR}/common.json', { import: 'default', eager: true });
const en = files['../../../locales/en/common.json'] ?? {};
const ptBR = files['../../../locales/pt-BR/common.json'] ?? {};

const tokens = (text: string) => [...text.matchAll(/\{\{\s*\w+\s*\}\}|<\/?\w+>/g)].map((match) => match[0].replace(/\s/g, '')).sort();
const forms = (entry: Messages[string]) => (typeof entry === 'string' ? { other: entry } : entry);

describe('pt-BR locale (#14)', () => {
  it('has every English key', () => {
    expect(Object.keys(en).filter((key) => !(key in ptBR))).toEqual([]);
  });

  it('has no keys English lacks', () => {
    expect(Object.keys(ptBR).filter((key) => !(key in en))).toEqual([]);
  });

  it.each(Object.keys(en))('keeps the placeholders of %s', (key) => {
    const source = forms(en[key] as Messages[string]);
    const target = forms((ptBR[key] ?? '') as Messages[string]);
    expect(typeof ptBR[key]).toBe(typeof en[key]);
    for (const [form, text] of Object.entries(source)) expect({ form, tokens: tokens(target[form] ?? target.other ?? '') }).toEqual({ form, tokens: tokens(text) });
  });

  it('includes every ORCID string', () => {
    const orcid = Object.keys(en).filter((key) => /orcid/i.test(key));
    expect(orcid.length).toBeGreaterThan(3);
    expect(orcid.filter((key) => !ptBR[key])).toEqual([]);
  });
});
