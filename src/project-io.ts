import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv/dist/2020.js';
import { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import schemaJson from '../docs/project_schema_v1.json' with { type: 'json' };
import type { NodeVisionProject } from './shared/project-types.js';

type AjvInstance = {
  compile<T>(schema: unknown): ValidateFunction<T>;
  addMetaSchema(schema: unknown): unknown;
};

const AjvConstructor =
  (AjvModule as unknown as { default?: new (...args: any[]) => AjvInstance }).default ??
  (AjvModule as unknown as new (...args: any[]) => AjvInstance);

const addFormats =
  (addFormatsModule as unknown as { default?: (ajv: unknown, options?: unknown) => unknown }).default ??
  (addFormatsModule as unknown as (ajv: unknown, options?: unknown) => unknown);

const ajv = new AjvConstructor({
  allErrors: true,
  allowUnionTypes: true,
  strict: false
});
addFormats(ajv);

export interface ProjectValidationIssue {
  path: string;
  message: string;
  keyword: string;
  params: ErrorObject['params'];
}

export class ProjectValidationError extends Error {
  constructor(message: string, readonly issues: ProjectValidationIssue[]) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

const schemaFileUrl = new URL('../docs/project_schema_v1.json', import.meta.url);

const validateProjectFn = ajv.compile<NodeVisionProject>(schemaJson as unknown) as ValidateFunction<NodeVisionProject>;

export function formatValidationIssues(errors: ErrorObject[] | null | undefined): ProjectValidationIssue[] {
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

export function validateProject(project: unknown): project is NodeVisionProject {
  return validateProjectFn(project);
}

export function assertProject(project: unknown): NodeVisionProject {
  if (validateProjectFn(project)) {
    return project as NodeVisionProject;
  }

  const issues = formatValidationIssues(validateProjectFn.errors);
  throw new ProjectValidationError('プロジェクトファイルの検証に失敗しました。', issues);
}

export function parseProject(jsonText: string): NodeVisionProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new ProjectValidationError('プロジェクトファイルが JSON として不正です。', [
      {
        path: '(root)',
        message: (error as Error).message,
        keyword: 'parse',
        params: {}
      }
    ]);
  }

  return assertProject(parsed);
}

export async function loadProject(filePath: string): Promise<NodeVisionProject> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, 'utf-8');
  return parseProject(content);
}

export interface SaveProjectOptions {
  validate?: boolean;
  spaces?: number;
}

export async function saveProject(
  filePath: string,
  project: NodeVisionProject,
  options: SaveProjectOptions = {}
): Promise<void> {
  const { validate = true, spaces = 2 } = options;

  if (validate) {
    assertProject(project);
  }

  const absolutePath = resolve(filePath);
  const serialized = serializeProject(project, spaces);
  await writeFile(absolutePath, serialized + '\n', 'utf-8');
}

export function getProjectSchemaPath(): string {
  return fileURLToPath(schemaFileUrl);
}

export function getValidator(): ValidateFunction<NodeVisionProject> {
  return validateProjectFn;
}

export function serializeProject(project: NodeVisionProject, spaces = 2): string {
  return JSON.stringify(project, null, spaces);
}
