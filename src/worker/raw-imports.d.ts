/** Vite `?raw` imports (used by tests to read wrangler.jsonc inside workerd). */
declare module '*?raw' {
  const text: string;
  export default text;
}
