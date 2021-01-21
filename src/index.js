const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const axios = require("axios");
const Agent = require("https").Agent;

async function getContent(url) {
    const response = await axios.get(url, {
      httpsAgent: new Agent({ rejectUnauthorized: false }),
    });
    return response.data;
}

function initialUpperCase(str){
    return str.replace(/\b(\w)(\w*)/g, function($0, $1, $2) {
        return $1.toUpperCase() + $2.toLowerCase();
    });
}

function defaultValue(type,value){
    if(value){
        switch (type) {
            case "string":
                return `="${value}"`
            case "array":
                return `=["${value}"]`
        }
    }
   return ""
}

function checkType(properties,code){
    const prefix = code?`${code}${properties.required?"":"?"}:`:""
    if(properties.type){
        switch (properties.type) {
            case "boolean":
                return `${prefix}boolean`;
            case "integer":
                return `${prefix}number`;
            case "string":
                return `${prefix}${properties.enum ? properties.enum.map(_=>`"${_}"`).join("|"):"string"}`;
            case "file":
                return `${prefix}File`
            case "array":
                return `${properties.items.$ref ? prefix+"Array<"+properties.items.$ref.replace("#/definitions/","")+">":prefix+"Array<"+checkType(properties.items)+">"}` 
            case "object":
                return properties.properties?`
export interface ${code} {
${Object.keys(properties.properties).map(filed=>{
    return checkType(properties.properties[filed],filed)
}).join("\n")}
}`:`${properties.additionalProperties?"{[key:string]:"+checkType(properties.additionalProperties)+"}":""}`     
        }
    } else if(properties.$ref){
        return `${prefix}${properties.$ref.replace("#/definitions/","")}`
    } else if(properties.schema){
        if(properties.schema.$ref){
            return `${prefix}${properties.schema.$ref.replace("#/definitions/","")}`
        } else {
            return checkType(properties.schema,code)
        }
    }
    console.info(chalk`{red.bold CheckType Omission: ${JSON.stringify(properties)}}`)
    return "";
}

function createApiStructure(paths){
    const apis = Object.keys(paths);
    const result = apis.reduce((preValue,api)=>{
        const allMethodInApi = paths[api];
        const methods = Object.keys(allMethodInApi)
        const info = methods.reduce((preInfo,method)=>{
            const currentMethodApi = allMethodInApi[method];
            const tag = currentMethodApi["tags"][0]
            if(!preInfo[tag]){
                preInfo[tag] = [];
            }

            const parameters = currentMethodApi.parameters.reduce((preValue,currentParameter)=>{
                preValue.push({
                    in:currentParameter.in,
                    key: currentParameter.name,
                    type: currentParameter.type,
                    minimum: currentParameter.minimum,
                    required: currentParameter.required,
                    default: currentParameter.items && currentParameter.items.default,
                    keyWithType: checkType(currentParameter,currentParameter.name)
                })
                return preValue
            },[])
            const bodyInfo = parameters.find(_=>_.in==="body")
            const queryInfo = parameters.find(_=>_.in==="query")
            const pathInfo = parameters.find(_=>_.in==="path")
            const headerInfo = parameters.find(_=>_.in==="header")
            const formDataInfo = parameters.find(_=>_.in==="formData")
            const response = currentMethodApi.responses && currentMethodApi.responses[200]
            preInfo[tag].push({
                name: currentMethodApi.operationId,
                summary:currentMethodApi.summary,
                tags:currentMethodApi.tags,
                api,
                method,
                body:bodyInfo,
                query:queryInfo,
                path:pathInfo,
                header:headerInfo,
                formData:formDataInfo,
                responseType: response&&response.schema? checkType(response.schema):"void"
            })
            return preInfo
        },preValue)
        return info;
    },{});
    return result;
}

function generateApiContent(paths, tagsInfo, generatePath, typeNames, requestImportExpression){
    const apis = createApiStructure(paths);
    const tags = Object.keys(apis)
    tags.forEach(tag=>{
        const lines = [];
        lines.push(`import {${typeNames.join(",")}} from "./type.ts";`)
        lines.push(requestImportExpression);
        lines.push(``);
        const serviceName = `${initialUpperCase(tag)}Service`
        const tagInfo = tagsInfo.find(_=>_&&_.name===tag)
        if(tagInfo&&tagInfo.description){
            lines.push(`// ${tagInfo.description}`)
        }
        lines.push(`export class ${serviceName} {`);
        apis[tag].forEach(apiInfo=>{
            lines.push(``);
            if(apiInfo.summary){
                lines.push(`// ${apiInfo.summary}`);
            }
            const filterKey = ["path", "query", "body", "header","formData"];
            const requestKey =  filterKey.reduce((preValue,key)=>{

                preValue.push(apiInfo[key]||null)
                return preValue
            },[]);
            lines.push(`public static ${apiInfo.name}(${requestKey.filter(_=>_).map(_=>`${_.keyWithType}${defaultValue(_.type,_.default)}`)}): Promise<${apiInfo.responseType}> {`)
            lines.push(`return request("${apiInfo.method.toUpperCase()}","${apiInfo.api}",${requestKey.map(_=>_?_.key:"null").join(",")});`)
            lines.push(`}`);
        });
        lines.push(`}`);
        const targetPath = path.join(generatePath,`${serviceName}.ts`)
        fs.ensureFileSync(targetPath);
        fs.writeFileSync(targetPath, lines.join("\n"));
        console.info(chalk`{white.green Write:} ${targetPath}`);
    })
}

function generateTypeContent(definitions,generatePath,typeNames){
    const lines = [];
    const types = Object.keys(definitions)
    types.forEach(type=>{
        typeNames.push(type)
        const definition = definitions[type];
        lines.push(checkType(definition,type))
    })
    const targetPath = path.join(generatePath,`type.ts`)
    fs.ensureFileSync(targetPath);
    fs.writeFileSync(targetPath, lines.join("\n"));
    console.info(chalk`{white.green Write:} ${targetPath}`);

}

async function generate(options) {
    try {
        const {serverUrl,servicePath,requestImportExpression} = options
        if(!serverUrl) {
            throw new Error('Missing [serverUrl]');
        }
        if(!servicePath) {
            throw new Error('Missing [servicePath]');
        }
        if(!requestImportExpression){
            throw new Error('Missing [requestImportExpression]');
        }
        const generatePath = path.join(process.cwd(),servicePath);
        console.info(chalk`{white.green Clear directory:} ${generatePath}`);
        fs.emptyDirSync(generatePath);
        
        const content = await getContent(serverUrl);
        const typeNames = [];
        generateTypeContent(content.definitions,generatePath,typeNames);
        generateApiContent(content.paths, content.tags, generatePath, typeNames, requestImportExpression);
        console.info(chalk`{white.bold 😍 Generated Successfully}`)
    } catch (e) {
      console.error(chalk`{red.bold ❌ Error: ${e.message}}`);
      process.exit(1);
    }
}

module.exports = generate;
