export type ActionResult<TDetails extends object = Record<string, unknown>> =
	| OkResult<{ text: string; details?: TDetails }>
	| ErrResult<string>;

export class OkResult<TValue> {
	constructor(public readonly value: TValue) {}
	isOk(): this is OkResult<TValue> { return true; }
	isErr(): this is ErrResult<never> { return false; }
}

export class ErrResult<TError> {
	constructor(public readonly error: TError) {}
	isOk(): this is OkResult<never> { return false; }
	isErr(): this is ErrResult<TError> { return true; }
}

export function ok<TValue>(value: TValue): OkResult<TValue> {
	return new OkResult(value);
}

export function err<TError>(error: TError): ErrResult<TError> {
	return new ErrResult(error);
}

export function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
