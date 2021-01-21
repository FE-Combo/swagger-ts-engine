# [SWAGGER-TS-ENGINE]() &middot;

## 动机

根据 swagger 自动导出 api 与 type

## 约定

- 生成的所有 Service 都是通过 request 去调用
- request 参数排序：method, api, path, query, body, header, formData
- serverUrl: swagger json 地址
- servicePath: 生成 service 与 type 的文件路径
- requestImportExpression: request 导入模板

## 使用

```bash
$ yarn add swagger-ts-engine --dev
```

- 新建文件 api.js

```
const generate = require("swagger-ts-engine")

generate({
    serverUrl:"https://petstore.swagger.io/v2/swagger.json",
    servicePath:"/output/api",
    requestImportExpression: "import { request } from '@/utils/fetch';"
});
```

- package.json 新增 script: node api.js

## TODO

- 枚举定义类型
- 泛型定义
- 多个 path 变量使用
- 多个 query 变量使用
- 多个 header 变量使用
