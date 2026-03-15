import 'reflect-metadata';

import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SharePublicController } from './share-public.controller';
import { ShareService } from './share.service';

const mocks = vi.hoisted(() => ({
  shareService: {
    getPublicShare: vi.fn(),
  },
}));

const SHARE_TOKEN = 'ab'.repeat(32);

describe('SharePublicController', () => {
  let module: TestingModule;
  let controller: SharePublicController;

  beforeEach(async () => {
    vi.clearAllMocks();

    module = await Test.createTestingModule({
      controllers: [SharePublicController],
      providers: [
        {
          provide: ShareService,
          useValue: mocks.shareService,
        },
      ],
    }).compile();

    controller = module.get(SharePublicController);
  });

  it('类级别应标记为 Public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SharePublicController)).toBe(true);
  });

  it('应直接委托 ShareService.getPublicShare', async () => {
    const serviceResult = {
      workflowName: '公开工作流',
      definition: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    mocks.shareService.getPublicShare.mockResolvedValue(serviceResult);

    await expect(controller.getPublicShare(SHARE_TOKEN)).resolves.toEqual(serviceResult);
    expect(mocks.shareService.getPublicShare).toHaveBeenCalledWith(SHARE_TOKEN);
  });
});
