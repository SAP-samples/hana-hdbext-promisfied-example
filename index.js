/*eslint no-console: 0, no-unused-vars: 0, no-shadow: 0, new-cap: 0, dot-notation:0, no-use-before-define:0 */
/*eslint-env node, es6 */
"use strict";
const debug = require('debug')('hdbext-promisified')

module.exports = class {

    static createConnectionFromEnv(envFile) {
        return new Promise((resolve, reject) => {
            require('dotenv').config()
            const xsenv = require("@sap/xsenv")
            xsenv.loadEnv(envFile)

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

    static objectName(name) {
        if (typeof name === "undefined" || name === null || name === '*') {
            name = "%"
        } else {
            name += "%"
        }
        return name
    }

    constructor(client) {
        this.client = client
        this.util = require("util")
        this.client.promisePrepare = this.util.promisify(this.client.prepare)
    }

    preparePromisified(query) {
        debug(`Query:`, query)
        return this.client.promisePrepare(query)
    }

    statementExecBatchPromisified(statement, parameters) {
        statement.promiseExecBatch = this.util.promisify(statement.execBatch)
        return statement.promiseExecBatch(parameters)
    }

    statementExecPromisified(statement, parameters) {
        statement.promiseExec = this.util.promisify(statement.exec)
        return statement.promiseExec(parameters)
    }    

    loadProcedurePromisified(hdbext, schema, procedure) {
        hdbext.promiseLoadProcedure = this.util.promisify(hdbext.loadProcedure)
        return hdbext.promiseLoadProcedure(this.client, schema, procedure)
    }

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
