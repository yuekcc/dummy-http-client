import qs from 'qs'

export type ContentType = 'json' | 'text' | 'multipart' | 'urlencoded'

export type ResponseType = 'text' | 'json' | 'blob'

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

export interface RequestOptions {
  headers?: Record<string, unknown>
  params?: Record<string, unknown>
  observe?: 'body' | 'response'
  contentType?: ContentType
  responseType?: ResponseType
  timeout?: number
}

const defaultOptions: Readonly<RequestOptions> = Object.freeze({
  headers: {},
  params: {},
  observe: 'body',
  contentType: 'json',
  responseType: 'json',
  timeout: 30000,
})

const timeout = (delay: number) =>
  new Promise((_, reject) => {
    setTimeout(() => reject({ name: 'timeout', message: 'timeout' }), delay)
  })

const combineQueryStrings = (url: string, params: Record<string, unknown>) => {
  if (Object.keys(params).length === 0) {
    return url
  }

  return `${url}?${qs.stringify(params)}`
}

const parseRequestBody = (contentType: ContentType, body: unknown): string | FormData | null => {
  if (!body) {
    return null
  }

  if (contentType === 'text') {
    return <string>body || ''
  }

  if (contentType === 'json') {
    return JSON.stringify(body)
  }

  if (contentType === 'multipart') {
    if (!(body instanceof FormData)) {
      throw new Error('require a FormData instance when content type is multipart')
    }
    return body as FormData
  }

  if (contentType === 'urlencoded') {
    return qs.stringify(body)
  }

  throw new Error('unknown contentType: ' + contentType)
}

const mergeHeaders = (headers: Record<string, unknown>, contentType: ContentType) => {
  let contentTypeHeader = 'plain/text'
  if (contentType === 'json') {
    contentTypeHeader = 'application/json'
  }

  if (contentType === 'multipart') {
    contentTypeHeader = 'multipart/form-data'
  }

  if (contentType === 'urlencoded') {
    contentTypeHeader = 'application/x-www-urlencoded'
  }

  return {
    ...headers,
    'Content-Type': contentTypeHeader,
  }
}

const parseResponseBody = (responseType: ResponseType, response: Response) => {
  if (responseType === 'json') {
    return response.json()
  }

  if (responseType === 'text') {
    return response.text()
  }

  if (responseType === 'blob') {
    return response.blob()
  }

  throw new Error('unknown responseType: ' + responseType)
}

const send = (method: HttpMethod, url: string, options: RequestOptions, body?: unknown) => {
  return Promise.race([
    fetch(combineQueryStrings(url, options.params!), {
      method: method.toUpperCase(),
      body: parseRequestBody(options.contentType!, body),
      headers: mergeHeaders(options.headers!, options.contentType!),
    })
      .then((response) => {
        const baseResponse = {
          headers: response.headers,
          ok: response.ok,
          redirected: response.redirected,
          status: response.status,
          type: response.type,
          url: response.url,
        }
        return Promise.all([
          Promise.resolve(baseResponse),
          parseResponseBody(options.responseType!, response),
        ])
      })
      .then(([baseResponse, data]) => {
        if (baseResponse.status !== 200) {
          throw {
            ...baseResponse,
            name: 'httpErrorResponse',
            error: data,
          }
        }

        if (options.observe === body) {
          return data
        }

        return {
          ...baseResponse,
          body: data,
        }
      })
      .catch((err) => {
        if (err && err.name === 'httpErrorResponse') {
          throw err
        }

        throw {
          name: 'networkError',
          error: err,
        }
      }),
    timeout(options.timeout!),
  ])
}

export class DummyHttpClient {
  get<T>(url: string, options: RequestOptions): Promise<T> {
    return send('get', url, { ...defaultOptions, ...options }, null)
  }

  delete<T>(url: string, options: RequestOptions): Promise<T> {
    return send('delete', url, { ...defaultOptions, ...options }, null)
  }

  post<T>(url: string, body: unknown, options: RequestOptions): Promise<T> {
    return send('post', url, { ...defaultOptions, ...options }, body)
  }

  put<T>(url: string, body: unknown, options: RequestOptions): Promise<T> {
    return send('put', url, { ...defaultOptions, ...options }, body)
  }

  patch<T>(url: string, body: unknown, options: RequestOptions): Promise<T> {
    return send('put', url, { ...defaultOptions, ...options }, body)
  }
}
