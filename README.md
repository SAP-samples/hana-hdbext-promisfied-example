# Promisfied Wrapper around @sap/hdbext and [hdb](hdb/README.md)

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/hana-hdbext-promisfied-example)](https://api.reuse.software/info/github.com/SAP-samples/hana-hdbext-promisfied-example)

## Description

With the standard @sap/hdbext you use nested events and callbacks like this:

```JavaScript
let client = req.db;
client.prepare(
 `SELECT SESSION_USER, CURRENT_SCHEMA 
     FROM "DUMMY"`,
 (err, statement) => {
  if (err) {
   return res.type("text/plain").status(500).send(`ERROR: ${err.toString()}`);
  }
  statement.exec([], (err, results) => {
   if (err) {
    return res.type("text/plain").status(500).send(`ERROR: ${err.toString()}`);
   } else {
    var result = JSON.stringify({
     Objects: results
    });
    return res.type("application/json").status(200).send(result);
   }
  });
  return null;
 });
```

However this module wraps the major features of @sap/hdbext in a ES6 class and returns promises. Therefore you could re-write the above block using the easier to read and maintain promise based approach.  You just pass in an instance of the HANA Client @sap/hdbext module. In this example its a typical example that gets the HANA client as Express Middelware (req.db):

```JavaScript
const dbClass = require("sap-hdbext-promisfied")
let db = new dbClass(req.db)
db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                FROM "DUMMY"`)
 .then(statement => {
  db.statementExecPromisified(statement, [])
   .then(results => {
    let result = JSON.stringify({
     Objects: results
    })
    return res.type("application/json").status(200).send(result)
   })
   .catch(err => {
    return res.type("text/plain").status(500).send(`ERROR: ${err.toString()}`)
   })
 })
 .catch(err => {
  return res.type("text/plain").status(500).send(`ERROR: ${err.toString()}`)
 })
```

Or better yet if you are running Node.js 8.x or higher you can use the new AWAIT feature and the code is even more streamlined:

```JavaScript
try {
 const dbClass = require("sap-hdbext-promisfied")
 let db = new dbClass(req.db);
 const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                       FROM "DUMMY"`)
 const results = await db.statementExecPromisified(statement, [])
 let result = JSON.stringify({
  Objects: results
 })
 return res.type("application/json").status(200).send(result)
} catch (e) {
 return res.type("text/plain").status(500).send(`ERROR: ${e.toString()}`)
}
```

There are even static helpers to load the HANA connection information from the environment (or local testing file like default-env.json or .env) and create the HANA client for you.  We can adjust the above example for such a scenario:

```JavaScript
try {
    const dbClass = require("sap-hdbext-promisfied")
    let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)))
    const statement = await db.preparePromisified(`SELECT SESSION_USER, CURRENT_SCHEMA 
                                                     FROM "DUMMY"`)
    const results = await db.statementExecPromisified(statement, [])
    console.table(results)
} catch (e) {
    console.error(`ERROR: ${err.toString()}`)
}
```

### Methods

The following @sap/hdbext functions are exposed as promise-based methods

```JavaScript
prepare = preparePromisified(query)
statement.exec = statementExecPromisified(statement, parameters)
loadProcedure = loadProcedurePromisified(hdbext, schema, procedure)
storedProc = callProcedurePromisified(storedProc, inputParams)
```

We also have the simplified helper method to both prepare and execute a simple statement via one command:

```JavaScript
execSQL(sql)
```

And finally there are static helpers

```JavaScript
createConnectionFromEnv(envFile)
createConnection(options)
resolveEnv(options)
schemaCalc(options, db)
objectName(name)
```

## Requirements / Download and Installation

* Install Node.js version 12.x or 14.x on your development machine [https://nodejs.org/en/download/](https://nodejs.org/en/download/)

* @sap Node.js packages have moved from [https://npm.sap.com](https://npm.sap.com]) to the default registry <https://registry.npmjs.org>. As future versions of @sap modules are going to be published only there, please make sure to adjust your registry with:

```shell
npm config delete @sap:registry
```

* Install the code sample as a reusable Node.js module

```shell
npm install -g sap-hdbext-promisfied
```

Or you can leverage this module by just listing as requirement in your own project's package.json.

Finally you can clone the repository from [https://github.com/SAP-samples/hana-hdbext-promisified-example](https://github.com/SAP-samples/hana-hdbext-promisfied-example) to study the source content and view the consumption examples (test.js)

## Known Issues

None

## How to obtain support

This project is provided "as-is": there is no guarantee that raised issues will be answered or addressed in future releases.

## License

Copyright (c) 2025 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](LICENSES/Apache-2.0.txt) file.
