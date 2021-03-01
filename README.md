# [SWAGGER-TS-ENGINE]() &middot;

## 动机

根据 swagger 自动导出 api 与 type

## 约定

- 生成的所有 Service 都是通过 request 调用
- request 参数: method, api, path, query, body, header, formData
- serverUrl: swagger json 地址
- servicePath: 生成 service 与 type 的文件路径
- requestImportExpression: request 导入模板
- additionalPageHeader?: 页面头部信息
- apiRename?: 接口重命名
- T 为前端特有泛型, 为避免重复后端禁止使用 T\[number\], e.g: T0,T1,T3
- 类型不能重名,e.g: BaseResult, BaseResult\<T\>

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
