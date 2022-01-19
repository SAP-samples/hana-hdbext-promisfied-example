"use strict";
/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0, dot-notation:0, no-use-before-define:0 */
/*eslint-env node, es6 */
// @ts-check
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debug = void 0;
const debug_1 = __importDefault(require("debug"));
// @ts-ignore
exports.debug = new debug_1.default('hdb-promisified');
const dotenv = __importStar(require("dotenv"));
const xsenv = __importStar(require("@sap/xsenv"));
// @ts-ignore
const hdb = __importStar(require("hdb"));
const path = __importStar(require("path"));
const util_1 = require("util");
/**
 * @module sap-hdb-promisfied - promises version of hdb
 */
class dbClass {
    /**
     * Create Database Connection From Environment
     * @param {string} [envFile] - Override with a specific Environment File
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static createConnectionFromEnv(envFile) {
        return new Promise((resolve, reject) => {
            dotenv.config();
            xsenv.loadEnv(envFile);
            /** @type any */
            let options = '';
            try {
                if (!process.env.TARGET_CONTAINER) {
                    options = xsenv.getServices({ hana: { tag: 'hana' } });
                }
                else {
                    options = xsenv.getServices({ hana: { name: process.env.TARGET_CONTAINER } });
                }
            }
            catch (error) {
                try {
                    options = xsenv.getServices({ hana: { tag: 'hana', plan: "hdi-shared" } });
                }
                catch (error) {
                    console.error(error);
                    throw new Error(`Missing or badly formatted ${envFile}. No HANA configuration can be read or processed`);
                }
            }
            (0, exports.debug)(`Connection Options`, options);
            let client = hdb.createClient(options.hana);
            client.on('error', (/** @type {any} */ err) => {
                console.log(`In Client On Error`);
                reject(err);
            });
            (0, exports.debug)(`Client Ready State`, client.readyState);
            client.connect((/** @type {any} */ err) => {
                if (err) {
                    reject(err);
                }
                resolve(client);
            });
        });
    }
    /**
     * Create Database Connection with specific conneciton options in format expected by hdb
     * @param {any} options - Input options or parameters
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static createConnection(options) {
        return new Promise((resolve, reject) => {
            (0, exports.debug)(`Connection Options`, options);
            let client = hdb.createClient(options.hana);
            client.on('error', (/** @type {any} */ err) => {
                reject(err);
            });
            client.connect((/** @type {any} */ err) => {
                if (err) {
                    reject(err);
                }
                resolve(client);
            });
        });
    }
    /**
     * Determine default env file name and lcoation
     * @param {any} options - Input options or parameters
     * @returns string - default env file name and path
     */
    static resolveEnv(options) {
        let file = 'default-env.json';
        if (options && options.hasOwnProperty('admin') && options.admin) {
            file = 'default-env-admin.json';
        }
        let envFile = path.resolve(process.cwd(), file);
        (0, exports.debug)(`Environment File ${envFile}`);
        return envFile;
    }
    /**
     * Calcuation the current schema name
     * @param {any} options - Input options or parameters
     * @param {any} db - HANA Client instance of hdb
     * @returns {Promise<string>} - Schema
     */
    static async schemaCalc(options, db) {
        let schema = '';
        if (options.schema === '**CURRENT_SCHEMA**') {
            let schemaResults = await db.execSQL(`SELECT CURRENT_SCHEMA FROM DUMMY`);
            schema = schemaResults[0].CURRENT_SCHEMA;
        }
        else if (options.schema === '*') {
            schema = "%";
        }
        else {
            schema = options.schema;
        }
        (0, exports.debug)(`Schema ${schema}`);
        return schema;
    }
    /**
     * Load Metadata of a Stored Procedure
     * @param {any} db - HANA Client instance of hdb
     * @param {any} procInfo - Details of Schmea/Stored Procedure to Lookup
     * @returns {Promise<any>} - Result Set
     */
    static async fetchSPMetadata(db, procInfo) {
        var sqlProcedureMetadata = "SELECT \
          PARAMS.PARAMETER_NAME,           \
          PARAMS.DATA_TYPE_NAME,           \
          PARAMS.PARAMETER_TYPE,           \
          PARAMS.HAS_DEFAULT_VALUE,        \
          PARAMS.IS_INPLACE_TYPE,          \
          PARAMS.TABLE_TYPE_SCHEMA,        \
          PARAMS.TABLE_TYPE_NAME,          \
                                           \
          CASE WHEN SYNONYMS.OBJECT_NAME IS NULL THEN 'FALSE' ELSE 'TRUE' END AS IS_TABLE_TYPE_SYNONYM,         \
          IFNULL(SYNONYMS.OBJECT_SCHEMA, '') AS OBJECT_SCHEMA,                                                  \
          IFNULL(SYNONYMS.OBJECT_NAME, '') AS OBJECT_NAME                                                       \
                                                                                                                \
          FROM SYS.PROCEDURE_PARAMETERS AS PARAMS                                                               \
          LEFT JOIN SYS.SYNONYMS AS SYNONYMS                                                                    \
          ON SYNONYMS.SCHEMA_NAME = PARAMS.TABLE_TYPE_SCHEMA AND SYNONYMS.SYNONYM_NAME = PARAMS.TABLE_TYPE_NAME \
          WHERE PARAMS.SCHEMA_NAME = ? AND PARAMS.PROCEDURE_NAME = ?                                            \
          ORDER BY PARAMS.POSITION";
        return await db.statementExecPromisified(await db.preparePromisified(sqlProcedureMetadata), [procInfo.schema, procInfo.name]);
    }
    /**
     * Calcuation Object name from wildcards
     * @param {string} name - DB object name
     * @returns {string} - final object name
     */
    static objectName(name) {
        if (typeof name === "undefined" || name === null || name === '*') {
            name = "%";
        }
        else {
            name += "%";
        }
        return name;
    }
    /**
     * @constructor
     * @param {object} client - HANA DB Client instance of type hdb
     */
    constructor(client) {
        this.client = client;
        // @ts-ignore
        this.client.promisePrepare = (0, util_1.promisify)(this.client.prepare);
    }
    /**
     * Destroy Client
     */
    destroyClient() {
        // @ts-ignore
        if (!this.client.hadError && this.client.readyState !== 'closed') {
            // @ts-ignore
            this.client.end();
        }
    }
    /**
     * Destroy Client
     */
    validateClient() {
        // @ts-ignore
        return (!this.client.hadError && this.client.readyState === 'connected');
    }
    /**
     * Prepare database statement
     * @param {string} query - database query
     * @returns {any} - prepared statement object
     */
    preparePromisified(query) {
        (0, exports.debug)(`Query:`, query);
        // @ts-ignore
        return this.client.promisePrepare(query);
    }
    /**
     * Execute DB Statement in Batch
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset
     */
    statementExecBatchPromisified(statement, parameters) {
        statement.promiseExecBatch = (0, util_1.promisify)(statement.execBatch);
        return statement.promiseExecBatch(parameters);
    }
    /**
     * Execute DB Statement
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset
     */
    statementExecPromisified(statement, parameters) {
        statement.promiseExec = (0, util_1.promisify)(statement.exec);
        return statement.promiseExec(parameters);
    }
    /**
     * Load stored procedure and return proxy function
     * @param {string} schema - Schema name can be null
     * @param {string} procedure - DB procedure name
     * @returns {Promise<function>} - proxy function
     */
    async loadProcedurePromisified(schema, procedure) {
        if (!schema) {
            schema = await dbClass.schemaCalc({ schema: '**CURRENT_SCHEMA**' }, this);
        }
        let procedureMetaData = await dbClass.fetchSPMetadata(this, { schema: schema, name: procedure });
        let callString = '';
        procedureMetaData.forEach(() => {
            if (callString === '') {
                callString += `?`;
            }
            else {
                callString += `,?`;
            }
        });
        return this.preparePromisified(`CALL ${schema}.${procedure}(${callString})`);
    }
    /**
     * Execute single SQL Statement and directly return result set
     * @param {string} sql - SQL Statement
     * @returns {Promise<any>} - result set object
     */
    execSQL(sql) {
        return new Promise((resolve, reject) => {
            this.preparePromisified(sql)
                .then((/** @type {any} */ statement) => {
                this.statementExecPromisified(statement, [])
                    .then(results => {
                    resolve(results);
                })
                    .catch(err => {
                    reject(err);
                });
            })
                .catch((/** @type {any} */ err) => {
                reject(err);
            });
        });
    }
    /**
     * Call Database Procedure
     * @param {any} storedProc - stored procedure proxy function
     * @param {any} inputParams - input parameters for the stored procedure
     * @returns
     */
    callProcedurePromisified(storedProc, inputParams) {
        return new Promise((resolve, reject) => {
            // @ts-ignore
            storedProc.exec(inputParams, (/** @type {any} */ error, /** @type {any} */ outputScalar, /** @type {string | any[]} */ ...results) => {
                // storedProc(inputParams, (error, outputScalar, ...results) => {
                if (error) {
                    reject(error);
                }
                else {
                    if (results.length < 2) {
                        resolve({
                            outputScalar: outputScalar,
                            results: results[0]
                        });
                    }
                    else {
                        let output = {};
                        output.outputScalar = outputScalar;
                        for (let i = 0; i < results.length; i++) {
                            // @ts-ignore
                            output[`results${i}`] = results[i];
                        }
                        resolve(output);
                    }
                }
            });
        });
    }
}
exports.default = dbClass;
