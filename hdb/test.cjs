// @ts-check
/**
 * Test #1
 */
async function test1() {
    // @ts-ignore
    const dbClass = require('./index.cjs')
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
test1()

/**
 * Test #2
 */
async function test2() {
    try {
        // @ts-ignore
        const dbClass = require('./index.cjs')
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                                     FROM "DUMMY"`)
        const results = await db.statementExecPromisified(statement, [])
        console.table(results)
    } catch (err) {
        console.error(`ERROR: ${err.toString()}`)
    }
}
test2()