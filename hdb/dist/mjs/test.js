// @ts-check
import dbClass from './index.js';
//import * as hdbext from '@sap/hdbext'
/**
 * Test #1
 */
export async function test1() {
    let envFile = dbClass.resolveEnv(null);
    dbClass.createConnectionFromEnv(envFile)
        .then((/** @type {any} */ client) => {
        let db = new dbClass(client);
        db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                             FROM "DUMMY"`)
            .then((/** @type {any} */ statement) => {
            db.statementExecPromisified(statement, [])
                .then(/** @type {any} */ (/** @type {any} */ results) => {
                console.table(results);
                db.destroyClient();
            })
                .catch(/** @type {any} */ (/** @type {{ toString: () => any; }} */ err) => {
                console.error(`ERROR: ${err.toString()}`);
            });
        })
            .catch((/** @type {{ toString: () => any; }} */ err) => {
            console.error(`ERROR: ${err.toString()}`);
        });
    })
        .catch((/** @type {{ toString: () => any; }} */ err) => {
        console.error(`ERROR: ${err.toString()}`);
    });
}
test1();
/**
 * Test #2
 */
export async function test2() {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
        const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                                     FROM "DUMMY"`);
        const results = await db.statementExecPromisified(statement, []);
        console.table(results);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
test2();
/**
 * Test #2.1 Current Schema
 */
export async function test2_1() {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
        let schema = await dbClass.schemaCalc({ schema: '**CURRENT_SCHEMA**' }, db);
        console.log(`Current Schema: ${schema}`);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
test2_1();
/**
 * Test #2.2
 */
export async function test2_2() {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
        const statement = await db.preparePromisified(`select top 50 SCHEMA_NAME, TABLE_NAME from TABLES WHERE SCHEMA_NAME = ?`);
        const results = await db.statementExecPromisified(statement, ['SYS']);
        console.table(results);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
test2_2();
/**
 * Test #3
 */
export async function test3() {
    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
        let sp = await db.loadProcedurePromisified('SYS', 'IS_VALID_PASSWORD');
        let output = await db.callProcedurePromisified(sp, { PASSWORD: "TEST" });
        console.table(output);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
test3();
