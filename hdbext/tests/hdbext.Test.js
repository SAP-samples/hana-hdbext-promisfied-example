// @ts-check
/**
 * @module hdbext - contract tests for ESM + CJS exports
 */

import * as assert from 'assert'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/** @type {typeof import("@sap/hdbext")} */
const hdbext = require('@sap/hdbext')

const moduleVariants = [
    {
        name: 'esm',
        /** @returns {Promise<any>} */
        loadDbClass: async () => (await import('../index.js')).default
    },
    {
        name: 'cjs',
        /** @returns {Promise<any>} */
        loadDbClass: async () => require('../index.cjs')
    }
]

/**
 * @param {any} DbClass
 * @param {(db:any)=>Promise<any>} run
 */
async function withDb(DbClass, run) {
    const db = new DbClass(await DbClass.createConnectionFromEnv())
    return run(db)
}

for (const variant of moduleVariants) {
    describe(`hdbext (${variant.name})`, function () {
        /** @type {any} */
        let DbClass

        before(async () => {
            DbClass = await variant.loadDbClass()
        })

        describe('Static helper methods', () => {
            it('resolveEnv returns default env file by default', () => {
                const envFile = DbClass.resolveEnv()
                assert.ok(envFile.endsWith('default-env.json'))
            })

            it('resolveEnv returns admin env file for admin flag', () => {
                const envFile = DbClass.resolveEnv({ admin: true })
                assert.ok(envFile.endsWith('default-env-admin.json'))
            })

            it('objectName expands wildcard patterns as expected', () => {
                assert.equal(DbClass.objectName('*'), '%')
                assert.equal(DbClass.objectName(undefined), '%')
                assert.equal(DbClass.objectName(null), '%')
                assert.equal(DbClass.objectName('TABLE'), 'TABLE%')
            })

            it('schemaCalc handles special schema markers', async () => {
                const fakeDb = {
                    /** @returns {Promise<any[]>} */
                    execSQL: async () => [{ CURRENT_SCHEMA: 'TEST_SCHEMA' }]
                }

                assert.equal(await DbClass.schemaCalc({ schema: '**CURRENT_SCHEMA**' }, fakeDb), 'TEST_SCHEMA')
                assert.equal(await DbClass.schemaCalc({ schema: '*' }, fakeDb), '%')
                assert.equal(await DbClass.schemaCalc({ schema: 'MY_SCHEMA' }, fakeDb), 'MY_SCHEMA')
            })
        })

        describe('Procedure output mapping', () => {
            it('maps single result set to outputScalar + results', async () => {
                const fakeClient = {
                    prepare: (
                        /** @type {string} */ _query,
                        /** @type {(error:any, statement:any)=>void} */ cb
                    ) => cb(null, {})
                }
                const db = new DbClass(fakeClient)
                const storedProc = (
                    /** @type {any} */ _input,
                    /** @type {(error:any, outputScalar:any, ...results:any[])=>void} */ cb
                ) => cb(null, { ERROR_CODE: 0 }, [{ ID: 1 }])

                const output = await db.callProcedurePromisified(storedProc, {})
                assert.deepEqual(output.outputScalar, { ERROR_CODE: 0 })
                assert.deepEqual(output.results, [{ ID: 1 }])
            })

            it('maps multiple result sets to results0/results1/...', async () => {
                const fakeClient = {
                    prepare: (
                        /** @type {string} */ _query,
                        /** @type {(error:any, statement:any)=>void} */ cb
                    ) => cb(null, {})
                }
                const db = new DbClass(fakeClient)
                const storedProc = (
                    /** @type {any} */ _input,
                    /** @type {(error:any, outputScalar:any, ...results:any[])=>void} */ cb
                ) => cb(null, { ERROR_CODE: 0 }, [{ A: 1 }], [{ B: 2 }])

                const output = await db.callProcedurePromisified(storedProc, {})
                assert.deepEqual(output.outputScalar, { ERROR_CODE: 0 })
                assert.deepEqual(output.results0, [{ A: 1 }])
                assert.deepEqual(output.results1, [{ B: 2 }])
            })
        })

        describe('Integration', function () {
            this.timeout(15000)

            before(async function () {
                try {
                    await withDb(DbClass, async (db) => {
                        const results = await db.execSQL('SELECT CURRENT_USER FROM DUMMY')
                        assert.equal(results.length, 1)
                    })
                } catch (_error) {
                    this.skip()
                }
            })

            it('returns a single row for DUMMY query', async () => {
                const results = await withDb(DbClass, async (db) => db.execSQL('SELECT CURRENT_USER, CURRENT_SCHEMA FROM DUMMY'))
                assert.equal(results.length, 1)
                assert.ok('CURRENT_USER' in results[0])
                assert.ok('CURRENT_SCHEMA' in results[0])
            })

            it('throws error for unknown table', async () => {
                await assert.rejects(
                    withDb(DbClass, async (db) => db.execSQL('SELECT CURRENT_USER, CURRENT_SCHEMA FROM DUMMY_DUMB')),
                    Error
                )
            })

            it('validates password procedure if available', async function () {
                try {
                    const shortPwdResult = await withDb(DbClass, async (db) => {
                        const sp = await db.loadProcedurePromisified(hdbext, 'SYS', 'IS_VALID_PASSWORD')
                        return db.callProcedurePromisified(sp, { PASSWORD: 'TEST' })
                    })
                    assert.equal(shortPwdResult.outputScalar.ERROR_CODE, 412)

                    const goodPwdResult = await withDb(DbClass, async (db) => {
                        const sp = await db.loadProcedurePromisified(hdbext, 'SYS', 'IS_VALID_PASSWORD')
                        return db.callProcedurePromisified(sp, { PASSWORD: 'TESTtest1234' })
                    })
                    assert.equal(goodPwdResult.outputScalar.ERROR_CODE, 0)
                } catch (error) {
                    if (/IS_VALID_PASSWORD|not found|insufficient privilege/i.test(String(error))) {
                        this.skip()
                    }
                    throw error
                }
            })

            it('throws error for unknown stored procedure', async () => {
                await assert.rejects(
                    withDb(DbClass, async (db) => {
                        const sp = await db.loadProcedurePromisified(hdbext, 'SYS', 'IS_VALID_PASSWORD_NOT_A_PROC')
                        return db.callProcedurePromisified(sp, { PASSWORD: 'TESTtest1234' })
                    }),
                    Error
                )
            })
        })
    })
}