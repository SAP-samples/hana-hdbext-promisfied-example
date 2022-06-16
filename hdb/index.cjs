/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0, dot-notation:0, no-use-before-define:0 */
/*eslint-env node, es6 */
// @ts-check
"use strict"
// @ts-ignore
const debug = require('debug')('hdb-promisified')
const dotenv = require('dotenv')
const xsenv = require("@sap/xsenv")
// @ts-ignore
const hdb = require("hdb")
const path = require("path")

/**
 * @module sap-hdb-promisfied - promises version of hdb
 */

 module.exports = class {

    /**
     * Create Database Connection From Environment
     * @param {string} [envFile] - Override with a specific Environment File 
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static createConnectionFromEnv(envFile) {
        return new Promise((resolve, reject) => {
            dotenv.config()
            xsenv.loadEnv(envFile)

            /** @type any */
            let options = ''
            try {
                if (!process.env.TARGET_CONTAINER) {
                    options = xsenv.getServices({ hana: { tag: 'hana' } })
                } else {
                    options = xsenv.getServices({ hana: { name: process.env.TARGET_CONTAINER } })
                }
            } catch (error) {
                try {
                    options = xsenv.getServices({ hana: { tag: 'hana', plan: "hdi-shared" } })
                } catch (error) {
                    console.error(error)
                    throw new Error(`Missing or badly formatted ${envFile}. No HANA configuration can be read or processed`)
                }
            }
            if(options.hana.encrypt){
                options.hana.useTLS = true
            }

            debug(`Connection Options`, options)
            let client = hdb.createClient(options.hana)
            client.on('error', (/** @type {any} */ err) => {
                console.log(`In Client On Error`)
                reject(err)
            })
            debug(`Client Ready State`, client.readyState)

            client.connect(async (/** @type {any} */ err) => {
                if (err) {
                    reject(err)
                }
                await this.setSchema(options, client)
                resolve(client)
            })
        })
    }

    /**
     * Create Database Connection with specific connection options in format expected by hdb
     * @param {any} options - Input options or parameters
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static async createConnection(options) {
        return new Promise(async function (resolve, reject) {
            if(options.hana.encrypt){
                options.hana.useTLS = true
            }
            debug(`Connection Options`, options)
            let client = hdb.createClient(options.hana)
            client.on('error', (/** @type {any} */ err) => {
                reject(err)
            })
            client.connect(async (/** @type {any} */ err) => {
                if (err) {
                    reject(err)
                }
                await this.setSchema(options, client)
                resolve(client)
            })
        })
    }

    /**
     * Set default schema based upon connection parameters
     * @param {any} options - Input options or parameters
     * @param {any} client - HANA Client instance of hdb
     */
    static async setSchema(options, client){
        if(options.hana){
            if(options.hana.schema){
                client.exec(`SET SCHEMA ${options.hana.schema}`, function () {
                   return
                  })
            }
        }
    }

    /**
     * Determine default env file name and location 
     * @param {any} options - Input options or parameters
     * @returns string - default env file name and path
     */
    static resolveEnv(options) {
        let file = 'default-env.json'
        if (options && options.hasOwnProperty('admin') && options.admin) {
            file = 'default-env-admin.json'
        }
        let envFile = path.resolve(process.cwd(), file)
        debug(`Environment File ${envFile}`)
        return envFile
    }

    /**
     * Calculation the current schema name
     * @param {any} options - Input options or parameters
     * @param {any} db - HANA Client instance of hdb
     * @returns {Promise<string>} - Schema  
     */
    async schemaCalc(options, db) {
        let schema = ''
        if (options.schema === '**CURRENT_SCHEMA**') {
            let schemaResults = await db.execSQL(`SELECT CURRENT_SCHEMA FROM DUMMY`)
            schema = schemaResults[0].CURRENT_SCHEMA
        }
        else if (options.schema === '*') {
            schema = "%"
        }
        else {
            schema = options.schema
        }
        debug(`Schema ${schema}`)
        return schema
    }

    /**
     * Load Metadata of a Stored Procedure
     * @param {any} db - HANA Client instance of hdb
     * @param {any} procInfo - Details of Schema/Stored Procedure to Lookup
     * @returns {Promise<any>} - Result Set  
     */    
    async fetchSPMetadata(db, procInfo) {
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
          ORDER BY PARAMS.POSITION"
        return await db.statementExecPromisified(await db.preparePromisified(sqlProcedureMetadata), [procInfo.schema, procInfo.name])
      }

    /**
     * Calculation Object name from wildcards
     * @param {string} name - DB object name
     * @returns {string} - final object name
     */
    static objectName(name) {
        if (typeof name === "undefined" || name === null || name === '*') {
            name = "%"
        } else {
            name += "%"
        }
        return name
    }

    /**
     * @constructor
     * @param {object} client - HANA DB Client instance of type hdb
     */
    constructor(client) {
        this.client = client
        // @ts-ignore
        this.util = require("util")
        this.client.promisePrepare = this.util.promisify(this.client.prepare)
    }

    /**
     * Destroy Client 
     */
    destroyClient() {
        // @ts-ignore
        if (!this.client.hadError && this.client.readyState !== 'closed') {
            // @ts-ignore
            this.client.end()
        }
    }

    /**
     * Destroy Client 
     */
    validateClient() {
        // @ts-ignore
        return (!this.client.hadError && this.client.readyState === 'connected')
    }

    /**
     * Prepare database statement 
     * @param {string} query - database query
     * @returns {any} - prepared statement object
     */
    preparePromisified(query) {
        debug(`Query:`, query)
        // @ts-ignore
        return this.client.promisePrepare(query)
    }

    /**
     * Execute DB Statement in Batch
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset 
     */
    statementExecBatchPromisified(statement, parameters) {
        statement.promiseExecBatch = this.util.promisify(statement.execBatch)
        return statement.promiseExecBatch(parameters)
    }

    /**
     * Execute DB Statement 
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset 
     */
    statementExecPromisified(statement, parameters) {
        statement.promiseExec = this.util.promisify(statement.exec)
        return statement.promiseExec(parameters)
    }

    /**
     * Load stored procedure and return proxy function
     * @param {string} schema - Schema name can be null
     * @param {string} procedure - DB procedure name
     * @returns {Promise<function>} - proxy function
     */
    async loadProcedurePromisified(schema, procedure) {
        if(!schema){
           schema = await this.schemaCalc({schema: '**CURRENT_SCHEMA**'}, this)
        }
        let procedureMetaData = await this.fetchSPMetadata(this, {schema: schema, name: procedure})
        let callString = ''
        procedureMetaData.forEach(() => {
            if(callString === ''){
                callString += `?`
            }else {
                callString += `,?`
            }
          })

        return this.preparePromisified(`CALL ${schema}.${procedure}(${callString})`)
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
                            resolve(results)
                        })
                        .catch(err => {
                            reject(err)
                        });
                })
                .catch((/** @type {any} */ err) => {
                    reject(err)
                })
        })
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
                    reject(error)
                } else {
                    if (results.length < 2) {
                        resolve({
                            outputScalar: outputScalar,
                            results: results[0]
                        })
                    } else {
                        let output = {};
                        output.outputScalar = outputScalar;
                        for (let i = 0; i < results.length; i++) {
                            // @ts-ignore
                            output[`results${i}`] = results[i]
                        }
                        resolve(output)
                    }
                }
            })
        })
    }

}

