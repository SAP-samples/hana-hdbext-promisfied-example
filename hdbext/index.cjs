/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0, dot-notation:0, no-use-before-define:0 */
/*eslint-env node, es6 */
// @ts-check
"use strict";
const debug = require('debug')('hdbext-promisified')

/**
 * @module sap-hdbext-promisfied - promises version of sap/hdbext
 */

module.exports = class {

    /**
     * Create Database Connection From Environment
     * @param {string} [envFile] - Override with a specific Environment File 
     * @returns {Promise<any>} - HANA Client instance of sap/hdbext
     */
    static createConnectionFromEnv(envFile) {
        return new Promise((resolve, reject) => {
            require('dotenv').config()
            const xsenv = require("@sap/xsenv")
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
            debug(`Connection Options`, options)
            var hdbext = require("@sap/hdbext")
            options.hana.pooling = true
            hdbext.createConnection(options.hana, (error, client) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(client)
                }
            })
        })
    }

    /**
     * Create Database Connection with specific connection options in format expected by sap/hdbext
     * @param {any} options - Input options or parameters
     * @returns {Promise<any>} - HANA Client instance of sap/hdbext
     */
    static createConnection(options) {
        return new Promise((resolve, reject) => {
            var hdbext = require("@sap/hdbext")

            options.pooling = true
            debug(`Connection Options`, options)
            hdbext.createConnection(options, (error, client) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(client)
                }
            })
        })
    }

    /**
     * Determine default env file name and location 
     * @param {any} options - Input options or parameters
     * @returns string - default env file name and path
     */
    static resolveEnv(options) {
        let path = require("path")
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
     * @param {any} db - HANA Client instance of sap/hdbext
     * @returns {Promise<string>} - Schema  
     */
    static async schemaCalc(options, db) {
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
     * @param {object} client - HANA DB Client instance of type sap/hdbext 
     */
    constructor(client) {
        this.client = client
        this.util = require("util")
        this.client.promisePrepare = this.util.promisify(this.client.prepare)
    }

    /**
     * Prepare database statement 
     * @param {string} query - database query
     * @returns {any} - prepared statement object
     */
    preparePromisified(query) {
        debug(`Query:`, query)
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
     * @param {any} hdbext - instance of db client sap/hdbext
     * @param {string} schema - Schema name can be null
     * @param {string} procedure - DB procedure name
     * @returns {Promise<function>} - proxy function
     */
    loadProcedurePromisified(hdbext, schema, procedure) {
        hdbext.promiseLoadProcedure = this.util.promisify(hdbext.loadProcedure)
        return hdbext.promiseLoadProcedure(this.client, schema, procedure)
    }

    /**
     * Execute single SQL Statement and directly return result set
     * @param {string} sql - SQL Statement
     * @returns {Promise<any>} - result set object
     */
    execSQL(sql) {
        return new Promise((resolve, reject) => {
            this.preparePromisified(sql)
                .then(statement => {
                    this.statementExecPromisified(statement, [])
                        .then(results => {
                            resolve(results)
                        })
                        .catch(err => {
                            reject(err)
                        });
                })
                .catch(err => {
                    reject(err)
                })
        })
    }

    /**
     * Call Database Procedure
     * @param {function} storedProc - stored procedure proxy function
     * @param {any} inputParams - input parameters for the stored procedure
     * @returns 
     */
    callProcedurePromisified(storedProc, inputParams) {
        return new Promise((resolve, reject) => {
            storedProc(inputParams, (error, outputScalar, ...results) => {
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
                            output[`results${i}`] = results[i]
                        }
                        resolve(output)
                    }
                }
            })
        })
    }

}
