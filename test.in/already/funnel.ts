import { expect } from "chai";
import "mocha";
import * as sinon from "sinon";

import {
	defer,
	delay,
	// each,
	// filter,
	// Finally,
	// finallyDelay,
	funnel,
	FunnelFunction,
	// inspect,
	// map,
	// props,
	// reduce,
	// reflect,
	// rethrow,
	// some,
	// specific,
	// tap,
	// Try,
	// wrapFunction,
} from "../../";

// tslint:disable:no-console


type AnyFunctionWoArgs< T > =
	( ( ) => T ) |
	( ( ) => Promise< T > );
type AnyFunction< T > =
	AnyFunctionWoArgs< T > |
	( ( arg: any ) => T ) |
	( ( arg: any ) => Promise< T > );

const makePredicate = < T >(
	pre: AnyFunction< void >,
	post: AnyFunction< void >,
	ret: T
)
: FunnelFunction< T > => async ( shouldRetry, retry ) =>
{
	await ( < AnyFunctionWoArgs< T > >pre )( );

	if ( shouldRetry( ) )
		return retry( );

	await ( < AnyFunctionWoArgs< T > >post )( );

	return ret;
};

const maker = (
	reporter: ( val: string ) => void,
	val: string,
	millis: number = 0
) =>
	async ( ) =>
	{
		await delay( millis );
		reporter( val );
	};

describe( "funnel", ( ) =>
{
	[ true, false ].forEach( fifo => describe( `fifo = ${fifo}`, ( ) =>
	{
		it( "only one job", async ( ) =>
		{
			const onComplete = sinon.spy( );
			const fun = funnel< number >( { fifo, onComplete } );

			const value = await fun( async ( shouldRetry, retry ) =>
			{
				await delay( 0 );

				if ( shouldRetry( ) )
					return retry( );

				return 4;
			} );

			expect( value ).to.equal( 4 );
			expect( onComplete.callCount ).to.equal( 1 );
		} );

		it( "two jobs", async ( ) =>
		{
			const deferred = defer( void 0 );
			const onComplete = sinon.spy( deferred.resolve );
			const parts = sinon.spy( );
			const fun = funnel< number >( { fifo, onComplete } );

			const eventualValue1 =
				fun( makePredicate< number >(
					maker( parts, "1 a", 0 ),
					maker( parts, "1 b", 5 ),
					1
				) );

			const eventualValue2 =
				fun( makePredicate< number >(
					maker( parts, "2 a", 0 ),
					maker( parts, "2 b", 5 ),
					2
				) );

			const value1 = await eventualValue1;
			const value2 = await eventualValue2;
			await deferred.promise;

			const args = ( < Array< string > >[ ] ).concat( ...parts.args );

			expect( value1 ).to.equal( 1 );
			expect( value2 ).to.equal( 2 );
			expect( args ).to.deep.equal(
				[ "1 a", "2 a", "1 b", "2 a", "2 b" ]
			);
			expect( onComplete.callCount ).to.equal( 1 );
		} );

		it( "two jobs, first slower", async ( ) =>
		{
			const deferred = defer( void 0 );
			const onComplete = sinon.spy( deferred.resolve );
			const parts = sinon.spy( );
			const fun = funnel< number >( { fifo, onComplete } );

			const eventualValue1 =
				fun( makePredicate< number >(
					maker( parts, "1 a", 10 ),
					maker( parts, "1 b", 5 ),
					1
				) );

			const eventualValue2 =
				fun( makePredicate< number >(
					maker( parts, "2 a", 0 ),
					maker( parts, "2 b", 5 ),
					2
				) );

			const value1 = await eventualValue1;
			const value2 = await eventualValue2;
			await deferred.promise;

			const args = ( < Array< string > >[ ] ).concat( ...parts.args );

			expect( value1 ).to.equal( 1 );
			expect( value2 ).to.equal( 2 );
			expect( args ).to.deep.equal(
				fifo
				? [ "2 a", "1 a", "1 b", "2 a", "2 b" ]
				: [ "2 a", "2 b", "1 a", "1 b" ]
			);
			expect( onComplete.callCount ).to.equal( 1 );
		} );
	} ) );

	it( "two jobs, first slower, no arg", async ( ) =>
	{
		const parts = sinon.spy( );
		const fun = funnel< number >( );

		const eventualValue1 =
			fun( makePredicate< number >(
				maker( parts, "1 a", 10 ),
				maker( parts, "1 b", 5 ),
				1
			) );

		const eventualValue2 =
			fun( makePredicate< number >(
				maker( parts, "2 a", 0 ),
				maker( parts, "2 b", 5 ),
				2
			) );

		const value1 = await eventualValue1;
		const value2 = await eventualValue2;

		const args = ( < Array< string > >[ ] ).concat( ...parts.args );

		expect( value1 ).to.equal( 1 );
		expect( value2 ).to.equal( 2 );
		expect( args ).to.deep.equal(
			[ "2 a", "1 a", "1 b", "2 a", "2 b" ]
		);
	} );

	it( "two jobs, first slower, arg = null", async ( ) =>
	{
		const parts = sinon.spy( );
		const fun = funnel< number >( < any >null );

		const eventualValue1 =
			fun( makePredicate< number >(
				maker( parts, "1 a", 10 ),
				maker( parts, "1 b", 5 ),
				1
			) );

		const eventualValue2 =
			fun( makePredicate< number >(
				maker( parts, "2 a", 0 ),
				maker( parts, "2 b", 5 ),
				2
			) );

		const value1 = await eventualValue1;
		const value2 = await eventualValue2;

		const args = ( < Array< string > >[ ] ).concat( ...parts.args );

		expect( value1 ).to.equal( 1 );
		expect( value2 ).to.equal( 2 );
		expect( args ).to.deep.equal(
			[ "2 a", "1 a", "1 b", "2 a", "2 b" ]
		);
	} );

	it( "two jobs, first slower, onComplete = null", async ( ) =>
	{
		const parts = sinon.spy( );
		const fun = funnel< number >( { onComplete: < any >null } );

		const eventualValue1 =
			fun( makePredicate< number >(
				maker( parts, "1 a", 10 ),
				maker( parts, "1 b", 5 ),
				1
			) );

		const eventualValue2 =
			fun( makePredicate< number >(
				maker( parts, "2 a", 0 ),
				maker( parts, "2 b", 5 ),
				2
			) );

		const value1 = await eventualValue1;
		const value2 = await eventualValue2;

		const args = ( < Array< string > >[ ] ).concat( ...parts.args );

		expect( value1 ).to.equal( 1 );
		expect( value2 ).to.equal( 2 );
		expect( args ).to.deep.equal(
			[ "2 a", "1 a", "1 b", "2 a", "2 b" ]
		);
	} );
} );
