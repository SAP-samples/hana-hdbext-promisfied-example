/**
 * hdb Await example
 * @param {string} [dbQuery] Database Query
 * @returns {Promise<object>} HANA ResultSet Object
 */
export function example1(dbQuery?: string): Promise<object>;
/**
 * hdb procedure example with Callbacks
 * @param {string} [schema] Database Stored Procedure Schema
 * @param {string} [dbProcedure] Database Stored Procedure Name
 * @param {object} [inputParams] Database Stored Procedure Input Parameters
 * @returns {Promise<object>} HANA ResultSet Object
 */
export function example2(schema?: string, dbProcedure?: string, inputParams?: object): Promise<object>;
