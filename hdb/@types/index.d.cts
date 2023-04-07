/// <reference types="node" />
export = exports;
declare class exports {
    /**
     * Create Database Connection From Environment
     * @param {string} [envFile] - Override with a specific Environment File
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static createConnectionFromEnv(envFile?: string): Promise<any>;
    /**
     * Create Database Connection with specific connection options in format expected by hdb
     * @param {any} options - Input options or parameters
     * @returns {Promise<any>} - HANA Client instance of hdb
     */
    static createConnection(options: any): Promise<any>;
    /**
     * Set default schema based upon connection parameters
     * @param {any} options - Input options or parameters
     * @param {any} client - HANA Client instance of hdb
     */
    static setSchema(options: any, client: any): Promise<void>;
    /**
     * Determine default env file name and location
     * @param {any} options - Input options or parameters
     * @returns string - default env file name and path
     */
    static resolveEnv(options: any): string;
    /**
     * Calculation Object name from wildcards
     * @param {string} name - DB object name
     * @returns {string} - final object name
     */
    static objectName(name: string): string;
    /**
     * @constructor
     * @param {object} client - HANA DB Client instance of type hdb
     */
    constructor(client: object);
    /**
     * Calculation the current schema name
     * @param {any} options - Input options or parameters
     * @param {any} db - HANA Client instance of hdb
     * @returns {Promise<string>} - Schema
     */
    schemaCalc(options: any, db: any): Promise<string>;
    /**
     * Load Metadata of a Stored Procedure
     * @param {any} db - HANA Client instance of hdb
     * @param {any} procInfo - Details of Schema/Stored Procedure to Lookup
     * @returns {Promise<any>} - Result Set
     */
    fetchSPMetadata(db: any, procInfo: any): Promise<any>;
    client: any;
    util: typeof import("util");
    /**
     * Destroy Client
     */
    destroyClient(): void;
    /**
     * Destroy Client
     */
    validateClient(): boolean;
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
     * @param {string} schema - Schema name can be null
     * @param {string} procedure - DB procedure name
     * @returns {Promise<function>} - proxy function
     */
    loadProcedurePromisified(schema: string, procedure: string): Promise<Function>;
    /**
     * Execute single SQL Statement and directly return result set
     * @param {string} sql - SQL Statement
     * @returns {Promise<any>} - result set object
     */
    execSQL(sql: string): Promise<any>;
    /**
     * Call Database Procedure
     * @param {any} storedProc - stored procedure proxy function
     * @param {any} inputParams - input parameters for the stored procedure
     * @returns
     */
    callProcedurePromisified(storedProc: any, inputParams: any): Promise<any>;
}
