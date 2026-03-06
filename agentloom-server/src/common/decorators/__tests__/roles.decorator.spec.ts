import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY, Roles } from '../roles.decorator';

class TestController {
  @Roles('owner', 'admin')
  updateMember() {
    return undefined;
  }
}

describe('Roles decorator', () => {
  it('writes required roles metadata to the handler', () => {
    const handler = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'updateMember',
    )?.value;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['owner', 'admin']);
  });
});
