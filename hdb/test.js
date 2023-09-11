// @ts-check
import { performance, PerformanceObserver } from "perf_hooks"
import dbClass from './index.js'
import * as xsenv from '@sap/xsenv'

//import * as hdbext from '@sap/hdbext'
const perfObserver = new PerformanceObserver((items) => {
    items.getEntries().forEach((entry) => {
        console.log(entry)
    })
})
perfObserver.observe({ entryTypes: ["measure"] })

/**
 * Test #1
 */
export async function test1() {
    performance.mark("1-start")
    let envFile = dbClass.resolveEnv(null)
    dbClass.createConnectionFromEnv(envFile)
        .then((/** @type {any} */ client) => {
            let db = new dbClass(client)
            db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                             FROM "DUMMY"`)
                .then((/** @type {any} */ statement) => {
                    db.statementExecPromisified(statement, [])
                        .then(/** @type {any} */(/** @type {any} */ results) => {
                            console.table(results)
                            db.destroyClient()
                            performance.mark("1-end")
                            performance.measure("Test #1", "1-start", "1-end")
                        })
                        .catch(/** @type {any} */(/** @type {{ toString: () => any; }} */ err) => {
                            console.error(`ERROR: ${err.toString()}`)
                        })
                })
                .catch((/** @type {{ toString: () => any; }} */ err) => {
                    console.error(`ERROR: ${err.toString()}`)
                })
        })
        .catch((/** @type {{ toString: () => any; }} */ err) => {
            console.error(`ERROR: ${err.toString()}`)
        })
}


/**
 * Test #2
 */
export async function test2() {
    performance.mark("2-start")
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                                     FROM "DUMMY"`)
        const results = await db.statementExecPromisified(statement, [])
        console.table(results)
        db.destroyClient()
        performance.mark("2-end")
        performance.measure("Test #2", "2-start", "2-end")
    } catch (/** @type {any} */ err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}


/**
 * Test #2.1 Current Schema
 */
export async function test2_1() {
    performance.mark("2.1-start")
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        let schema = await dbClass.schemaCalc({ schema: '**CURRENT_SCHEMA**' }, db)
        console.log(`Current Schema: ${schema}`)
        db.destroyClient()
        performance.mark("2.1-end")
        performance.measure("Test #2.1", "2.1-start", "2.1-end")
    } catch (/** @type {any} */ err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}


/**
 * Test #2.2
 */
export async function test2_2() {
    performance.mark("2.2-start")
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        const statement = await db.preparePromisified(`select top 50 SCHEMA_NAME, TABLE_NAME from TABLES WHERE SCHEMA_NAME = ?`)
        const results = await db.statementExecPromisified(statement, ['SYS'])
        console.table(results)
        db.destroyClient()
        performance.mark("2.2-end")
        performance.measure("Test #2.2", "2.2-start", "2.2-end")
    } catch (/** @type {any} */ err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}


/**
 * Test #3
 */
export async function test3() {
    performance.mark("3-start")
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        let sp = await db.loadProcedurePromisified('SYS', 'IS_VALID_PASSWORD')
        let output = await db.callProcedurePromisified(sp, { PASSWORD: "TEST" })

        console.table(output)
        db.destroyClient()
        performance.mark("3-end")
        performance.measure("Test #3", "3-start", "3-end")
    } catch (/** @type {any} */ err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}

export async function testUps() {
    try {
        xsenv.loadEnv()
        let userProvidedHanaEnv = xsenv.serviceCredentials({ label: 'user-provided' })
        console.log("credentials for user provided")
        console.log(userProvidedHanaEnv)
        let connectionDetails = { hana: userProvidedHanaEnv }
        console.log(connectionDetails.hana)
        // let db = new dbClass(await dbClass.createConnection(dbClass.resolveEnv(null)));
        const db = new dbClass(await dbClass.createConnection(connectionDetails))
        const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                               FROM "DUMMY"`)
        const results = await db.statementExecPromisified(statement, [])
        console.table(results)
        db.destroyClient()
    } catch (/** @type {any} */ err) {
        console.error(`ERROR: ${err.toString()}`)
    }

}

test1()
test2()
test2_1()
test2_2()
test3() 
testUps()
