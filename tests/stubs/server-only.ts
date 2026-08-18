/**
 * `server-only` is a Next.js build-time marker that errors if a module is
 * pulled into a client bundle. It has no runtime behaviour, and Vitest does not
 * resolve it, so tests alias it to this empty module.
 */
export {}
