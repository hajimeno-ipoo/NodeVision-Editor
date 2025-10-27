import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import schemaJson from '../docs/project_schema_v1.json' with { type: 'json' };
const AjvConstructor = AjvModule.default ??
    AjvModule;
const addFormats = addFormatsModule.default ??
    addFormatsModule;
const ajv = new AjvConstructor({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
});
addFormats(ajv);
export class ProjectValidationError extends Error {
    issues;
    constructor(message, issues) {
        super(message);
        this.issues = issues;
        this.name = 'ProjectValidationError';
    }
}
const schemaFileUrl = new URL('../docs/project_schema_v1.json', import.meta.url);
const validateProjectFn = ajv.compile(schemaJson);
export function formatValidationIssues(errors) {
    if (!errors) {
        return [];
    }
    return errors.map((error) => {
        const dataPath = error.instancePath || error.schemaPath || '';
        return {
            path: dataPath || '(root)',
            message: error.message ?? 'validation error',
            keyword: error.keyword,
            params: error.params
        };
    });
}
export function validateProject(project) {
    return validateProjectFn(project);
}
export function assertProject(project) {
    if (validateProjectFn(project)) {
        return project;
    }
    const issues = formatValidationIssues(validateProjectFn.errors);
    throw new ProjectValidationError('プロジェクトファイルの検証に失敗しました。', issues);
}
export function parseProject(jsonText) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch (error) {
        throw new ProjectValidationError('プロジェクトファイルが JSON として不正です。', [
            {
                path: '(root)',
                message: error.message,
                keyword: 'parse',
                params: {}
            }
        ]);
    }
    return assertProject(parsed);
}
export async function loadProject(filePath) {
    const absolutePath = resolve(filePath);
    const content = await readFile(absolutePath, 'utf-8');
    return parseProject(content);
}
export async function saveProject(filePath, project, options = {}) {
    const { validate = true, spaces = 2 } = options;
    if (validate) {
        assertProject(project);
    }
    const absolutePath = resolve(filePath);
    const serialized = serializeProject(project, spaces);
    await writeFile(absolutePath, serialized + '\n', 'utf-8');
}
export function getProjectSchemaPath() {
    return fileURLToPath(schemaFileUrl);
}
export function getValidator() {
    return validateProjectFn;
}
export function serializeProject(project, spaces = 2) {
    return JSON.stringify(project, null, spaces);
}
