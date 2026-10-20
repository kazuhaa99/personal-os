// The app can be served under a path prefix (e.g. https://host/personalos/), set at build
// time with VITE_BASE. Everything that points at our own files or API goes through here.

/** "/" or "/prefix/" — always with a trailing slash. */
export const BASE: string = import.meta.env.BASE_URL;

/** URL of a file from public/ (or any app path): asset("/media/x.jpg") -> "/prefix/media/x.jpg". */
export const asset = (path: string): string => BASE + path.replace(/^\/+/, "");
