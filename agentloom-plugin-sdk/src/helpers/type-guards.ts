import {
  PLUGIN_PERMISSIONS,
  PORT_DATA_TYPES,
  type PluginManifest,
  type PluginPermission,
  type PortDataType,
} from '../types';
import { validateManifest } from '../validation';

/**
 * 判断值是否为合法端口数据类型。
 */
export function isPortDataType(value: unknown): value is PortDataType {
  return typeof value === 'string' && PORT_DATA_TYPES.includes(value as PortDataType);
}

/**
 * 判断值是否为合法插件权限。
 */
export function isValidPermission(value: unknown): value is PluginPermission {
  return typeof value === 'string' && PLUGIN_PERMISSIONS.includes(value as PluginPermission);
}

/**
 * 判断值是否为合法插件 manifest。
 */
export function isPluginManifest(value: unknown): value is PluginManifest {
  return validateManifest(value).valid;
}
