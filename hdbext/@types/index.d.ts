export const debug: any;
/**
 * @module sap-hdbext-promisfied - promises version of sap/hdbext
 */
export default class dbClass {
    /**
     * Create Database Connection From Environment
     * @param {string} [envFile] - Override with a specific Environment File
     * @returns {Promise<any>} - HANA Client instance of sap/hdbext
     */
    static createConnectionFromEnv(envFile?: string): Promise<any>;
    /**
     * Create Database Connection with specific connection options in format expected by sap/hdbext
     * @param {any} options - Input options or parameters
     * @returns {Promise<any>} - HANA Client instance of sap/hdbext
     */
    static createConnection(options: any): Promise<any>;
    /**
     * Determine default env file name and location
     * @param {any} options - Input options or parameters
     * @returns string - default env file name and path
     */
    static resolveEnv(options: any): string;
    /**
     * Calculation the current schema name
     * @param {any} options - Input options or parameters
     * @param {any} db - HANA Client instance of sap/hdbext
     * @returns {Promise<string>} - Schema
     */
    static schemaCalc(options: any, db: any): Promise<string>;
    /**
     * Calculation Object name from wildcards
     * @param {string} name - DB object name
     * @returns {string} - final object name
     */
    static objectName(name: string): string;
    /**
     * @constructor
     * @param {object} client - HANA DB Client instance of type sap/hdbext
     */
    constructor(client: object);
    client: any;
    /**
     * Prepare database statement
     * @param {string} query - database query
     * @returns {any} - prepared statement object
     */
    preparePromisified(query: string): any;
    /**
     * Execute DB Statement in Batch
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset
     */
    statementExecBatchPromisified(statement: any, parameters: any): Promise<any>;
    /**
     * Execute DB Statement
     * @param {any} statement - prepared statement object
     * @param {any} parameters - query parameters
     * @returns {Promise<any>} - resultset
     */
    statementExecPromisified(statement: any, parameters: any): Promise<any>;
    /**
     * Load stored procedure and return proxy function
     * @param {any} hdbext - instance of db client sap/hdbext
     * @param {string} schema - Schema name can be null
     * @param {string} procedure - DB procedure name
     * @returns {Promise<function>} - proxy function
     */
    loadProcedurePromisified(hdbext: any, schema: string, procedure: string): Promise<Function>;
    /**
     * Execute single SQL Statement and directly return result set
     * @param {string} sql - SQL Statement
     * @returns {Promise<any>} - result set object
     */
    execSQL(sql: string): Promise<any>;
    /**
     * Call Database Procedure
     * @param {function} storedProc - stored procedure proxy function
     * @param {any} inputParams - input parameters for the stored procedure
     * @returns
     */
    callProcedurePromisified(storedProc: Function, inputParams: any): Promise<any>;
}
