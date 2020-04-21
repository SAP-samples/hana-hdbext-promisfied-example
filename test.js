
async function test1() {
    const dbClass = require('./index')
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

async function test2() {
    try {
        const dbClass = require('./index')
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
        const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                                     FROM "DUMMY"`)
        const results = await db.statementExecPromisified(statement, [])
        console.table(results)
    } catch (e) {
        console.error(`ERROR: ${err.toString()}`)
    }
}
test2()