import throat = require( "throat" );

export default {
	Finally,
	Try,
	defer,
	delay,
	delayChain,
	each,
	filter,
	finally: Finally,
	finallyDelay,
	funnel,
	inspect,
	map,
	props,
	reduce,
	rethrow,
	some,
	specific,
	tap,
	wrapFunction,
};

export function delay( milliseconds: number ): Promise< void >;
export function delay< T >( milliseconds: number, t: T ): Promise< T >;

export function delay< T >( milliseconds: number, t?: T )
: Promise< void > | Promise< T >
{
	return new Promise< T >( ( resolve, reject ) =>
	{
		setTimeout( ( ) => resolve( t ), milliseconds );
	} );
}

export function delayChain( milliseconds: number )
: < T >( t: T ) => Promise< T >
{
	return tap( ( ) => delay( milliseconds ) );
}

export function finallyDelay( milliseconds: number )
: FinallyWrapper
{
	return Finally( ( ) => delay( milliseconds ) );
}

export type FinallyWrapper =
	[ < T >( t: T ) => Promise< T >, ( err?: any ) => any ];

export function Finally( fn: ( ) => ( void | PromiseLike< void > ) )
: FinallyWrapper
{
	async function _then< T >( t: T ): Promise< T >
	{
		await fn( );
		return t;
	}

	async function _catch( err: any )
	{
		await fn( );
		throw err;
	}

	return [ _then, _catch ];
}


export function tap<
	U,
	Fn extends ( t: U ) => ( void | PromiseLike< void > )
>( fn: Fn )
: ( u: U ) => Promise< U >
{
	return async ( t: U ): Promise< U > =>
	{
		await fn( t );
		return t;
	};
}


export function props( obj: any ): Promise< any >
{
	const ret: any = { };

	const awaiters = [ ];

	for ( const prop of Object.keys( obj ) )
		awaiters.push(
			Promise.resolve( obj[ prop ] )
			.then( val => { ret[ prop ] = val; } )
		);

	return Promise.all( awaiters ).then( ( ) => ret );
}

export interface ConcurrencyOptions
{
	concurrency: number;
}
export type FilterMapOptions = Partial< ConcurrencyOptions >;
const defaultFilterMapOptions: FilterMapOptions = { concurrency: Infinity };

export type MapArray< T > =
	Array< T | PromiseLike< T > > |
	ReadonlyArray< T | PromiseLike< T > >;

export type MapFn< T, U > =
	( t: T, index: number, arr: MapArray< T > ) =>
		U | Promise< U >;
export type FilterFn< T > = MapFn< T, boolean >;

export function filter< T >( filterFn: FilterFn< T > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > >;
export function filter< T >( opts: FilterMapOptions, filterFn: FilterFn< T > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > >;
export function filter< T >(
	arr: ReadonlyArray< T | PromiseLike< T > >,
	filterFn: FilterFn< T >
): Promise< Array< T > >;
export function filter< T >(
	arr: ReadonlyArray< T | PromiseLike< T > >,
	opts: FilterMapOptions,
	filterFn: FilterFn< T >
): Promise< Array< T > >;

export function filter< T >(
	arr: ReadonlyArray< T | PromiseLike< T > > | FilterFn< T > | FilterMapOptions,
	opts?: FilterFn< T > | FilterMapOptions,
	filterFn?: FilterFn< T >
)
:
	( ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > > ) |
	( Promise< Array< T > > )
{
	if ( Array.isArray( arr ) )
	{
		if ( typeof opts === "function" )
		{
			filterFn = opts;
			opts = defaultFilterMapOptions;
		}
		const intermediate =
			filter( < FilterMapOptions >opts, < FilterFn< T > >filterFn );
		return intermediate( arr );
	}

	filterFn = typeof arr === "function" ? arr : < FilterFn< T > >opts;
	opts =
		typeof arr === "function"
		? defaultFilterMapOptions
		: < FilterMapOptions >arr;

	const wrappedFilterFn =
		( val: T, index: number, arr: MapArray< T > ) =>
			Promise.resolve( ( < FilterFn< T > >filterFn )( val, index, arr ) )
			.then( ok => ( { ok, val } ) );

	return ( t: ReadonlyArray< T | PromiseLike< T > > ): Promise< Array< T > > =>
	{
		return map( < FilterMapOptions >opts, wrappedFilterFn )( t )
		.then( values =>
			values
			.filter( ( { ok } ) => ok )
			.map( ( { val } ) => val )
		);
	};
}

export function map< T, U >( mapFn: MapFn< T, U > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< U > >;
export function map< T, U >( opts: FilterMapOptions, mapFn: MapFn< T, U > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< U > >;
export function map< T, U >(
	arr: ReadonlyArray< T | PromiseLike< T > >,
	mapFn: MapFn< T, U >
): Promise< Array< U > >;
export function map< T, U >(
	arr: ReadonlyArray< T | PromiseLike< T > >,
	opts: FilterMapOptions,
	mapFn: MapFn< T, U >
): Promise< Array< U > >;

export function map< T, U >(
	arr:
		ReadonlyArray< T | PromiseLike< T > > |
		MapFn< T, U > |
		FilterMapOptions,
	opts?: MapFn< T, U > | FilterMapOptions,
	mapFn?: MapFn< T, U >
)
:
	( ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< U > > ) |
	( Promise< Array< U > > )
{
	if ( Array.isArray( arr ) )
	{
		if ( typeof opts === "function" )
		{
			mapFn = opts;
			opts = defaultFilterMapOptions;
		}
		return map( < FilterMapOptions >opts, < MapFn< T, U > >mapFn )( arr );
	}

	mapFn = typeof arr === "function" ? arr : < MapFn< T, U > >opts;
	opts =
		typeof arr === "function"
		? defaultFilterMapOptions
		: < FilterMapOptions >arr;

	const { concurrency = Infinity } = opts;

	const promiseMapFn =
		( t: T, index: number, arr: ReadonlyArray< T | PromiseLike< T > > ) =>
			Promise.resolve( ( < MapFn< T, U > >mapFn )( t, index, arr ) );

	const throated = throat( concurrency );

	return ( t: ReadonlyArray< T | PromiseLike< T > > )
	: Promise< Array< U > > =>
	{
		return Promise.resolve( t )
		.then( ( values: ReadonlyArray< T | PromiseLike< T > > ) =>
			values.map(
				( val, index, arr ) =>
					throated( ( ) => Promise.resolve( val ) )
					.then( ( val: T ) =>
						throated( ( ) => promiseMapFn( val, index, arr ) )
					)
			)
		)
		.then( values => Promise.all( values ) );
	};
}


export type SyncReduceInput< T > = Iterable< T | PromiseLike< T > >;

export type ReduceInput< T > =
	SyncReduceInput< T > |
	PromiseLike< SyncReduceInput< T > >;

export type ReduceFunction< T, R > =
	( accumulator: R, current: T, index: number, length: number ) =>
		R | PromiseLike< R >;

export async function reduce< T, R >(
	input: ReduceInput< T >,
	reducer: ReduceFunction< T, R >
)
: Promise< R | undefined >;

export async function reduce< T, R >(
	input: ReduceInput< T >,
	reducer: ReduceFunction< T, R >,
	initialValue: R | PromiseLike< R >
)
: Promise< R >;

export function reduce< T, R >(
	reducer: ReduceFunction< T, R >
)
: < U extends SyncReduceInput< T > >( input: U ) => Promise< R | undefined >;

export function reduce< T, R >(
	reducer: ReduceFunction< T, R >,
	initialValue: R | PromiseLike< R >
)
: < U extends SyncReduceInput< T > >( input: U ) => Promise< R >;

export function reduce< T, R >(
	input: ReduceInput< T > | ReduceFunction< T, R >,
	reducer?: ReduceFunction< T, R > | R | PromiseLike< R >,
	initialValue?: R | PromiseLike< R >
)
:
	( Promise< R | undefined > )
	|
	( < U extends SyncReduceInput< T > >( input: U ) =>
		Promise< R | undefined >
	)
{
	if ( typeof input === "function" )
	{
		initialValue = < R >reducer;
		const _reducer = < ReduceFunction< T, R > >input;
		return async < U extends SyncReduceInput< T > >( input: U ) =>
		{
			return reduceImpl( input, _reducer, initialValue );
		};
	}

	return reduceImpl(
		< ReduceInput< T > >input,
		< ReduceFunction< T, R > >reducer,
		initialValue
	);
}

async function reduceImpl< T, R >(
	input: ReduceInput< T >,
	reducer: ReduceFunction< T, R >,
	initialValue?: R | PromiseLike< R >
)
: Promise< R | undefined >
{
	const _input = Array.from< T | PromiseLike< T > >( await input );
	const _initialValue = await initialValue;

	if ( _input.length === 0 )
		return _initialValue;

	const usingInitialValue = typeof _initialValue !== "undefined";

	const length = _input.length;
	let index = usingInitialValue ? 0 : 1;

	let accumulator: R =
		usingInitialValue
		? < R >_initialValue
		// This cast should be safe if the interface is respected
		: < R >< any >await _input.shift( );

	while ( _input.length > 0 )
		accumulator = await reducer(
			accumulator, < T >await _input.shift( ), index++, length );

	return accumulator;
}


export type EachFn< T > =
	( t: T, index: number, length: number ) => void | Promise< void >;

export function each< T >( eachFn: EachFn< T > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > >;
export function each< T >(
	arr: ReadonlyArray< T | PromiseLike< T > >,
	eachFn: EachFn< T >
): Promise< Array< T > >;

export function each< T >(
	arr: ReadonlyArray< T | PromiseLike< T > > | EachFn< T >,
	eachFn?: EachFn< T >
)
:
	( ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > > ) |
	( Promise< Array< T > > )
{
	if ( Array.isArray( arr ) )
		return eachImpl( < EachFn< T > >eachFn )( arr );
	return eachImpl( < EachFn< T > >arr );
}

export function eachImpl< T >( eachFn: EachFn< T > )
: ( t: ReadonlyArray< T | PromiseLike< T > > ) => Promise< Array< T > >
{
	return async ( arr: ReadonlyArray< T | PromiseLike< T > > )
	: Promise< Array< T > > =>
	{
		const length = arr.length;

		async function iterator( t: T, index: number )
		{
			await eachFn( t, index, length );
			return t;
		}
		return map( arr, { concurrency: 1 }, iterator );
	};
}


export type SomeReturn< R > = Promise< R | false >;
export type SomeSyncReturn< R > = SomeReturn< R > | R | false;
export type SomePredicate< T, R > = ( t: T ) => SomeSyncReturn< R >;
export type SomeArray< T > =
	ReadonlyArray< T | PromiseLike< T > >
	|
	PromiseLike< ReadonlyArray< T | PromiseLike< T > > >;

export function some< T, R >(
	list: SomeArray< T >,
	fn: SomePredicate< T, R >
)
: SomeReturn< R >;

export function some< T, R >( fn: SomePredicate< T, R > )
: ( list: SomeArray< T > ) => SomeReturn< R >;

export function some< T, R >(
	list: SomeArray< T > | SomePredicate< T, R >,
	fn?: SomePredicate< T, R >
)
:
	SomeReturn< R >
	|
	( ( list: SomeArray< T > ) => SomeReturn< R > )
{
	if ( typeof list === "function" )
	{
		fn = list;
		return ( list: SomeArray< T > ) =>
			someImpl( list, < SomePredicate< T, R > >fn );
	}

	return someImpl( list, < SomePredicate< T, R > >fn );
}

async function someImpl< T, R >(
	list: SomeArray< T >,
	fn: SomePredicate< T, R >
)
: Promise< R | false >
{
	const _list = await list;

	for ( const val of _list )
	{
		const ret = await fn( await val );
		if ( ret )
			return ret;
	}

	return false;
}


export interface Deferred< T >
{
	resolve: ( t: T | PromiseLike< T > ) => void;
	reject: < E extends Error >( err: E ) => void;
	promise: Promise< T >;
}

export interface EmptyDeferred
{
	resolve: ( ( t: void | PromiseLike< void > ) => void ) & ( ( ) => void );
	reject: < E extends Error >( err: E ) => void;
	promise: Promise< void >;
}

/**
 * Creates a defer object used to pass around a promise and its resolver
 */
export function defer< T >( ): Deferred< T >;
export function defer( v: void ): EmptyDeferred;

export function defer< T = void >( ): Deferred< T >
{
	const deferred = < Deferred< T > >{ };
	deferred.promise = new Promise< T >( ( resolve, reject ) =>
	{
		deferred.resolve = resolve;
		deferred.reject = reject;
	} );
	return deferred;
}


export interface ResolvedReflection< T >
{
	error?: void;
	value: T;
	isResolved: true;
	isRejected: false;
}
export interface RejectedReflection
{
	error: Error;
	value?: void;
	isResolved: false;
	isRejected: true;
}

export type Reflection< T > = ResolvedReflection< T > | RejectedReflection;

export function reflect< T >( promise: Promise< T > )
: Promise< Reflection< T > >
{
	const inspection = inspect( promise );

	function handleResolution( value: T ): ResolvedReflection< T >
	{
		return {
			isRejected: false,
			isResolved: true,
			value,
		};
	}

	function handleRejection( error: Error ): RejectedReflection
	{
		return {
			error,
			isRejected: true,
			isResolved: false,
		};
	}

	return inspection.promise
	.then( handleResolution, handleRejection );
}


export interface InspectablePromise< T >
{
	promise: Promise< T >;
	isResolved: boolean;
	isRejected: boolean;
	isPending: boolean;
}
export function inspect< T >( promise: Promise< T > ): InspectablePromise< T >
{
	const inspectable: InspectablePromise< T > = {
		isPending: true,
		isRejected: false,
		isResolved: false,
		promise: < any >void 0,
	};

	inspectable.promise = promise.then( value =>
	{
		inspectable.isResolved = true;
		inspectable.isPending = false;
		return value;
	} )
	.catch( err =>
	{
		inspectable.isRejected = true;
		inspectable.isPending = false;
		return Promise.reject( err );
	} );

	return inspectable;
}


export async function Try< T >( cb: ( ) => T ): Promise< T >
{
	return cb( );
}


export type ErrorFilterFunction = ( err: Error ) => boolean;
export interface ErrorFilterObject
{
	[ key: string ]: any;
}

export type CatchFilter =
	ErrorConstructor |
	ErrorFilterFunction |
	ErrorFilterObject;

// This logic is taken from Bluebird
function catchFilter(
	filters: CatchFilter | Array< CatchFilter > | null,
	err: Error
)
: boolean
{
	return ( Array.isArray( filters ) ? filters : [ filters ] )
	.some( ( filter: CatchFilter | null ) =>
	{
		if ( filter == null )
			return false;

		if (
			filter === Error ||
			( < ErrorConstructor >filter ).prototype instanceof Error )
		{
			if ( err instanceof < ErrorConstructor >filter )
				return true;
		}
		else if ( typeof filter === "function" )
		{
			const filterFn = < ErrorFilterFunction >filter;

			// It is "ok" for this to throw. It'll be thrown back to the catch
			// handler, and the promise chain will contain this error.
			return filterFn( err );
		}
		else if ( typeof filter === "object" )
		{
			const obj = < ErrorFilterObject >filter;

			for ( const key of Object.keys( obj ) )
				if ( obj[ key ] !== ( < any >err )[ key ] )
					return false;
			return true;
		}

		return false;
	} );
}

export function specific< T, U extends Promise< T > >(
	filters: CatchFilter | Array< CatchFilter > | null,
	handler: ( err: Error ) => U
)
: ( err: Error ) => ( U );

export function specific< T >(
	filters: CatchFilter | Array< CatchFilter > | null,
	handler: ( err: Error ) => T
)
: ( err: Error ) => ( T | Promise< T > );

export function specific< T >(
	filters: CatchFilter | Array< CatchFilter > | null,
	handler: ( err: Error ) => T
)
: ( err: Error ) => ( T | Promise< T > )
{
	return ( err: Error ) =>
	{
		if ( !catchFilter( filters, err ) )
			throw err;

		return handler( err );
	};
}


export function rethrow< T extends Error = any >(
	fn: ( err?: T ) => ( void | PromiseLike< void > )
)
{
	return async ( err: T ) =>
	{
		await fn( err );
		throw err;
	};
}

export function wrapFunction< R extends void >(
	wrap: ( ) => ( ) => R
): (
	< U extends void, V extends Promise< U > | U >( cb: ( ) => V ) => V
) & (
	< U extends any, V extends Promise< U > | U >( cb: ( ) => V ) => V
);
export function wrapFunction< T extends { }, R extends void >(
	wrap: ( t: T ) => ( ) => R
): (
	< U extends void, V extends Promise< U > | U >( t: T, cb: ( ) => V ) => V
) & (
	< U extends any, V extends Promise< U > | U >( t: T, cb: ( ) => V ) => V
);
export function wrapFunction< R extends void >(
	wrap: ( ) => Promise< ( ) => R >
): (
	< U extends void, V extends Promise< U > | U >( cb: ( ) => V ) =>
		Promise< U >
) & (
	< U extends any, V extends Promise< U > | U >( cb: ( ) => V ) =>
		Promise< U >
);
export function wrapFunction< T, R extends void >(
	wrap: ( t: T ) => Promise< ( ) => R >
): (
	< U extends void, V extends Promise< U > | U >( t: T, cb: ( ) => V ) =>
		Promise< U >
) & (
	< U extends any, V extends Promise< U > | U >( t: T, cb: ( ) => V ) =>
		Promise< U >
);
export function wrapFunction< R extends Promise< void > >(
	wrap: ( ) => ( ( ) => R ) | Promise< ( ) => R >
): < U, V extends Promise< U > | U >( cb: ( ) => V ) => Promise< U >;
export function wrapFunction< T, R extends Promise< void > >(
	wrap: ( t: T ) => ( ( ) => R ) | Promise< ( ) => R >
): < U, V extends Promise< U > | U >( t: T, cb: ( ) => V ) => Promise< U >;

export function wrapFunction< T, R extends Promise< void > | void >(
	wrap:
		( ( t: T ) => ( ( ) => R ) | Promise< ( ) => R > ) |
		( ( ) => ( ( ) => R ) | Promise< ( ) => R > )
):
	( < U, V extends Promise< U > | U >( t: T, cb: ( ) => V ) => any )
	|
	(
		< U, V extends Promise< U > | U >( cb: ( ) => V ) =>
			Promise< U > | U | V
	)
{
	// tslint:disable-next-line
	return function< U, V extends Promise< U > | U >(
		t: T | ( ( ) => U ), cb: ( ) => V
	)
	: Promise< U > | U | V
	{
		if ( arguments.length === 1 ) {
			if ( wrap.length > 0 )
				throw new EvalError(
					"Invalid invocation, function requires 2 arguments"
				);

			cb = < ( ) => V >t;
			t = < T >( < any >void 0 );
		}

		const anyCleanup = (<( t: T ) => any>wrap)( < T >t );

		const callCleanup = < W >( cleanup?: ( ) => W ) =>
		{
			if ( typeof cleanup === "function" )
				return cleanup( );
			else if ( cleanup != null )
				// Allow 'before' to just return null/undefined, but non-empty
				// value would've been silently ignored.
				throw new EvalError(
					"Invalid return value in 'before' handler"
				);
		};

		if (
			anyCleanup &&
			typeof ( < Promise< ( ( ) => R ) > >anyCleanup ).then === "function"
		)
		{
			let doCleanup: ( ) => void;
			return < Promise< U > >( < Promise< ( ( ) => R ) > >anyCleanup )
				.then( async cleanup =>
				{
					doCleanup = ( ) => callCleanup( cleanup );

					return cb( );
				} )
				.then( ...Finally( ( ) =>
				{
					if ( doCleanup )
						return doCleanup( );
				} ) );
		} else {
			const cleanup = < ( ) => R >anyCleanup;
			let cbRet: V;

			try
			{
				cbRet = cb( );
			}
			catch ( err )
			{
				const cleanupRet = callCleanup( cleanup );

				if (
					cleanupRet &&
					typeof ( < Promise< void > >cleanupRet ).then === "function"
				)
				{
					return < Promise< U > >( < Promise< void > >cleanupRet )
						.then( ( ) => { throw err; } );
				} else {
					throw err;
				}
			}

			if (
				cbRet && typeof ( < Promise< U > >cbRet ).then === "function"
			)
			{
				return < Promise< U > >( < Promise< U > >cbRet )
					.then( ...Finally( ( ) => callCleanup( cleanup ) ) );
			} else {
				const cleanupRet = callCleanup( cleanup );
				if (
					cleanupRet &&
					typeof ( < Promise< void > >cleanupRet ).then === "function"
				)
				{
					return < Promise< U > >( < Promise< void > >cleanupRet )
						.then( ( ) => cbRet );
				} else {
					return cbRet;
				}
			}
		}
	};
}


export type FunnelShouldRetry = ( ) => boolean;
export type FunnelRetry< T, U extends Promise< T > > = ( ) => U;

export type FunnelFunction< T, U extends Promise< T > = Promise< T > > =
	( shouldRetry: FunnelShouldRetry, retry: FunnelRetry< T, U > ) => U;

export type Funnel< T, U extends Promise< T > > =
	( funnelFunction: FunnelFunction< T, U > ) => U;

export interface FunnelOptions
{
	onComplete: ( ) => void;
	fifo: boolean;
}

interface FunnelStore< T >
{
	ret: T;
	call: FunnelCall< T >;
}

type FunnelCall< T > = Array< FunnelStore< T > >;

export function funnel< T, U extends Promise< T > = Promise< T > >(
	opts: Partial< FunnelOptions > = { }
)
: Funnel< T, U >
{
	const { onComplete = ( ) => { }, fifo = true } = ( opts || { } );

	const _onComplete = ( ) => onComplete && onComplete( );

	const waiters: Array< FunnelStore< U > > = [ ];
	const retryers = new WeakMap< FunnelStore< U >, ( ) => void >( );
	const stores = new Set< FunnelStore< U > >( );

	const waitFor = ( t: FunnelStore< U > ) =>
	{
		waiters.push( t );
	};

	const hasSiblingFirst = ( store: FunnelStore< U > ) =>
	{
		if ( waiters.length === 0 )
			return false;
		const firstStoreInCall = store.call[ 0 ];
		return waiters[ 0 ] === firstStoreInCall;
	};

	const completeStore = ( store: FunnelStore< U > ) =>
	{
		const indexCall = store.call.indexOf( store );
		store.call.splice( indexCall, 1 );

		const indexWaiters = waiters.indexOf( store );
		waiters.splice( indexWaiters, 1 );

		stores.delete( store );

		return store.call.length === 0;
	};

	const triggerWaiter = ( ) =>
	{
		if ( waiters.length === 0 && stores.size === 0 )
			_onComplete( );
		else
		{
			const first = waiters[ 0 ];
			const nextRetryer = retryers.get( first );
			nextRetryer && nextRetryer( );
		}
	};

	const finalizeRetry = ( store: FunnelStore< U > ) =>
	{
		const completed = completeStore( store );
		if ( completed )
			triggerWaiter( );
	};

	const runner = ( fn: FunnelFunction< T, U >, call: FunnelCall< U > ) =>
	{
		const store: FunnelStore< U > = < FunnelStore< U > >{ call };
		call.push( store );
		stores.add( store );

		const shouldRetry: FunnelShouldRetry = ( ) =>
		{
			const firstAndOnly = waiters.length === 0;
			const firstInQueue = hasSiblingFirst( store );
			const result = firstAndOnly || firstInQueue;

			if ( result && !fifo )
				waitFor( store );

			if ( result )
				// If first in queue, schedule waiting for the return promise
				// to trigger the rest of the queue.
				store.ret.then( ...Finally( ( ) => finalizeRetry( store ) ) );

			return !result;
		};

		const retry: FunnelRetry< T, U > = ( ) =>
		{
			const deferred = defer< T >( );
			const retryer = ( ) => deferred.resolve( runner( fn, call ) );

			retryers.set( store, retryer );

			if ( !fifo )
				waitFor( store );

			// When retrying, when the final result is finally complete, it's
			// always first in queue.
			deferred.promise.then( ...Finally( ( ) => finalizeRetry( store ) ) );

			return < U >deferred.promise;
		};

		if ( fifo )
			waitFor( store );

		store.ret = fn( shouldRetry, retry );
		return store.ret;
	};

	return ( fn: FunnelFunction< T, U > ) =>
	{
		return runner( fn, [ ] );
	};
}
