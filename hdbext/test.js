// @ts-check
import { performance, PerformanceObserver } from "perf_hooks"
import dbClass from './index.js'
import * as hdbext from '@sap/hdbext'
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
        .then(client => {
            let db = new dbClass(client)
            db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                             FROM "DUMMY"`)
                .then(statement => {
                    db.statementExecPromisified(statement, [])
                        .then(results => {
                            console.table(results)
                            performance.mark("1-end")
                            performance.measure("Test #1", "1-start", "1-end")
                        })
                        .catch(err => {
                            console.error(`ERROR: ${err.toString()}`)
                        })
                })
                .catch(err => {
                    console.error(`ERROR: ${err.toString()}`)
                })
        })
        .catch(err => {
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
        performance.mark("2-end")
        performance.measure("Test #2", "2-start", "2-end")
    } catch (err) {
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
        let sp = await db.loadProcedurePromisified(hdbext, 'SYS', 'IS_VALID_PASSWORD')
        let output = await db.callProcedurePromisified(sp, {PASSWORD: "TEST"})

        console.table(output)
        performance.mark("3-end")
        performance.measure("Test #3", "3-start", "3-end")
    } catch (err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}

test3()
test1()
test2()
test3()