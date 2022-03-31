// @ts-check
/**
 * @module hdbext - examples using sap-hdbext-promisfied
 */


import dbClass from '../index.js'
/** @type {typeof import("@sap/hdbext")} */
import * as hdbext from '@sap/hdbext'
import * as assert from 'assert'

/**
 * hdbext Await example
 * @param {string} [dbQuery] Database Query 
 * @returns {Promise<object>} HANA ResultSet Object
 */
export async function example1(dbQuery) {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv())
        return await db.execSQL(dbQuery)
    } catch (error) {
        throw error
    }
}


/**
 * hdbext procedure example with Callbacks
 * @param {string} [schema] Database Stored Procedure Schema 
 * @param {string} [dbProcedure] Database Stored Procedure Name 
 * @param {object} [inputParams] Database Stored Procedure Input Parameters
 * @returns {Promise<object>} HANA ResultSet Object
 */
export async function example2(schema, dbProcedure, inputParams) {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv())
        let sp = await db.loadProcedurePromisified(hdbext, schema, dbProcedure)
        return await db.callProcedurePromisified(sp, inputParams)
    } catch (error) {
        throw error
    }
}

describe('hdbext', () => {
    describe('Example with Await', () => {
        it('returns 10 records', async () => {
            let dbQuery = `SELECT SCHEMA_NAME, TABLE_NAME, COMMENTS FROM TABLES LIMIT 10`
            const results = await example1(dbQuery)
            assert.equal(results.length, 10)
        })

        it('returns single record', async () => {
            let dbQuery = `SELECT CURRENT_USER, CURRENT_SCHEMA from DUMMY`
            const results = await example1(dbQuery)
            assert.equal(results.length, 1)
        })

        it('throws error with target table not found', () => {
            let dbQuery = `SELECT CURRENT_USER, CURRENT_SCHEMA from DUMMY_DUMB`
            assert.rejects(async () => { await example1(dbQuery) }, Error)
        })
    })


    describe('Example Stored Procedure with Await', () => {
        it('Password is too short - Error Code 412', async () => {
            let result = await example2('SYS', 'IS_VALID_PASSWORD', { PASSWORD: "TEST" })
            assert.equal(result.outputScalar.ERROR_CODE, 412)
        })

        it('Password is good - Error Code 412', async () => {
            let result = await example2('SYS', 'IS_VALID_PASSWORD', { PASSWORD: "TESTtest1234" })
            assert.equal(result.outputScalar.ERROR_CODE, 0)
        })

        it('throws error with Stored Procedure not found', async () => {
            assert.rejects(async () => { await example2('SYS', 'IS_VALID_PASSWORD_NOT_A_PROC', { PASSWORD: "TESTtest1234" }) }, Error)
        })

    })
})