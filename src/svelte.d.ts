// Svelte 5 TypeScript declarations
declare namespace svelteHTML {
  // This namespace is used by Svelte's TypeScript integration
  // to provide type safety for HTML elements in templates
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }

  // Allow slot attribute on all elements (for web components)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<_T> {
    slot?: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface SVGAttributes<_T> {
    slot?: string;
  }
}
