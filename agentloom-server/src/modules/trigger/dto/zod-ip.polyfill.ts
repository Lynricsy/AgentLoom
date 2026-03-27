import { isIP } from 'node:net';

import { ZodString } from 'zod';

function isValidIp(value: string): boolean {
  return isIP(value) !== 0;
}

type ZodStringIpMethod = (params?: string | { message?: string }) => ZodString;

const zodStringPrototype = ZodString.prototype as ZodString & {
  ip?: ZodStringIpMethod;
};

if (typeof zodStringPrototype.ip !== 'function') {
  zodStringPrototype.ip = function ip(
    params?: string | { message?: string },
  ): ZodString {
    const message =
      typeof params === 'string'
        ? params
        : (params?.message ?? '无效的 IP 地址');

    return this.refine(isValidIp, {
      message,
    });
  };
}
