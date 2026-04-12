import { validateScenarioDocumentStrict } from './schema.ts';
import type { ParseResult, ScenarioDocument } from './types.ts';

export type OfficialScenariosListPayload = {
  scenarios: ScenarioDocument[];
  catalogUpdatedAt: string;
};

export type OfficialApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unknown';

export class OfficialApiError extends Error {
  readonly status: number;
  readonly code: OfficialApiErrorCode;
  readonly bodyText?: string;

  constructor(
    status: number,
    code: OfficialApiErrorCode,
    message: string,
    options?: { bodyText?: string; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'OfficialApiError';
    this.status = status;
    this.code = code;
    this.bodyText = options?.bodyText;
  }

  static fromHttpStatus(status: number, bodyText?: string): OfficialApiError {
    const code = officialApiErrorCodeForStatus(status);
    const message = resolveOfficialApiErrorMessage(status, code, bodyText);
    return new OfficialApiError(status, code, message, { bodyText });
  }
}

export function officialApiErrorCodeForStatus(status: number): OfficialApiErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    default:
      return 'unknown';
  }
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pickServerMessage(bodyText: string | undefined): string | undefined {
  if (!bodyText) return undefined;
  const o = tryParseJsonObject(bodyText);
  if (!o) return undefined;
  const err = o.error;
  if (typeof err === 'string' && err.trim()) return err;
  const msg = o.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  return undefined;
}

function defaultMessageForCode(code: OfficialApiErrorCode, status: number): string {
  switch (code) {
    case 'bad_request':
      return 'Некорректный запрос к API официальных сценариев.';
    case 'not_found':
      return 'Официальный сценарий не найден.';
    case 'conflict':
      return 'Конфликт при сохранении официального сценария (операция недоступна или данные устарели).';
    case 'payload_too_large':
      return 'Слишком большой документ сценария.';
    default:
      return `Ошибка API официальных сценариев (HTTP ${status}).`;
  }
}

export function resolveOfficialApiErrorMessage(
  status: number,
  code: OfficialApiErrorCode,
  bodyText?: string,
): string {
  return pickServerMessage(bodyText) ?? defaultMessageForCode(code, status);
}

/**
 * Parses JSON body of `GET /api/scenarios/official` and validates every scenario with
 * {@link validateScenarioDocumentStrict}.
 */
export function parseOfficialScenariosListResponse(raw: unknown): ParseResult<OfficialScenariosListPayload> {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Ответ списка официальных сценариев должен быть JSON-объектом.' };
  }
  const o = raw as Record<string, unknown>;
  const catalogUpdatedAt = o.catalogUpdatedAt;
  if (typeof catalogUpdatedAt !== 'string' || catalogUpdatedAt.length === 0) {
    return {
      ok: false,
      error: 'Ответ списка официальных сценариев должен содержать непустую строку catalogUpdatedAt.',
    };
  }
  const scenariosRaw = o.scenarios;
  if (!Array.isArray(scenariosRaw)) {
    return { ok: false, error: 'Ответ списка официальных сценариев должен содержать массив scenarios.' };
  }
  const scenarios: ScenarioDocument[] = [];
  for (let i = 0; i < scenariosRaw.length; i++) {
    try {
      scenarios.push(
        validateScenarioDocumentStrict(scenariosRaw[i], `Official scenarios list entry [${i}]`),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }
  return { ok: true, value: { scenarios, catalogUpdatedAt } };
}

/**
 * Parses JSON body of `PUT /api/scenarios/official/:id` (or `GET .../:id`) shaped as `{ scenario: ... }`.
 */
export function parseOfficialScenarioEnvelopeResponse(raw: unknown): ParseResult<ScenarioDocument> {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Ответ API официального сценария должен быть JSON-объектом.' };
  }
  const scenario = (raw as { scenario?: unknown }).scenario;
  if (scenario === undefined) {
    return { ok: false, error: 'Ответ API официального сценария должен содержать поле scenario.' };
  }
  try {
    return {
      ok: true,
      value: validateScenarioDocumentStrict(scenario, 'Official scenario envelope response'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function readResponseBodyText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function looksLikeHtml(text: string): boolean {
  const sample = text.slice(0, 256).toLowerCase();
  return sample.includes('<!doctype html') || sample.includes('<html');
}

function parseJsonBodyOrThrow(bodyText: string, message: string, requestUrl: string): unknown {
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    const hint = looksLikeHtml(bodyText)
      ? ` Вероятно, этот URL отдает страницу приложения вместо API JSON: ${requestUrl}. Проверьте reverse proxy для /api/scenarios -> roomServer.`
      : '';
    throw new OfficialApiError(500, 'unknown', `${message}${hint}`, {
      bodyText: `${bodyText}${hint}`,
    });
  }
}

export type OfficialApiFetchDeps = {
  fetchImpl?: typeof fetch;
  /** Origin or prefix, без завершающего `/`. Пустая строка — относительный путь от страницы. */
  baseUrl?: string;
};

function officialListUrl(baseUrl: string | undefined): string {
  const path = '/api/scenarios/official';
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function officialByIdUrl(baseUrl: string | undefined, id: string): string {
  const path = `/api/scenarios/official/${encodeURIComponent(id)}`;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Fetches the official catalog from `GET /api/scenarios/official` and validates the payload.
 */
export async function fetchOfficialScenarios(deps?: OfficialApiFetchDeps): Promise<OfficialScenariosListPayload> {
  const fetchFn = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const url = officialListUrl(deps?.baseUrl);
  const res = await fetchFn(url, {
    headers: { accept: 'application/json' },
  });
  const bodyText = await readResponseBodyText(res);
  if (!res.ok) {
    throw OfficialApiError.fromHttpStatus(res.status, bodyText);
  }
  const raw = parseJsonBodyOrThrow(
    bodyText,
    'Ответ списка официальных сценариев не является JSON.',
    url,
  );
  const parsed = parseOfficialScenariosListResponse(raw);
  if (!parsed.ok) {
    throw new OfficialApiError(res.status, 'unknown', parsed.error, { bodyText });
  }
  return parsed.value;
}

/**
 * Fetches one official scenario via `GET /api/scenarios/official/:id` and validates the envelope.
 */
export async function fetchOfficialScenarioById(
  id: string,
  deps?: OfficialApiFetchDeps,
): Promise<ScenarioDocument> {
  const fetchFn = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const url = officialByIdUrl(deps?.baseUrl, id);
  const res = await fetchFn(url, {
    headers: { accept: 'application/json' },
  });
  const bodyText = await readResponseBodyText(res);
  if (!res.ok) {
    throw OfficialApiError.fromHttpStatus(res.status, bodyText);
  }
  const raw = parseJsonBodyOrThrow(
    bodyText,
    'Ответ загрузки официального сценария не является JSON.',
    url,
  );
  const parsed = parseOfficialScenarioEnvelopeResponse(raw);
  if (!parsed.ok) {
    throw new OfficialApiError(res.status, 'unknown', parsed.error, { bodyText });
  }
  return parsed.value;
}

/**
 * Updates an official scenario via `PUT /api/scenarios/official/:id` with a full {@link ScenarioDocument}.
 */
export async function updateOfficialScenario(
  doc: ScenarioDocument,
  deps?: OfficialApiFetchDeps,
): Promise<ScenarioDocument> {
  const fetchFn = deps?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const url = officialByIdUrl(deps?.baseUrl, doc.id);
  const res = await fetchFn(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(doc),
  });
  const bodyText = await readResponseBodyText(res);
  if (!res.ok) {
    throw OfficialApiError.fromHttpStatus(res.status, bodyText);
  }
  const raw = parseJsonBodyOrThrow(
    bodyText,
    'Ответ сохранения официального сценария не является JSON.',
    url,
  );
  const parsed = parseOfficialScenarioEnvelopeResponse(raw);
  if (!parsed.ok) {
    throw new OfficialApiError(res.status, 'unknown', parsed.error, { bodyText });
  }
  return parsed.value;
}
