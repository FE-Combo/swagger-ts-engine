const generate = require("./index");

generate({
  debugger:true,
  serverUrl: "https://petstore.swagger.io/v2/swagger.json",
  servicePath: "/output",
  requestImportExpression: "import { request } from '@/utils/fetch';",
  additionalPageHeader: `
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/consistent-type-imports */
`,
});
