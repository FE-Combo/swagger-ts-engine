const generate = require("./index")

generate({
    serverUrl:"https://petstore.swagger.io/v2/swagger.json",
    servicePath:"/output/api",
    requestImportExpression: "import { request } from '@/utils/fetch';"
});