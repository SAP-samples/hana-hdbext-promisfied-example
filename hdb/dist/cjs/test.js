"use strict";
// @ts-check
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.test3 = exports.test2_2 = exports.test2_1 = exports.test2 = exports.test1 = void 0;
const index_js_1 = __importDefault(require("./index.js"));
//import * as hdbext from '@sap/hdbext'
/**
 * Test #1
 */
async function test1() {
    let envFile = index_js_1.default.resolveEnv(null);
    index_js_1.default.createConnectionFromEnv(envFile)
        .then((/** @type {any} */ client) => {
        let db = new index_js_1.default(client);
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
exports.test1 = test1;
test1();
/**
 * Test #2
 */
async function test2() {
    try {
        let db = new index_js_1.default(await index_js_1.default.createConnectionFromEnv(index_js_1.default.resolveEnv(null)));
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
exports.test2 = test2;
test2();
/**
 * Test #2.1 Current Schema
 */
async function test2_1() {
    try {
        let db = new index_js_1.default(await index_js_1.default.createConnectionFromEnv(index_js_1.default.resolveEnv(null)));
        let schema = await index_js_1.default.schemaCalc({ schema: '**CURRENT_SCHEMA**' }, db);
        console.log(`Current Schema: ${schema}`);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
exports.test2_1 = test2_1;
test2_1();
/**
 * Test #2.2
 */
async function test2_2() {
    try {
        let db = new index_js_1.default(await index_js_1.default.createConnectionFromEnv(index_js_1.default.resolveEnv(null)));
        const statement = await db.preparePromisified(`select top 50 SCHEMA_NAME, TABLE_NAME from TABLES WHERE SCHEMA_NAME = ?`);
        const results = await db.statementExecPromisified(statement, ['SYS']);
        console.table(results);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
exports.test2_2 = test2_2;
test2_2();
/**
 * Test #3
 */
async function test3() {
    try {
        let db = new index_js_1.default(await index_js_1.default.createConnectionFromEnv(index_js_1.default.resolveEnv(null)));
        let sp = await db.loadProcedurePromisified('SYS', 'IS_VALID_PASSWORD');
        let output = await db.callProcedurePromisified(sp, { PASSWORD: "TEST" });
        console.table(output);
        db.destroyClient();
    }
    catch ( /** @type {any} */err) {
        console.error(`ERROR: ${err.toString()}`);
    }
}
exports.test3 = test3;
test3();
