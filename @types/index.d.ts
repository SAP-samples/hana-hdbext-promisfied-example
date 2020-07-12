/// <reference types="node" />

declare module 'sap-hdbext-promisfied' {

    export default class {
    
        constructor(client: Object)
        static createConnectionFromEnv(envFile: String): Promise<Object>
        static createConnection(options: Object): Promise<Object>
        static resolveEnv(options?: Object): String
        static schemaCalc(options: Object, db: Object): String
        static objectName(name: String): String
        preparePromisified(query: String): Object
        statementExecPromisified(statement: Object, parameters:Object): Object
        loadProcedurePromisified(hdbext: Object, schema: String, procedure: String): Object
        execSQL(sql: String): Promise<Object>
        callProcedurePromisified(storedProc: String, inputParams: Object): Promise<Object>
    
    }
}
