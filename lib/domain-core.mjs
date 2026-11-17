// Shared primitives have no dependencies; server and client modules may enter
// the domain graph in either order without a circular initialization dependency.
export class AppError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const uid=()=>crypto.randomUUID();
