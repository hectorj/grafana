import { DataQueryRequest, DataSourceInstanceSettings, dateTime, FieldType, PluginType } from '@grafana/data';
import { backendSrv } from 'app/core/services/backend_srv';
import { of, throwError } from 'rxjs';
import { createFetchResponse } from 'test/helpers/createFetchResponse';
import { JaegerDatasource } from './datasource';
import {
  testResponse,
  testResponseDataFrameFields,
  testResponseNodesFields,
  testResponseEdgesFields,
} from './testResponse';
import { JaegerQuery } from './types';

jest.mock('@grafana/runtime', () => ({
  ...((jest.requireActual('@grafana/runtime') as unknown) as object),
  getBackendSrv: () => backendSrv,
}));

describe('JaegerDatasource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns trace and graph when queried', async () => {
    setupFetchMock({ data: [testResponse] });

    const ds = new JaegerDatasource(defaultSettings);
    const response = await ds.query(defaultQuery).toPromise();
    expect(response.data.length).toBe(3);
    expect(response.data[0].fields).toMatchObject(testResponseDataFrameFields);
    expect(response.data[1].fields).toMatchObject(testResponseNodesFields);
    expect(response.data[2].fields).toMatchObject(testResponseEdgesFields);
  });

  it('returns trace when traceId with special characters is queried', async () => {
    const mock = setupFetchMock({ data: [testResponse] });
    const ds = new JaegerDatasource(defaultSettings);
    const query = {
      ...defaultQuery,
      targets: [
        {
          traceID: 'a/b',
          queryType: 'traceID' as const,
          refId: '1',
        },
      ],
    };
    await ds.query(query).toPromise();
    expect(mock).toBeCalledWith({ url: `${defaultSettings.url}/api/traces/a%2Fb` });
  });

  it('returns empty response if trace id is not specified', async () => {
    const ds = new JaegerDatasource(defaultSettings);
    const response = await ds
      .query({
        ...defaultQuery,
        targets: [],
      })
      .toPromise();
    const field = response.data[0].fields[0];
    expect(field.name).toBe('trace');
    expect(field.type).toBe(FieldType.trace);
    expect(field.values.length).toBe(0);
  });
});

describe('when performing testDataSource', () => {
  describe('and call succeeds', () => {
    it('should return successfully', async () => {
      setupFetchMock({ data: ['service1'] });

      const ds = new JaegerDatasource(defaultSettings);
      const response = await ds.testDatasource();
      expect(response.status).toEqual('success');
      expect(response.message).toBe('Data source connected and services found.');
    });
  });

  describe('and call succeeds, but returns no services', () => {
    it('should display an error', async () => {
      setupFetchMock(undefined);

      const ds = new JaegerDatasource(defaultSettings);
      const response = await ds.testDatasource();
      expect(response.status).toEqual('error');
      expect(response.message).toBe(
        'Data source connected, but no services received. Verify that Jaeger is configured properly.'
      );
    });
  });

  describe('and call returns error with message', () => {
    it('should return the formatted error', async () => {
      setupFetchMock(
        undefined,
        throwError({
          statusText: 'Not found',
          status: 404,
          data: {
            message: '404 page not found',
          },
        })
      );

      const ds = new JaegerDatasource(defaultSettings);
      const response = await ds.testDatasource();
      expect(response.status).toEqual('error');
      expect(response.message).toBe('Jaeger: Not found. 404. 404 page not found');
    });
  });

  describe('and call returns error without message', () => {
    it('should return JSON error', async () => {
      setupFetchMock(
        undefined,
        throwError({
          statusText: 'Bad gateway',
          status: 502,
          data: {
            errors: ['Could not connect to Jaeger backend'],
          },
        })
      );

      const ds = new JaegerDatasource(defaultSettings);
      const response = await ds.testDatasource();
      expect(response.status).toEqual('error');
      expect(response.message).toBe('Jaeger: Bad gateway. 502. {"errors":["Could not connect to Jaeger backend"]}');
    });
  });
});

function setupFetchMock(response: any, mock?: any) {
  const defaultMock = () => mock ?? of(createFetchResponse(response));

  const fetchMock = jest.spyOn(backendSrv, 'fetch');
  fetchMock.mockImplementation(defaultMock);
  return fetchMock;
}

const defaultSettings: DataSourceInstanceSettings = {
  id: 0,
  uid: '0',
  type: 'tracing',
  name: 'jaeger',
  url: 'http://grafana.com',
  meta: {
    id: 'jaeger',
    name: 'jaeger',
    type: PluginType.datasource,
    info: {} as any,
    module: '',
    baseUrl: '',
  },
  jsonData: {},
};

const defaultQuery: DataQueryRequest<JaegerQuery> = {
  requestId: '1',
  dashboardId: 0,
  interval: '0',
  intervalMs: 10,
  panelId: 0,
  scopedVars: {},
  range: {
    from: dateTime().subtract(1, 'h'),
    to: dateTime(),
    raw: { from: '1h', to: 'now' },
  },
  timezone: 'browser',
  app: 'explore',
  startTime: 0,
  targets: [
    {
      traceID: '12345',
      queryType: 'traceID' as const,
      refId: '1',
    },
  ],
};
