const path = require("path");
const chalk = require("chalk");
const fs = require("fs-extra");
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

function checkType(code,properties,hiddenCode){
    const prefix = hiddenCode?"":`${code}:`
    if(properties.type){
        switch (properties.type) {
            case "boolean":
                return `${prefix}boolean`;
            case "integer":
                return `${prefix}number`;
            case "string":
                return `${prefix}${properties.enum ? properties.enum.map(_=>`"${_}"`).join("|"):"string"}`;
            case "array":
                return `${properties.items.$ref ? prefix+"Array<"+properties.items.$ref.replace("#/definitions/","")+">":prefix+"Array<"+checkType(code,properties.items,true)+">"} ` 
            case "object":
                return `
export interface ${code} {
${Object.keys(properties.properties).map(filed=>{
    return checkType(filed,properties.properties[filed])
}).join("\n")}
}`  
        }
    } else if(properties.$ref){
        return `${code}: ${properties.$ref.replace("#/definitions/","")}`
    }
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
            preInfo[tag].push({
                name: currentMethodApi.operationId,
                summary:currentMethodApi.summary,
                tags:currentMethodApi.tags,
                api,
                method,
                body:{},
                query:{},
                pathParams:{},
            })
            return preInfo
        },preValue)
        return info;
    },{});
    return result;
}

function generateApiContent(paths,tagsInfo, generatePath){
    const apis = createApiStructure(paths);
    const tags = Object.keys(apis)
    tags.forEach(tag=>{
        const lines = [];
        lines.push(`import { request } from 'umi';`);
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
            lines.push(`public static ${apiInfo.name}(): Promise<void> {`)
            lines.push(`return request("${apiInfo.method.toUpperCase()}","${apiInfo.api}", {}, {}, {});`)
            lines.push(`}`);
        });
        lines.push(`}`);
        const targetPath = path.join(generatePath,`${serviceName}.ts`)
        fs.ensureFileSync(targetPath);
        fs.writeFileSync(targetPath, lines.join("\n"));
        console.info(chalk`{white.green Write:} ${targetPath}`);
    })
}

function generateTypeContent(definitions,generatePath){
    const lines = [];
    const types = Object.keys(definitions)
    types.forEach(type=>{
        const definition = definitions[type];
        lines.push(checkType(type,definition))
    })
    const targetPath = path.join(generatePath,`type.ts`)
    fs.ensureFileSync(targetPath);
    fs.writeFileSync(targetPath, lines.join("\n"));
    console.info(chalk`{white.green Write:} ${targetPath}`);

}

async function generate(options) {
    try {
        const url = "https://petstore.swagger.io/v2/swagger.json";
        const generatePath = path.join(process.cwd(),"/services/api");
        console.info(chalk`{white.green Clear directory:} ${generatePath}`);
        fs.emptyDirSync(generatePath);
        
        const content = await getContent(url);
        generateTypeContent(content.definitions,generatePath);
        generateApiContent(content.paths, content.tags,generatePath);
        console.info(chalk`{white.bold 😍 Generated Successfully}`)
    } catch (e) {
      console.error(chalk`{red.bold ❌ Error: ${e.message}}`);
      process.exit(1);
    }
}

module.exports = generate;
