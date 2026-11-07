/**
 * Wraps an async DOM handler so `addEventListener` receives a void-returning
 * function. Rejections stay attached to the promise instead of leaking into
 * the event dispatch path.
 */
export function voidAsync<A extends unknown[]>(
	fn: (...args: A) => Promise<unknown>,
): (...args: A) => void {
	return (...args: A) => {
		void fn(...args);
	};
}
