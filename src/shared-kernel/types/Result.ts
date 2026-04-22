export type Result<T, E> =
  | { readonly isOk: true; readonly isErr: false; readonly value: T }
  | { readonly isOk: false; readonly isErr: true; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ isOk: true, isErr: false, value });
export const err = <E>(error: E): Result<never, E> => ({ isOk: false, isErr: true, error });
