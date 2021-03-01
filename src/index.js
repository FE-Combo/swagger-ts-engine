const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const axios = require("axios");
const Agent = require("https").Agent;
const json = require("./index.json")

async function getContent(url) {
  const response = await axios.get(url, {
    httpsAgent: new Agent({ rejectUnauthorized: false }),
  });
  return response.data;
}

function initialUpperCase(str) {
  return str.replace(/\b(\w)(\w*)/g, function ($0, $1, $2) {
    return $1.toUpperCase() + $2
  });
}

function checkInitialUpperCase(str) {
 return /^[A-Z]+(.*)$/.test(str)
}

function parameterDefinition(params) {
  const parameters = params
    .filter((_) => _)
    .map((_) => {
      if (_.constructor === Array) {
        return parameterDefinition(_);
      } else {
        return `${_.keyWithType}${defaultValue(_.type, _.default)}`;
      }
    })
    .filter((_) => _)
    .join(",").split(",");
    return parameters.reduce((preValue,currentValue)=>{
      if(!currentValue.includes("?")){
        const index = preValue.findIndex(_=>!_.includes("?"));
        if(index > -1){
          preValue.splice(index,0,currentValue)
        } else {
          preValue.unshift(currentValue)
        }
      } else {
        preValue.push(currentValue)
      }
      return preValue
    },[]).join(",");
}

function parameterUsage(params) {
  return params
    .map((_) => {
      if (_) {
        if (_.constructor === Array && _.length > 0) {
          return `{${_.reduce((preValue, currentValue) => {
            preValue.push(currentValue.key);
            return preValue;
          }, []).join(",")}}`;
        } else if (_.constructor === Object && _.in === "body") {
          return _.key;
        }
      }
      return "null";
    })
    .join(",");
}

function defaultValue(type, value) {
  if (value) {
    switch (type) {
      case "string":
        return `="${value}"`;
      case "array":
        return `=["${value}"]`;
    }
  }
  return "";
}

function checkType(properties, code) {
  // TODO: distinguish type and api
  const prefix = code ? `${code}${properties.required ? "" : "?"}:` : "";
  if (properties.type) {
    switch (properties.type) {
      case "number":
       return `${prefix}number`;
      case "boolean":
        return `${prefix}boolean`;
      case "integer":
        return `${prefix}number`;
      case "string":
        return `${prefix}${
          properties.enum
            ? properties.enum.map((_) => `"${_}"`).join("|")
            : "string"
        }`;
      case "file":
        return `${prefix}File`;
      case "array":
        return `${
          properties.items.$ref
            ? prefix +
              "Array<" +
              properties.items.$ref.replace("#/definitions/", "") +
              ">"
            : prefix + "Array<" + checkType(properties.items) + ">"
        }`;
      case "object":
        return properties.properties
          ? `
export interface ${code} {
${Object.keys(properties.properties)
  .map((filed) => {
    return checkType(properties.properties[filed], filed);
  })
  .join("\n")}
}`
          : properties.additionalProperties ? `${prefix}${
              properties.additionalProperties
                ? "Record<string | number | symbol, " +
                  checkType(properties.additionalProperties) +
                  ">"
                : ""
            }`:`
${prefix?`export type ${code} = object`:"object"}`;
    }
  } else if (properties.$ref) {
    return `${prefix}${properties.$ref.replace("#/definitions/", "")}`;
  } else if (properties.schema) {
    if (properties.schema.$ref) {
      return `${prefix}${properties.schema.$ref.replace("#/definitions/", "")}`;
    } else {
      return checkType(properties.schema, code);
    }
  }
  console.info(
    chalk`{red.bold CheckType Omission: ${JSON.stringify(properties)}}`
  );
  return "";
}

function createApiStructure(paths) {
  const apis = Object.keys(paths);
  const result = apis.reduce((preValue, api) => {
    const allMethodInApi = paths[api];
    const methods = Object.keys(allMethodInApi);
    const info = methods.reduce((preInfo, method) => {
      const currentMethodApi = allMethodInApi[method];
      const tag = currentMethodApi["tags"][0];
      if (!preInfo[tag]) {
        preInfo[tag] = [];
      }
      const parameters = currentMethodApi.parameters.reduce(
        (preValue, currentParameter) => {
          preValue.push({
            in: currentParameter.in,
            key: currentParameter.name,
            type: currentParameter.type,
            minimum: currentParameter.minimum,
            required: currentParameter.required,
            default: currentParameter.items && currentParameter.items.default,
            keyWithType: checkType(currentParameter, currentParameter.name),
          });
          return preValue;
        },
        []
      );
      const bodyInfo = parameters.find((_) => _.in === "body");
      const queryArray = parameters
        .map((_) => (_.in === "query" ? _ : null))
        .filter((_) => _);
      const pathArray = parameters
        .map((_) => (_.in === "path" ? _ : null))
        .filter((_) => _);
      const headerArray = parameters
        .map((_) => (_.in === "header" ? _ : null))
        .filter((_) => _);
      const formDataArray = parameters
        .map((_) => (_.in === "formData" ? _ : null))
        .filter((_) => _);
      const response =
        currentMethodApi.responses && currentMethodApi.responses[200];
      preInfo[tag].push({
        name: currentMethodApi.operationId,
        summary: currentMethodApi.summary,
        tags: currentMethodApi.tags,
        api,
        method,
        body: bodyInfo,
        query: queryArray,
        path: pathArray,
        header: headerArray,
        formData: formDataArray,
        responseType:
          response && response.schema ? checkType(response.schema) : "void",
      });
      return preInfo;
    }, preValue);
    return info;
  }, {});
  return result;
}

function generateApiContent(
  options,
  paths,
  tagsInfo,
  generatePath,
  typeNames
) {
  const {
    requestImportExpression,
    additionalPageHeader = "",
    apiRename,
  } = options;
  const apis = createApiStructure(paths);
  const tags = Object.keys(apis);
  const serviceNames = [];
  tags.forEach((tag) => {
    const lines = [];
    lines.push(additionalPageHeader);
    lines.push(``);
    lines.push(`import {${[...new Set(typeNames.map(_=> _.replace(/\<.*\>/g,"")))].join(",")}} from "./type";`);
    lines.push(requestImportExpression);
    lines.push(``);
    const serviceName = `${initialUpperCase(tag)}Service`.replace(/\-/g,"");
    serviceNames.push(serviceName);
    const tagInfo = tagsInfo.find((_) => _ && _.name === tag);
    if (tagInfo && tagInfo.description) {
      lines.push(`// ${tagInfo.description}`);
    }
    lines.push(`export class ${serviceName} {`);
    apis[tag].forEach((apiInfo) => {
      lines.push(``);
      if (apiInfo.summary) {
        lines.push(`// ${apiInfo.summary}`);
      }
      const filterKey = ["path", "query", "body", "header", "formData"];
      const requestKey = filterKey.reduce((preValue, key) => {
        preValue.push(apiInfo[key] || null);
        return preValue;
      }, []);
      const responseType = apiInfo.responseType.replace(/\«int\»/g,"<number>").replace(/\«Void\»/g,"<void>").replace(/\«List\«/g,"<Array<").replace(/\«/g,"<").replace(/\»/g,">");
      let apiName = apiInfo.name
      if(typeof apiRename==="function"){
        apiName = apiRename(apiName) || apiName
      }
      lines.push(
        `public static ${apiName}(${parameterDefinition(
          requestKey
        )}): Promise<${responseType}> {`
      );
      lines.push(
        `return request("${apiInfo.method.toUpperCase()}","${
          apiInfo.api
        }",${parameterUsage(requestKey)});`
      );
      lines.push(`}`);
    });
    lines.push(`}`);
    const targetPath = path.join(generatePath, `${serviceName}.ts`);
    fs.ensureFileSync(targetPath);
    fs.writeFileSync(targetPath, lines.join("\n"));
    console.info(chalk`{white.green Write:} ${targetPath}`);
  });

  const indexPath = path.join(generatePath, `index.ts`);
  fs.ensureFileSync(indexPath);
  fs.writeFileSync(
    indexPath,
    serviceNames.map((_) => `export {${_}} from "./${_}";`).join("\n")
  );
  console.info(chalk`{white.green Write:} ${indexPath}`);
}

function generateTypeContent(
  definitions,
  generatePath,
  typeNames,
  additionalPageHeader
) {
  const genericRegex = /(?<=\«)\S+(?=\»)/g;
  const lines = [];
  const types = Object.keys(definitions);
  lines.push(additionalPageHeader);
  lines.push(``);
  types.forEach((type) => {
    const generic = type.match(genericRegex);
    const definition = definitions[type];
    if(generic) {
      const subGenerics = generic[0].split(",");
      const baseType = `${type.replace(`«${generic[0]}»`, "")}<${subGenerics.map((_,index)=>`T${index}`)}>`;
      if(!typeNames.includes(baseType)) {
        typeNames.push(baseType);
        // Java built-in type
        if(baseType.startsWith("Map<")){
          lines.push(`export type Map<T0 extends string | number | symbol,T1> = Record<T0,T1>`);
        } else {
          let result = checkType(definition, baseType);
          subGenerics.forEach((_,index)=>{
            if(/(?<=^List\«)\S+(?=\»)/g.test(_)){
              // Check if Array
              result = result.replace(`Array<${genericRegex.exec(_)}>`,`T${index}`)
            } else {
              result = result.replace(_,`T${index}`)
            }
          })
          lines.push(result);
        }
      }
    } else {
      typeNames.push(type);
      lines.push(checkType(definition, type));
    }
  });
  const targetPath = path.join(generatePath, `type.ts`);
  fs.ensureFileSync(targetPath);
  fs.writeFileSync(targetPath, lines.join("\n"));
  console.info(chalk`{white.green Write:} ${targetPath}`);
}

async function generate(options) {
  try {
    const {
      serverUrl,
      servicePath,
      requestImportExpression,
      additionalPageHeader = "",
    } = options;
    if (!serverUrl) {
      throw new Error("Missing [serverUrl]");
    }
    if (!servicePath) {
      throw new Error("Missing [servicePath]");
    }
    if (!requestImportExpression) {
      throw new Error("Missing [requestImportExpression]");
    }
    const generatePath = path.join(process.cwd(), servicePath);
    console.info(chalk`{white.green Clear directory:} ${generatePath}`);
    fs.emptyDirSync(generatePath);

    const content = options.debugger?json:await getContent(serverUrl);
    const typeNames = [];
    generateTypeContent(
      content.definitions,
      generatePath,
      typeNames,
      additionalPageHeader
    );
    generateApiContent(
      options,
      content.paths,
      content.tags,
      generatePath,
      typeNames
    );
    console.info(chalk`{white.bold 😍 Generated Successfully}`);
  } catch (e) {
    console.error(chalk`{red.bold ❌ Error: ${e.message}}`);
    process.exit(1);
  }
}

module.exports = generate;
