import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ExecutionRecordController } from './execution-record.controller';
import { ExecutionRecordService } from './execution-record.service';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440001';
const STEP_ID = '550e8400-e29b-41d4-a716-446655440002';
const EXPECTED_ROLES = ['viewer', 'operator', 'creator', 'admin', 'owner'];

function createMockExecutionRecordService() {
  return {
    findByExecution: vi.fn(),
  };
}

function getHandler(name: 'findByExecution'): (...args: unknown[]) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    ExecutionRecordController.prototype,
    name,
  );

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Handler ${name} is not defined on ExecutionRecordController`);
  }

  return descriptor.value as (...args: unknown[]) => unknown;
}

function invokeFindByExecution(
  controller: ExecutionRecordController,
  tenantId: string,
  query: unknown,
) {
  return Reflect.apply(getHandler('findByExecution'), controller, [tenantId, query]);
}

describe('ExecutionRecordController', () => {
  let moduleRef: TestingModule;
  let controller: ExecutionRecordController;
  let mockService: ReturnType<typeof createMockExecutionRecordService>;

  beforeEach(async () => {
    mockService = createMockExecutionRecordService();

    moduleRef = await Test.createTestingModule({
      controllers: [ExecutionRecordController],
      providers: [
        {
          provide: ExecutionRecordService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = moduleRef.get(ExecutionRecordController);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('should validate and delegate queries with all supported params', async () => {
    const response = {
      data: [
        {
          id: 'record-1',
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          nodeId: 'node-1',
          recordType: 'step_telemetry',
          data: { foo: 'bar' },
          createdAt: '2026-03-16T10:00:00.000Z',
        },
      ],
      meta: {
        total: 1,
        limit: 10,
        offset: 20,
        hasMore: false,
      },
    };
    mockService.findByExecution.mockResolvedValue(response);

    await expect(
      invokeFindByExecution(controller, TENANT_ID, {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        recordType: 'step_telemetry',
        limit: '10',
        offset: '20',
      }),
    ).resolves.toEqual(response);

    expect(mockService.findByExecution).toHaveBeenCalledWith(TENANT_ID, {
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      recordType: 'step_telemetry',
      limit: 10,
      offset: 20,
    });
  });

  it('should apply default pagination when only executionId is provided', async () => {
    const response = {
      data: [],
      meta: {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    };
    mockService.findByExecution.mockResolvedValue(response);

    await expect(
      invokeFindByExecution(controller, TENANT_ID, {
        executionId: EXECUTION_ID,
      }),
    ).resolves.toEqual(response);

    expect(mockService.findByExecution).toHaveBeenCalledWith(TENANT_ID, {
      executionId: EXECUTION_ID,
      limit: 50,
      offset: 0,
    });
  });

  it('should throw DomainException when executionId is not a UUID', async () => {
    await expect(
      invokeFindByExecution(controller, TENANT_ID, {
        executionId: 'not-a-uuid',
        limit: '5',
        offset: '0',
      }),
    ).rejects.toMatchObject({
      constructor: DomainException,
      type: 'validation-error',
      detail: 'The query parameters provided are invalid',
      errors: expect.arrayContaining([
        expect.objectContaining({
          field: 'executionId',
        }),
      ]),
    });

    expect(mockService.findByExecution).not.toHaveBeenCalled();
  });

  it('should throw DomainException when limit is negative', async () => {
    await expect(
      invokeFindByExecution(controller, TENANT_ID, {
        executionId: EXECUTION_ID,
        limit: '-1',
        offset: '0',
      }),
    ).rejects.toMatchObject({
      constructor: DomainException,
      type: 'validation-error',
      detail: 'The query parameters provided are invalid',
      errors: expect.arrayContaining([
        expect.objectContaining({
          field: 'limit',
        }),
      ]),
    });

    expect(mockService.findByExecution).not.toHaveBeenCalled();
  });

  it('should declare the expected roles metadata', () => {
    const handler = getHandler('findByExecution');

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(EXPECTED_ROLES);
  });

  it('should declare GET route metadata for the list endpoint', () => {
    const handler = getHandler('findByExecution');

    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
  });
});
