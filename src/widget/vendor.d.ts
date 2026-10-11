declare module 'tailwindcss-vanilla-rtl' {
  import type { PluginCreator } from 'tailwindcss/types/config';
  const plugin: { handler: PluginCreator; disabledCorePlugins: Record<string, boolean> };
  export default plugin;
}
